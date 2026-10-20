# Cahier des charges développement – Patrimoine de France

Oct 19, 2026 · @Axel

## Périmètre

La version 1 est un site web responsive. Un joueur majeur y ouvre des paquets, collectionne les cartes « Patrimoine de France » et peut payer un abonnement ou un paquet à l'unité. Ce cahier s'adresse à un développeur, à une agence ou à Claude Code. Il complète le cahier des charges design et le projet Claude Design.

**Version 1 (lancement)**

- Comptes : e-mail et mot de passe, vérification de l'e-mail, date de naissance (18 ans et plus), profil.
- Catalogue patrimoine importé et trié (environ 26 700 cartes avant tri).
- Paquets gratuits avec recharge, ouverture, collection, séries, fiche carte.
- Monnaie virtuelle gagnée en jeu : revente d'un doublon, succès.
- Boutique : abonnement et paquet à l'unité (désactivable), plafond de dépenses, historique d'achats.
- Classement simple.
- Back-office : catalogue (masquer une carte, changer sa photo), signalements, joueurs, remboursements.
- Pages légales, probabilités, sources et crédits.

**Version 2 (après le lancement)**

- Échanges entre joueurs, marché aux enchères, amis.
- Deuxième collection.
- Variante brillante et statistiques de jeu, si elles sont retenues.

Recommandation : garder les échanges pour la version 2. Le lancement est plus rapide, et un marché entre joueurs demande une surveillance anti-fraude.

**Hors périmètre** : application mobile native, NFT ou blockchain, toute conversion de la monnaie virtuelle en euros.

## Architecture

[Schéma non inclus dans ce fichier : architecture de la version 1 · 5 conteneurs Docker derrière Traefik]

Seul le conteneur worldup-web est exposé, par le Traefik déjà en place ; il sert le jeu, la boutique et le back-office. Le catalogue est préparé hors ligne puis importé : en production, aucune page ne dépend de Wikimedia.

## Choix techniques recommandés

Une seule application TypeScript, une base PostgreSQL et Stripe suffisent pour la version 1. Chaque choix ci-dessous peut être remplacé par un équivalent, à condition de respecter la colonne « Pourquoi ».

| Besoin | Choix recommandé | Pourquoi |
| --- | --- | --- |
| Site et API | Next.js (React, TypeScript) | Un seul code pour les pages et l'API ; pages de cartes publiques bien référencées par Google |
| Base de données | PostgreSQL 16 en conteneur Docker | Transactions et verrous pour les paquets et les paiements |
| Accès aux données | Prisma ou Drizzle | Schéma typé et migrations versionnées |
| Comptes | Auth.js ou Better Auth | E-mail, mot de passe, vérification, sessions sécurisées |
| Paiement | Stripe (Checkout, Billing, webhooks) | Abonnements, factures, remboursements, conformité carte bancaire |
| Images | Volume Docker « uploads », fichiers servis par l'application | Vignettes servies par nos soins, sans dépendre de Wikimedia |
| E-mails | Brevo ou Postmark | E-mails de vérification et reçus |
| Tâches de fond | File de tâches sur PostgreSQL (pg-boss), dans un conteneur worker | Imports du catalogue, e-mails, sans service en plus |
| Hébergement | Serveur existant situé dans l'UE : Docker Compose derrière Traefik | RGPD ; HTTPS et routage déjà en place |
| Suivi | Sentry pour les erreurs ; Matomo ou Plausible pour l'audience | Mesure d'audience sans traceur publicitaire |
| Tests | Vitest, Playwright | Tests unitaires et parcours complets |
| Pipeline catalogue | Scripts Python déjà écrits (dossier `scripts/`) | Extraction Wikidata et Commons déjà testée |

## Déploiement

Le site se déploie avec Docker Compose sur le serveur existant, derrière le Traefik déjà en place. Le fichier reprend la structure fournie ; « worldup » est un nom de projet provisoire, à remplacer partout quand le nom du jeu sera fixé. Seul ajout : le worker monte aussi le volume des images et le dossier d'import du catalogue.

