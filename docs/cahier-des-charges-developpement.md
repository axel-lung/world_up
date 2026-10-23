# Cahier des charges développement – World Up

Oct 19, 2026 · @Axel

## Périmètre

La version 1 est un site web responsive. Le jeu s'appelle World Up. Un joueur majeur y ouvre des paquets, collectionne les cartes de la collection « Patrimoine de France » et peut payer un abonnement ou un paquet à l'unité. Ce cahier s'adresse à un développeur, à une agence ou à Claude Code. Il complète le cahier des charges design et le projet Claude Design.

**Version 1 (lancement)**

- Comptes : e-mail et mot de passe, vérification de l'e-mail, date de naissance (18 ans et plus), profil.
- Catalogue patrimoine importé et trié (environ 26 700 cartes avant tri).
- Paquets gratuits avec recharge, ouverture, collection, séries, fiche carte.
- Monnaie virtuelle gagnée en jeu : revente d'un doublon, succès.
- Boutique : abonnement et paquet à l'unité (désactivable), plafond de dépenses, historique d'achats.
- Classement simple.
- Back-office : catalogue (masquer une carte, changer sa photo), signalements, joueurs, remboursements.
- Pages légales, probabilités, sources et crédits.
- Social, avancé de la version 2 le 22 octobre 2026 (voir « Social et marché ») : amis, collection d'un ami, échanges de cartes entre amis, enchères payées en pièces, notifications dans le site puis en push web.

**Version 2 (après le lancement)**

- Deuxième collection.
- Variante brillante et statistiques de jeu, si elles sont retenues.

Les échanges et les enchères passent avant les paiements (décision du 22 octobre 2026). Un marché entre joueurs demande une surveillance anti-fraude : le back-office montre les ventes et les échanges par joueur, et un interrupteur en base coupe les échanges ou les enchères sans redéployer.