```yaml
# Fixed project name: volumes and the internal network are prefixed with
# "worldup" whatever the folder the repo is cloned into.
name: worldup

services:
  worldup-db:
    container_name: worldup-db
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: worldup
      POSTGRES_USER: worldup
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U worldup -d worldup"]
      interval: 5s
      retries: 10

  worldup-migrate:
    container_name: worldup-migrate
    image: worldup-app
    build: .
    command: ["node", "migrate.js"]
    env_file: .env
    depends_on:
      worldup-db: { condition: service_healthy }

  # Only service exposed: served by the Traefik already running on the server
  # (external "traefik" network, "websecure" entrypoint, "myresolver" ACME).
  worldup-web:
    container_name: worldup-web
    image: worldup-app
    restart: unless-stopped
    env_file: .env
    volumes:
      - uploads:/app/uploads
    labels:
      - "traefik.enable=true"
      # worldup-web is on two networks: tell Traefik which one reaches it
      - "traefik.docker.network=traefik"
      - "traefik.http.routers.worldup.rule=Host(`${APP_DOMAIN:?APP_DOMAIN manquant dans .env}`)"
      - "traefik.http.routers.worldup.entrypoints=websecure"
      - "traefik.http.routers.worldup.tls=true"
      - "traefik.http.routers.worldup.tls.certresolver=myresolver"
      - "traefik.http.services.worldup.loadbalancer.server.port=3000"
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      # Traefik only routes to a healthy container: check every 2 s at startup
      # instead of waiting 30 s after each deploy (Docker Engine 25+).
      start_period: 30s
      start_interval: 2s
    depends_on:
      worldup-migrate: { condition: service_completed_successfully }
    networks:
      - default
      - traefik

  worldup-worker:
    container_name: worldup-worker
    image: worldup-app
    restart: unless-stopped
    command: ["node", "worker.js"]
    env_file: .env
    # The catalogue import writes the card images and reads the export folder.
    volumes:
      - uploads:/app/uploads
      - ./import:/app/import:ro
    # Time for the run in progress to finish on a stop (an e-mail waits 10 s at most).
    stop_grace_period: 30s
    depends_on:
      worldup-migrate: { condition: service_completed_successfully }

  worldup-backup:
    container_name: worldup-backup
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      PGPASSWORD: ${POSTGRES_PASSWORD}
    volumes: [./backups:/backups]
    entrypoint: ["/bin/sh", "-c", "while true; do pg_dump -h worldup-db -U worldup -Fc worldup > /backups/worldup-$$(date +%F).dump; find /backups -name '*.dump' -mtime +14 -delete; sleep 86400; done"]
    depends_on:
      worldup-db: { condition: service_healthy }

volumes:
  pgdata:
  uploads:

networks:
  traefik:
    name: traefik
    external: true
```

**Ce que le code doit fournir pour ce fichier**

- Un seul `Dockerfile` multi-étapes (Node 22 Alpine, sortie `standalone` de Next.js) qui produit l'image `worldup-app`, utilisée par migrate, web et worker. Le `wget` d'Alpine sert au healthcheck.
- `migrate.js` applique les migrations puis s'arrête avec le code 0 ; web et worker attendent sa réussite.
- `worker.js` fait tourner la file pg-boss (imports du catalogue, e-mails) et termine la tâche en cours en moins de 30 s quand il reçoit l'ordre d'arrêt.
- `/api/health` répond 200 quand l'application et la base répondent ; l'application écoute sur le port 3000.
- Les images des cartes vivent dans `/app/uploads` et sont servies par l'application avec un cache long (`Cache-Control: public, max-age=31536000, immutable`).
- Import du catalogue : le pipeline dépose son export dans `./import` sur le serveur, puis `docker compose exec worldup-worker node import-catalog.js` l'importe.
- Un `.env.example` dans le dépôt, le vrai `.env` sur le serveur seulement : `APP_DOMAIN`, `POSTGRES_PASSWORD`, `DATABASE_URL` (hôte `worldup-db`, port 5432), `AUTH_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, la clé du service d'e-mails, `SENTRY_DSN`.
- Mise en production : `git pull`, puis `docker compose up -d --build`. Les migrations passent avant le redémarrage de web et worker, et Traefik n'envoie le trafic qu'à un conteneur en bonne santé.
- Sauvegardes : `./backups` garde 14 jours sur le serveur. Ajouter une copie quotidienne hors du serveur (par exemple rclone vers un stockage objet), sinon une panne du serveur emporte aussi les sauvegardes.
- Préproduction : une copie du fichier avec un autre `name`, d'autres noms de conteneurs et de routeur Traefik, et un autre `APP_DOMAIN`. Sans cela, les deux piles entrent en conflit sur le serveur.

## Modèle de données

Les tables de jeu portent un `collection_id` dès la version 1, pour accueillir d'autres collections sans migration lourde. Les règles chiffrées (probabilités, rythme de recharge, prix) sont des paramètres en base, jamais des constantes dans le code.

| Table | Champs clés | Remarques |
| --- | --- | --- |
| `users` | e-mail, hash du mot de passe, date de naissance, e-mail vérifié le, plafond de dépenses, banni le | Mot de passe haché en argon2id |
| `collections` | slug, nom, thème (tokens), active | Une ligne « patrimoine » au lancement |
| `cards` | identifiant Wikidata, nom, rareté, rang, région, département, famille, protection, UNESCO, extrait, URL de l'article, image, auteur, licence, URL de la licence, URL du fichier Commons, masquée, motif | La rareté est figée au lancement |
| `series`, `card_series` | type (région, famille, UNESCO, péril), nom ; numéro de la carte dans la série | Une carte appartient à plusieurs séries |
| `pack_state` | joueur, collection, paquets en réserve, dernière recharge | Recharge calculée à la lecture |
| `pack_openings`, `pack_cards` | joueur, origine (gratuit, abonnement, bonus, achat), date, achat lié ; carte, position, nouvelle, brillante | Historique complet des tirages |
| `user_cards` | joueur, carte, quantité, première obtention | Une ligne par carte possédée |
| `coin_ledger` | joueur, montant (+/-), motif, référence, date | Registre jamais modifié ; solde = somme |
| `rarity_odds` | collection, rareté, probabilité, valable à partir du | Historique publié sur la page Probabilités |
| `subscriptions` | joueur, identifiant Stripe, statut, fin de période, résiliation demandée | Mise à jour par les webhooks Stripe |
| `purchases` | joueur, produit, montant, identifiant de paiement Stripe, statut, renonciation à la rétractation (date et version du texte), remboursé le | Preuve de la renonciation |
| `consents` | joueur, document (CGU, CGV), version, date | Preuve des acceptations |
| `achievements`, `user_achievements` | succès, récompense ; date d'obtention | Source de monnaie virtuelle |
| `reports` | joueur, carte, type, message, statut | Signalements de photo ou de texte |
| `audit_log` | administrateur, action, cible, date | Toute action du back-office |

En version 2 s'ajoutent `trades`, `trade_items`, `auctions`, `bids` et `friendships`.

## Catalogue : pipeline d'import

Le catalogue est produit hors ligne, puis importé en base. Le jeu n'appelle jamais Wikimedia pendant qu'on joue. Les scripts Python déjà écrits couvrent les étapes 1 à 3 et sont à reprendre dans le dépôt du projet.

1. **Monuments** : extraction Wikidata des monuments ayant un identifiant Mérimée et un statut classé, inscrit ou UNESCO, avec une photo et un article Wikipédia en français.
2. **Popularité et rareté** : visites des articles dans les fichiers « clickstream » de Wikipédia, sur 12 mois (et non 2 mois comme dans l'étude), puis classement et découpage selon les parts de chaque rareté.
3. **Photos** : taille, licence et auteur de chaque photo via l'API de Wikimedia Commons. Rejeter les photos de moins de 1 000 px et les licences GFDL seule ; choisir à la main une autre photo pour les cartes rares concernées.
4. **Extraits** : résumé de chaque article Wikipédia, stocké avec son numéro de révision et la mention CC BY-SA 4.0.
5. **Tri éditorial** : masquer par défaut les 94 lieux de mémoire et les 134 établissements commerciaux ; mettre les 956 monuments du XXᵉ siècle « à revoir » dans le back-office (date de décès de l'architecte) ; photos de jour seulement pour la tour Eiffel.
6. **Images** : télécharger chaque photo une fois, produire des versions WebP de 400 et 800 px, les déposer dans le volume « uploads ». Pas de lien direct vers Commons en production.
7. **Import** : mise à jour par identifiant Wikidata, rejouable sans doublon. Les raretés sont figées au lancement ; seul le back-office peut en changer une, avec une trace.
8. **Mise à jour** : tous les 6 mois, pour ajouter de nouveaux monuments ou de meilleures photos, sans changer la rareté des cartes existantes.

**Règles d'accès à Wikimedia** : un User-Agent avec une adresse de contact (sinon la limite tombe à 10 requêtes par minute), 3 requêtes en parallèle au plus, et respect de l'en-tête `Retry-After`.

## Règles métier

Toute la logique de jeu s'exécute sur le serveur : le navigateur affiche, il ne décide jamais du contenu d'un paquet, d'un minuteur ou d'un solde.

**Recharge des paquets**

- Calcul à la lecture, sans tâche planifiée : paquets = min(réserve maximale, paquets stockés + nombre d'intervalles écoulés depuis la dernière recharge). La date de dernière recharge avance d'autant d'intervalles.
- Valeurs par défaut : 10 paquets à l'inscription, 1 paquet toutes les 10 minutes, 10 en réserve. Les abonnés ont leurs propres valeurs (à définir), lues en base.
- Seule l'heure du serveur compte.

**Ouverture d'un paquet**

- Une seule transaction SQL, avec un verrou par joueur : retrait d'un paquet, création de l'ouverture et de ses 5 cartes, mise à jour de la collection.
- Une clé d'idempotence envoyée par le client : un double clic n'ouvre qu'un paquet.
- Tirage de chaque carte en deux temps, avec un générateur cryptographique (`crypto.randomInt`) : une rareté selon les probabilités publiées, puis une carte au hasard parmi les cartes visibles de cette rareté.
- Probabilités par défaut = part de chaque rareté dans le catalogue (0,25 % pour Légendaire…). Toute modification est datée, conservée et publiée.
- Une carte masquée (lieu de mémoire, photo à revoir…) ne sort jamais d'un paquet.
- Les doublons sont conservés (quantité + 1).

**Monnaie virtuelle**

- Gains : revente rapide d'un doublon (montant par rareté, paramétrable), succès.
- Chaque mouvement est une ligne du registre ; le solde ne peut pas devenir négatif.
- Aucun achat, aucun retrait, aucun transfert hors du jeu.

**Progression et classement**

- Progression par série = cartes différentes possédées / cartes visibles de la série, recalculée à chaque ouverture.
- Classement : nombre de cartes différentes ; à égalité, le plus de Légendaires passe devant, puis le plus d'Ultra rares, et ainsi de suite.

**Anti-abus**

- Limite de débit sur l'inscription, la connexion et l'ouverture de paquets.
- Détection des comptes multiples (même moyen de paiement, même adresse e-mail une fois normalisée ; pas d'empreinte d'appareil sans consentement) et bannissement depuis le back-office.

**Échanges (version 2)** : les cartes et la monnaie d'une offre sont réservées jusqu'à la réponse ; l'offre expire après 48 heures ; l'échange se fait en une seule transaction.

## Paiements et conformité

Stripe gère tous les paiements, et ses webhooks font foi : un paquet acheté n'est crédité qu'après confirmation du paiement par Stripe. Le montage doit être validé par un avocat avant l'ouverture des paiements.

**Paquet à l'unité**

- Interrupteur en base (feature flag) : on le désactive sans redéployer, et la boutique s'adapte.
- Avant le paiement, le serveur vérifie l'âge, l'e-mail vérifié et le plafond de dépenses du mois civil (achats et abonnement).
- La case de renonciation à la rétractation est obligatoire. Son texte, sa version et l'heure du clic sont enregistrés dans l'achat.
- Traitement des webhooks idempotent : un même événement reçu deux fois ne crédite qu'une fois.

**Abonnement**

- Stripe Billing, renouvellement mensuel.
- Résiliation en 3 clics au plus depuis l'espace compte (bouton, confirmation, terminé), sans passer par un e-mail ou un support.
- Date du prochain renouvellement et montant toujours affichés ; avantages actifs jusqu'à la fin de la période payée.

**Factures et remboursements**

- Factures Stripe accessibles dans l'historique d'achats.
- Mention de TVA selon le statut juridique retenu (par exemple « TVA non applicable, art. 293 B du CGI » en franchise de TVA).
- Remboursement depuis le back-office, avec retrait des avantages et trace dans le journal d'audit.

**Pour rester hors des jeux d'argent**

- Aucune valeur en argent : pas de rachat, pas de retrait, pas de vente de monnaie virtuelle, pas de transfert de compte.
- CGU qui interdisent la revente contre de l'argent, et bannissement en cas d'infraction.
- Probabilités publiques, avec leur historique.

**Pages obligatoires** : mentions légales, CGU, CGV, politique de confidentialité, probabilités, sources et crédits.

**Cookies** : sans traceur publicitaire et avec une mesure d'audience exemptée de consentement (configuration CNIL), un simple bandeau d'information suffit. Sinon, refuser doit être aussi simple qu'accepter.

## Interface

Le design de référence est le design system « World Up » du [projet Claude Design](https://claude.ai/design/p/8508c819-0ec8-4bd5-86aa-690e24d1c0ad?file=Design+system+World+Up.dc.html). Le développeur l'importe avec le serveur MCP de Claude Design (connexion par `/design-login` dans Claude Code), en partant de ces fichiers :

- `Design system World Up.dc.html`
- `_ds/nocturne-b271f891-2d45-439d-a64e-f628131cb069/_ds_bundle.js`
- `_ds/nocturne-b271f891-2d45-439d-a64e-f628131cb069/styles.css`
- `support.js`

**Intégration**

- Les tokens du design system deviennent des variables CSS, en thème clair et sombre.
- Chaque composant (carte, bouton, badge, jauge, minuteur, fenêtre d'achat) devient un composant React, avec les mêmes variantes et états que dans Claude Design.
- L'habillage d'une collection est lu dans `collections.theme` : ajouter une collection ne demande pas de nouveau code d'interface.

**Pages et adresses**

| Adresse | Page | Accès |
| --- | --- | --- |
| `/` | Accueil visiteur | Public |
| `/signup`, `/login` | Comptes | Public |
| `/c/heritage` | Accueil joueur | Connecté |
| `/c/heritage/open` | Ouverture de paquet | Connecté |
| `/c/heritage/collection` | Collection et filtres | Connecté |
| `/c/heritage/series/[slug]` | Série | Connecté |
| `/c/heritage/cards/[slug]` | Fiche carte | Public, référencée par Google |
| `/leaderboard` | Classement | Public |
| `/shop` | Abonnement et paquets | Connecté pour acheter |
| `/account` | Abonnement, plafond, achats, données | Connecté |
| `/rules`, `/odds`, `/credits` | Règles, probabilités, sources et crédits | Public |
| `/terms`, `/terms-of-sale`, `/legal-notice`, `/privacy` | CGU, CGV, mentions légales, confidentialité | Public |
| `/admin` | Back-office | Administrateurs, double authentification |
| `/api/health`, `/api/webhooks/stripe` | Santé de l'application (pour Traefik), webhooks Stripe | Technique |

Les adresses sont en anglais, les textes de l'interface restent en français. La collection a pour slug `heritage` ; le slug d'une carte vient de son nom (par exemple `chateau-de-chambord`).

**Exigences**

- Les fiches cartes publiques montrent la photo, l'extrait et les crédits : elles amènent des visiteurs depuis les moteurs de recherche.
- Temps d'affichage du contenu principal (LCP) sous 2,5 s sur mobile en 4G ; images WebP en chargement différé.
- Ouverture de paquet de 3 s au plus, passable ; simple fondu si le système demande moins d'animations.
- Accessibilité WCAG 2.1 niveau AA.
- Textes en français, regroupés dans des fichiers de traduction pour pouvoir traduire plus tard.

## Sécurité, données personnelles et hébergement

Le site est hébergé dans l'Union européenne et ne collecte que l'e-mail, la date de naissance et l'historique d'achats.

**Sécurité**

- Mots de passe hachés en argon2id ; limite de tentatives de connexion ; vérification de l'e-mail avant tout achat.
- Back-office réservé aux administrateurs, avec double authentification et journal d'audit.
- Secrets (clés Stripe, base de données) hors du code, dans le fichier .env du serveur, jamais dans le dépôt.
- Signature des webhooks Stripe vérifiée à chaque appel.
- Dépendances surveillées (alertes de sécurité automatiques).

**Données personnelles (RGPD)**

- Registre des traitements et politique de confidentialité à jour.
- Export et suppression du compte en libre-service depuis l'espace compte.
- Conservation : compte inactif supprimé après 3 ans, après un e-mail de prévenance ; pièces comptables gardées 10 ans, comme l'exige la loi.
- Contrats de sous-traitance signés avec l'hébergeur, Stripe et le service d'e-mails.
- Pas de données personnelles inutiles dans les journaux techniques.

**Exploitation**

- Sauvegarde quotidienne par le conteneur worldup-backup, conservée 14 jours sur le serveur et copiée hors du serveur ; une restauration testée avant le lancement.
- Trois environnements : développement, préproduction (Stripe en mode test, pile Compose séparée), production.
- Erreurs remontées dans Sentry, alertes en cas d'échec des webhooks ou des imports.

## Recette

La version 1 est acceptée quand tous ces points passent, de préférence sous forme de tests automatiques.

**Jeu**

- [ ] Un nouveau compte a 10 paquets ; un paquet de plus 10 minutes après une ouverture ; jamais plus de 10 en réserve (test avec une horloge simulée).
- [ ] Un double clic sur « Ouvrir » n'ouvre qu'un paquet.
- [ ] Sur 1 000 000 de tirages simulés, chaque rareté sort à ±0,05 point de sa probabilité publiée.
- [ ] Aucune carte masquée ne sort d'un paquet.
- [ ] Un doublon revendu crédite la monnaie une seule fois ; le solde ne devient jamais négatif.

**Cartes et crédits**

- [ ] Chaque carte affiche l'auteur et la licence de sa photo, avec un lien vers le fichier Commons.
- [ ] Chaque verso affiche l'extrait, le lien vers l'article et la mention « Texte : Wikipédia, licence CC BY-SA 4.0 ».
- [ ] Aucune image n'est chargée depuis un serveur Wikimedia en production.

**Paiements et compte**

- [ ] Impossible de payer sans cocher la renonciation à la rétractation.
- [ ] Un achat qui dépasserait le plafond du mois est refusé avant le paiement.
- [ ] Un webhook reçu deux fois ne crédite le paquet qu'une fois.
- [ ] La résiliation de l'abonnement prend 3 clics au plus.
- [ ] Désactiver le paquet à l'unité le retire de la boutique sans erreur ni trou dans la page.
- [ ] Inscription refusée sous 18 ans.
- [ ] Export et suppression du compte fonctionnent.

**Qualité**

- [ ] Score Lighthouse mobile d'au moins 90 en performance et 95 en accessibilité sur une fiche carte.
- [ ] Thèmes clair et sombre conformes au design system, sur mobile et ordinateur.

**Déploiement**

- [ ] Sur le serveur, `docker compose up -d --build` démarre la base, passe les migrations, puis lance web et worker.
- [ ] Traefik ne route vers worldup-web qu'une fois `/api/health` au vert, en HTTPS sur `APP_DOMAIN`.
- [ ] La sauvegarde de la veille se restaure dans une base vide, et sa copie hors du serveur existe.

## Lots de livraison et questions ouvertes

Le développement avance en cinq lots, chacun livré en préproduction et validé avant le suivant. Les paiements n'arrivent qu'au lot 3, après l'avis de l'avocat.

1. **Fondations** : dépôt, Docker Compose derrière Traefik, base de données, comptes, design system intégré, intégration continue.
2. **Catalogue** : pipeline d'import, tri éditorial, back-office du catalogue, fiches cartes publiques.
3. **Jeu** : recharge et ouverture de paquets, collection, séries, monnaie virtuelle, classement.
4. **Paiements** : boutique, Stripe, abonnement, plafond de dépenses, pages légales.
5. **Lancement** : bêta fermée avec quelques dizaines de joueurs, corrections, ouverture au public.

La version 2 (échanges, marché, deuxième collection) fera l'objet d'un cahier à part.

**Questions ouvertes**

- Le jeu s'appelle-t-il « World Up », comme le design system ?
- Prix de l'abonnement et du paquet à l'unité, et avantages exacts de l'abonnement.
- Statut juridique (micro-entreprise ou société) : il conditionne Stripe, la TVA et les mentions légales.
- Statistiques de jeu sur les cartes et variante brillante : oui ou non ?
- Qui développe : un prestataire, un freelance, ou toi avec Claude Code ?