**Hors périmètre** : application mobile native (l'application Android du Play Store est le site lui-même, voir « Application Android »), NFT ou blockchain, toute conversion de la monnaie virtuelle en euros.

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

Le site se déploie avec Docker Compose sur le serveur existant, derrière le Traefik déjà en place. Le fichier reprend la structure fournie ; « worldup » est le nom technique du projet, tiré du nom du jeu. Seul ajout : le worker monte aussi le volume des images et le dossier d'import du catalogue.

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

### Application Android

Décidée le 2026-10-22. L'application du Play Store est une Trusted Web Activity : une coquille Android qui ouvre le site de production en plein écran dans le navigateur du téléphone, sans barre d'adresse. Il n'y a ni API ni seconde interface : le serveur ne change pas, et un déploiement du site met l'application à jour.

- Identifiant `fr.alng.worldup`, pour le site `worldup.alng.fr`. Le projet Android (`android/`) est généré par Bubblewrap, l'outil de Google.
- Un workflow GitHub Actions, lancé à la main, produit l'APK (à installer sur un téléphone) et le bundle AAB, que l'on dépose soi-même sur la Play Console. La clé d'envoi vit dans les secrets GitHub ; Google garde la clé de signature (Play App Signing).
- Le site publie un manifeste web et `/.well-known/assetlinks.json`, qui donne les empreintes des certificats de l'application (lues dans le .env du serveur) : sans lui, l'application affiche la barre d'adresse.
- La délégation des notifications est active dès la première version : les notifications web du site, quand elles existeront, s'afficheront comme celles de l'application, sans la republier.
- Avant de vendre dans l'application (lot 4) : Google Play impose sa facturation pour les biens numériques. Dans l'Espace économique européen, son programme de facturation alternative autorise un autre prestataire comme Stripe, contre une commission. À trancher avec l'avocat.
- Règles du Play Store : probabilités publiées avant l'achat, suppression du compte depuis l'application et depuis le web, questionnaire de classification (public de 18 ans et plus), fiche « Sécurité des données ».

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

Le volet social ajoute ces tables :

| Table | Champs clés | Remarques |
| --- | --- | --- |
| `friendships` | demandeur, destinataire, statut (en attente, acceptée), dates | Une ligne par paire, sans collection : l'amitié vaut pour tout le jeu |
| `trades`, `trade_items` | collection, proposeur, destinataire, statut, clé d'idempotence, expiration ; côté, carte, quantité | Les joueurs passent à `null` à la suppression d'un compte : l'autre garde son historique |
| `auctions` | collection, vendeur, carte, mise de départ, achat immédiat, prix actuel, meneur et sa mise maximale, nombre de mises, statut, clé d'idempotence, fin, règlement | La mise maximale du meneur n'est jamais montrée aux autres |
| `bids` | vente, enchérisseur, mise maximale, clé d'idempotence, date | Historique des mises |
| `market_rules`, `market_prices` | interrupteurs des échanges et des enchères, expiration des offres, durées, commission, pas, prolongation, ventes en cours par joueur ; fourchette de prix par rareté | Règles réglables dans `/admin/rules` |
| `notifications` | joueur, collection, type, identifiants liés, lue le | Le texte est rendu à l'affichage ; effacées au bout de 90 jours |
| `push_subscriptions` | joueur, adresse du service push, clés | Une ligne par appareil, sans adresse IP ni navigateur |

## Catalogue : pipeline d'import

Le catalogue est produit hors ligne, puis importé en base. Le jeu n'appelle jamais Wikimedia pendant qu'on joue. Les scripts Python déjà écrits couvrent les étapes 1 à 3 et sont à reprendre dans le dépôt du projet.

1. **Monuments** : extraction Wikidata des monuments ayant un identifiant Mérimée et un statut classé, inscrit ou UNESCO, avec une photo et un article Wikipédia en français.
2. **Popularité et rareté** : visites des articles dans les fichiers « clickstream » de Wikipédia, sur 12 mois (et non 2 mois comme dans l'étude), puis classement et découpage selon les parts de chaque rareté.
3. **Photos** : taille, licence et auteur de chaque photo via l'API de Wikimedia Commons. Rejeter les photos de moins de 1 000 px, les licences GFDL ou GPL seules (elles exigent leur texte complet avec chaque copie) et les photos sous licence CC ou Art libre dont l'auteur ne peut pas être nommé ; choisir à la main une autre photo pour les cartes rares concernées. Le crédit reprend la ligne imposée par l'auteur s'il en donne une, sinon l'auteur, sinon la personne qui a déposé le fichier (hors robots de transfert).
4. **Extraits** : résumé de chaque article Wikipédia, stocké avec son numéro de révision et la mention CC BY-SA 4.0.
5. **Tri éditorial** : masquer par défaut les 94 lieux de mémoire et les 134 établissements commerciaux ; mettre les 956 monuments du XXᵉ siècle « à revoir » dans le back-office (date de décès de l'architecte) ; mettre aussi « à revoir » les 39 monuments situés dans un domaine national (Chambord, Versailles, l'Élysée, le Palais-Royal…), car l'usage commercial de leur image demande l'autorisation du gestionnaire du domaine (Code du patrimoine, art. L621-42 ; décrets de 2017, 2021, 2022 et 2024, liste à vérifier avant chaque mise à jour) ; photos de jour seulement pour la tour Eiffel.
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

- Gains : revente rapide d'un doublon (montant par rareté, paramétrable), succès, ventes aux enchères.
- Dépenses : les enchères seulement.
- Chaque mouvement est une ligne du registre ; le solde ne peut pas devenir négatif.
- Aucun achat, aucun retrait, aucun transfert hors du jeu : les pièces ne passent d'un joueur à un autre que par les enchères.

**Progression et classement**

- Progression par série = cartes différentes possédées / cartes visibles de la série, recalculée à chaque ouverture.
- Classement : nombre de cartes différentes ; à égalité, le plus de Légendaires passe devant, puis le plus d'Ultra rares, et ainsi de suite.

**Anti-abus**

- Limite de débit sur l'inscription, la connexion et l'ouverture de paquets.
- Détection des comptes multiples (même moyen de paiement, même adresse e-mail une fois normalisée ; pas d'empreinte d'appareil sans consentement) et bannissement depuis le back-office.

## Social et marché

Avancé de la version 2 le 22 octobre 2026, avant les paiements. Les règles chiffrées sont des paramètres en base (`market_rules`, `market_prices`), modifiables dans `/admin/rules`.

**Amis**

- Une demande par pseudo exact (sans tenir compte de la casse), ou depuis le classement. Une demande déjà reçue de la même personne vaut acceptation.
- Le destinataire accepte ou refuse ; un refus n'est pas annoncé au demandeur. Retirer un ami annule les offres d'échange en attente entre les deux joueurs.
- Limites anti-abus : 200 amis, 30 demandes en attente, 20 demandes par heure.
- Seuls les amis voient la collection d'un joueur, Légendaires comprises, avec un onglet « Il vous manque ».

**Réservations**

- Une carte proposée dans un échange ou mise en vente, et la mise maximale d'un meneur, restent à leur propriétaire mais ne peuvent servir ailleurs. Elles se calculent à la lecture : rien n'est rendu quand une offre expire ou qu'une mise est dépassée.
- La revente d'un doublon ne vend jamais un exemplaire réservé.
- Ordre des verrous, pour toute écriture qui prend des cartes ou des pièces : la ligne de l'offre ou de la vente, puis les lignes `user_cards` triées par joueur et par carte, puis les portefeuilles triés par joueur.

**Échanges entre amis**

- Des cartes contre des cartes, gratuitement, de 1 à 5 cartes de chaque côté. Toute carte s'échange, même le dernier exemplaire.
- Les cartes du proposeur sont réservées dès l'envoi ; celles de l'ami sont vérifiées à l'envoi, puis à l'acceptation.
- L'acceptation déplace les cartes dans les deux sens en une seule transaction, avec les succès des deux joueurs ; si une carte manque, elle est refusée et l'offre reste ouverte.
- Une offre expire après 48 heures. Pas de contre-offre : on refuse, puis on propose autre chose.

**Enchères**

- Enchère ascendante avec mise automatique : le joueur indique la mise maximale qu'il accepte de payer, et le serveur enchérit pour lui du minimum nécessaire. Le gagnant paie la deuxième mise maximale plus un pas, jamais plus que la sienne ; à égalité, la mise la plus ancienne l'emporte.
- Le pas vaut 5 % du prix, arrondi au-dessus, une pièce au moins. Une mise placée dans les 5 dernières minutes prolonge la vente de 5 minutes.
- Mise en vente : n'importe quelle carte disponible, même la dernière ; mise de départ dans la fourchette de la rareté (par défaut, de la valeur de revente d'un doublon à 100 fois cette valeur) ; achat immédiat facultatif ; durée de 24, 48 ou 72 heures ; 10 ventes en cours par joueur au plus. Le vendeur peut annuler tant que personne n'a enchéri.
- Une mise demande autant de pièces disponibles : le solde, moins les mises maximales des ventes que le joueur mène. Une mise au moins égale au prix d'achat immédiat achète la carte à ce prix, sur-le-champ.
- Une vente est finie à son heure de fin, réglée ou non. Le règlement se fait à l'affichage de la vente, ou par la tâche `market-settle` du worker, chaque minute. L'acheteur paie le prix ; le vendeur reçoit le prix moins une commission de 5 % (arrondie au-dessus), détruite pour que la masse de pièces ne fasse pas que grandir. Sans mise, la vente est invendue ; une carte masquée entre-temps, ou un vendeur ou un meneur supprimé, l'annulent.
- Le marché montre les ventes en cours, avec des filtres (rareté, série, « Il me manque ») et un tri (fin proche, nouveautés, prix). Le pseudo du vendeur est public ; les enchérisseurs restent anonymes.
- Le back-office (`/admin/market`) liste les ventes et les échanges récents par pseudo, et annule une vente en cours, avec une trace dans le journal d'audit.

**Notifications**

- Demande d'ami, ami accepté, offre reçue, acceptée, refusée ou expirée, mise dépassée, vente gagnée, conclue, invendue ou annulée.
- Écrites dans la transaction de l'événement ; une cloche dans l'en-tête compte les non-lues, `/activity` montre les 50 dernières. Effacées au bout de 90 jours.
- En push web dans un second temps, sur l'appareil où le joueur l'active ; sur Android, l'application les affiche comme les siennes.

## Paiements et conformité

Stripe gère tous les paiements, et ses webhooks font foi : un paquet acheté n'est crédité qu'après confirmation du paiement par Stripe. Le montage doit être validé par un avocat avant l'ouverture des paiements.

**Paquet à l'unité**

- Interrupteur en base (feature flag) : on le désactive sans redéployer, et la boutique s'adapte.
- Avant le paiement, le serveur vérifie l'âge, l'e-mail vérifié et le plafond de dépenses du mois civil (achats et abonnement).
- La case de renonciation à la rétractation est obligatoire. Son texte, sa version et l'heure du clic sont enregistrés dans l'achat, et l'e-mail de confirmation d'achat la reprend : c'est la confirmation sur support durable que demande le Code de la consommation (art. L221-13 et L221-28).
- Traitement des webhooks idempotent : un même événement reçu deux fois ne crédite qu'une fois.

**Abonnement**

- Stripe Billing, renouvellement mensuel.
- Résiliation en 3 clics au plus depuis l'espace compte (bouton, confirmation, terminé), sans passer par un e-mail ou un support : une fonction « résilier votre contrat » au sens du décret n° 2023-417, suivie d'un e-mail qui confirme la résiliation et sa date d'effet.
- Date du prochain renouvellement et montant toujours affichés ; avantages actifs jusqu'à la fin de la période payée.

**Factures et remboursements**

- Factures Stripe accessibles dans l'historique d'achats.
- Mention de TVA selon le statut juridique retenu (par exemple « TVA non applicable, art. 293 B du CGI » en franchise de TVA).
- Remboursement depuis le back-office, avec retrait des avantages et trace dans le journal d'audit.
- Un médiateur de la consommation désigné avant la première vente, et nommé dans les CGV.

**Pour rester hors des jeux d'argent**

- Aucune valeur en argent : pas de rachat, pas de retrait, pas de vente de monnaie virtuelle, pas de transfert de compte.
- CGU qui interdisent la revente contre de l'argent, et bannissement en cas d'infraction.
- Probabilités publiques, avec leur historique.
- Pas de paquet payant pour les joueurs résidant en Belgique, où la commission des jeux de hasard assimile les « loot boxes » payantes à des jeux de hasard (à confirmer par l'avocat).
- Les échanges et les enchères rendent les cartes cessibles d'un compte à l'autre. Tant que tous les paquets sont gratuits, le joueur ne fait aucun « sacrifice financier » : pas de JONUM, d'où leur ouverture sans attendre l'avocat (décision du 22 octobre 2026). Des paquets payants feraient de ces cartes des « objets numériques monétisables » (loi SREN, art. 40 ; décret n° 2026-60), un régime soumis à déclaration auprès de l'ANJ : la combinaison des paquets payants et des cartes cessibles est à examiner avec l'avocat avant le lot 4.

**Pages obligatoires** : mentions légales, CGU et politique de confidentialité (écrites au lot 3 : elles doivent exister avant que le site ne s'ouvre à quiconque), CGV (lot 4), probabilités, sources et crédits. Les coordonnées de l'éditeur et de l'hébergeur viennent du fichier .env du serveur. Une nouvelle version des CGU est présentée au joueur à sa visite suivante, et il l'accepte pour continuer à jouer.

**Cookies** : sans traceur publicitaire et avec une mesure d'audience exemptée de consentement (configuration CNIL), un simple bandeau d'information suffit. Sinon, refuser doit être aussi simple qu'accepter.

## Interface

Le design de référence est le design system « World Up v2 » du [projet Claude Design](https://claude.ai/design/p/8508c819-0ec8-4bd5-86aa-690e24d1c0ad?file=Design+system+World+Up+v2.dc.html) : le socle Organic (crème, terracotta, sauge, Caprasimo et Figtree), avec des cartes traitées comme des autocollants. Thème clair par défaut, thème sombre conservé. Le développeur l'importe avec le serveur MCP de Claude Design (connexion par `/design-login` dans Claude Code), en partant de ces fichiers :

- `Design system World Up v2.dc.html`
- `CarteV2.dc.html` (la carte, importée par le fichier précédent)
- `_ds/organic-31cdf777-e85b-4a4e-bbaa-571dde5117fd/_ds_bundle.js`
- `_ds/organic-31cdf777-e85b-4a4e-bbaa-571dde5117fd/styles.css`
- `support.js`

La première version (`Design system World Up.dc.html`, socle Nocturne) est remplacée.

**Intégration**

- Les tokens du design system deviennent des variables CSS, en thème clair et sombre.
- Chaque composant (carte, bouton, badge, jauge, minuteur, fenêtre d'achat) devient un composant React, avec les mêmes variantes et états que dans Claude Design.
- L'habillage d'une collection (sa couleur et son emblème, sur le paquet et en pied de carte) est lu dans `collections.theme` : ajouter une collection ne demande pas de nouveau code d'interface.

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
| `/c/heritage/friends/[pseudo]` | Collection d'un ami | Amis seulement |
| `/c/heritage/trades`, `/c/heritage/trades/new`, `/c/heritage/trades/[id]` | Offres d'échange, composition, détail | Connecté |
| `/c/heritage/market`, `/c/heritage/market/[id]`, `/c/heritage/market/sell`, `/c/heritage/market/mine` | Marché, vente, mise en vente, mes ventes et mes mises | Connecté |
| `/friends`, `/activity` | Amis, notifications | Connecté |
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
- Conservation : inscription dont l'adresse n'est jamais confirmée supprimée après 30 jours ; compte inactif supprimé après 3 ans, 30 jours après un e-mail de prévenance (tâche quotidienne du worker) ; pièces comptables gardées 10 ans, comme l'exige la loi.
- Contrats de sous-traitance signés avec l'hébergeur, Stripe et le service d'e-mails.
- Les journaux d'accès de Traefik, s'ils sont activés, contiennent les adresses IP : durée de conservation à fixer et à indiquer dans la politique de confidentialité.
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

**Social et marché**

- [ ] Seuls les amis voient la collection d'un joueur.
- [ ] Une carte proposée dans un échange ou mise en vente ne se revend pas et ne se promet pas deux fois.
- [ ] Un échange accepté déplace les cartes dans les deux sens, en une transaction, même un dernier exemplaire ; une offre expire après 48 heures.
- [ ] Une mise ne dépasse jamais les pièces disponibles, même avec deux mises simultanées ; le meneur paie la deuxième mise maximale plus un pas.
- [ ] Une vente réglée deux fois n'écrit qu'une fois au registre ; la commission est retenue ; une carte masquée ou un joueur supprimé annule la vente.

**Cartes et crédits**

- [ ] Chaque carte affiche l'auteur et la licence de sa photo, avec un lien vers le fichier Commons et vers le texte de la licence.
- [ ] Aucune carte d'un domaine national n'est visible sans l'autorisation de son gestionnaire (ou l'avis de l'avocat).
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
- [ ] Un joueur qui n'a pas accepté la version en vigueur des CGU l'accepte avant de rejouer ; son compte reste accessible.

**Qualité**

- [ ] Score Lighthouse mobile d'au moins 90 en performance et 95 en accessibilité sur une fiche carte.
- [ ] Thèmes clair et sombre conformes au design system, sur mobile et ordinateur.

**Déploiement**

- [ ] Sur le serveur, `docker compose up -d --build` démarre la base, passe les migrations, puis lance web et worker.
- [ ] Traefik ne route vers worldup-web qu'une fois `/api/health` au vert, en HTTPS sur `APP_DOMAIN`.
- [ ] La sauvegarde de la veille se restaure dans une base vide, et sa copie hors du serveur existe.

## Lots de livraison et questions ouvertes

Le développement avance en cinq lots, chacun livré en préproduction et validé avant le suivant. Les paiements n'arrivent qu'au lot 4, après l'avis de l'avocat. Le volet social, avancé le 22 octobre 2026, passe avant le lot 4, en quatre étapes validées chacune en préproduction : amis et notifications, échanges, enchères, push web.

1. **Fondations** : dépôt, Docker Compose derrière Traefik, base de données, comptes, design system intégré, intégration continue.
2. **Catalogue** : pipeline d'import, tri éditorial, back-office du catalogue, fiches cartes publiques.
3. **Jeu** : recharge et ouverture de paquets, collection, séries, monnaie virtuelle, classement, mentions légales, CGU et politique de confidentialité.
4. **Paiements** : boutique, Stripe, abonnement, plafond de dépenses, CGV.
5. **Lancement** : bêta fermée avec quelques dizaines de joueurs, corrections, ouverture au public.

La version 2 (deuxième collection, variante brillante, statistiques) fera l'objet d'un cahier à part.

**Questions ouvertes**

- Prix de l'abonnement et du paquet à l'unité, et avantages exacts de l'abonnement.
- Statut juridique (micro-entreprise ou société) : il conditionne Stripe, la TVA et les mentions légales.
- Domaines nationaux : demander l'autorisation des gestionnaires (Centre des monuments nationaux, établissements publics de Chambord, de Versailles…), ou faire confirmer par l'avocat que l'exception culturelle de l'article L621-42 couvre le jeu.
- Disponibilité des noms « World Up » et « Patrimoine de France » comme marques (INPI, EUIPO).
- Statistiques de jeu sur les cartes et variante brillante : oui ou non ?
- Qui développe : un prestataire, un freelance, ou toi avec Claude Code ?
