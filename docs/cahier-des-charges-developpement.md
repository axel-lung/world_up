# Cahier des charges développement – World Up

Oct 19, 2026 · @Axel

## Périmètre

La version 1 est un site web responsive. Le jeu s'appelle World Up. Un joueur majeur y ouvre des paquets, collectionne les cartes de la collection « Patrimoine de France » et peut payer un abonnement ou un paquet à l'unité. Ce cahier s'adresse à un développeur, à une agence ou à Claude Code. Il complète le cahier des charges design et le projet Claude Design.

**Version 1 (lancement)**

- Comptes : e-mail et mot de passe, ou compte Google (décidé le 24 octobre 2026), vérification de l'e-mail, date de naissance (18 ans et plus), profil.
- Catalogue patrimoine importé et trié (environ 26 700 cartes avant tri).
- Paquets gratuits avec recharge, ouverture, collection, séries, fiche carte.
- Monnaie virtuelle gagnée en jeu : ouverture d'un paquet, revente d'un doublon, succès.
- Boutique : abonnement et paquet à l'unité (désactivable), plafond de dépenses, historique d'achats.
- Classement simple.
- Back-office : catalogue (masquer une carte, changer sa photo), signalements, joueurs, remboursements.
- Pages légales, probabilités, sources et crédits.
- Social, avancé de la version 2 le 22 octobre 2026 (voir « Social et marché ») : amis, collection d'un ami, échanges de cartes entre amis, enchères payées en pièces, notifications dans le site puis en push web.

**Version 2 (après le lancement)**

- Deuxième collection.
- Variante brillante et statistiques de jeu, si elles sont retenues.

Les échanges et les enchères passent avant les paiements (décision du 22 octobre 2026). Un marché entre joueurs demande une surveillance anti-fraude : le back-office montre les ventes et les échanges par joueur, et un interrupteur en base coupe les échanges ou les enchères sans redéployer.

**Hors périmètre** : une seconde interface, native (l'application Android du Play Store affiche le site lui-même, voir « Application Android »), NFT ou blockchain, toute conversion de la monnaie virtuelle en euros.

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
| Comptes | Auth.js ou Better Auth | E-mail, mot de passe, vérification, connexion Google, sessions sécurisées |
| Paiement | Stripe (Checkout, Billing, webhooks) | Abonnements, factures, remboursements, conformité carte bancaire |
| Images | Volume Docker « uploads », fichiers servis par l'application | Vignettes servies par nos soins, sans dépendre de Wikimedia |
| E-mails | Brevo ou Postmark | E-mails de vérification et reçus |
| Tâches de fond | File de tâches sur PostgreSQL (pg-boss), dans un conteneur worker | Imports du catalogue, e-mails, sans service en plus |
| Hébergement | Serveur existant situé dans l'UE : Docker Compose derrière Traefik | RGPD ; HTTPS et routage déjà en place |
| Suivi | Sentry pour les erreurs ; Matomo ou Plausible pour l'audience | Mesure d'audience sans traceur publicitaire |
| Tests | Vitest, Playwright | Tests unitaires et parcours complets |
| Pipeline catalogue | Scripts Python déjà écrits (dossier `scripts/`) | Extraction Wikidata et Commons déjà testée |

## Déploiement

Le site se déploie avec Docker Compose sur le serveur existant, derrière le Traefik déjà en place. Le fichier reprend la structure fournie ; « worldup » est le nom technique du projet, tiré du nom du jeu. Ajouts : le worker monte aussi le volume des images et le dossier d'import du catalogue, et le service web le dossier du fond de carte (`map/`, en lecture seule).

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
    # The card images, and the map's tiles and glyphs (map/README.md)
    volumes:
      - uploads:/app/uploads
      - ./map:/app/map:ro
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
- Un `.env.example` dans le dépôt, le vrai `.env` sur le serveur seulement : `APP_DOMAIN`, `POSTGRES_PASSWORD`, `DATABASE_URL` (hôte `worldup-db`, port 5432), `AUTH_SECRET`, `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` (connexion Google), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, la clé du service d'e-mails, `SENTRY_DSN`.
- Mise en production : `git pull`, puis `docker compose up -d --build`. Les migrations passent avant le redémarrage de web et worker, et Traefik n'envoie le trafic qu'à un conteneur en bonne santé.
- Sauvegardes : `./backups` garde 14 jours sur le serveur. Ajouter une copie quotidienne hors du serveur (par exemple rclone vers un stockage objet), sinon une panne du serveur emporte aussi les sauvegardes.
- Préproduction : une copie du fichier avec un autre `name`, d'autres noms de conteneurs et de routeur Traefik, et un autre `APP_DOMAIN`. Sans cela, les deux piles entrent en conflit sur le serveur.

### Application Android

Décidée le 2026-10-22. L'application du Play Store a d'abord été une Trusted Web Activity, qui ouvrait le site dans le navigateur du téléphone. Depuis le 12 novembre 2026, c'est une coquille native, construite avec Capacitor, dont la propre vue web affiche le site de production en plein écran : plus de navigateur entre le joueur et le jeu. Il n'y a toujours ni API ni seconde interface : le serveur est le même, un déploiement du site met l'application à jour, et la version web ne change pas.

- Identifiant `fr.alng.worldup`, pour le site `worldup.alng.fr`. Le projet Android (`android/`) est généré par Capacitor ; sa configuration est `capacitor.config.ts`.
- Un workflow GitHub Actions, lancé à la main, produit l'APK (à installer sur un téléphone) et le bundle AAB, que l'on dépose soi-même sur la Play Console. La clé d'envoi vit dans les secrets GitHub ; Google garde la clé de signature (Play App Signing). Le workflow peut viser la préproduction, pour essayer l'application avant un déploiement.
- Le site utilise les fonctions natives du téléphone là seulement où une vue web ne fait pas ce que fait un navigateur :
  - la connexion avec Google (décidée le 24 octobre 2026) : Google refuse sa page de connexion dans une vue web, l'application passe donc par la connexion Google du téléphone, qui donne au serveur un jeton d'identité vérifié comme le flux web ;
  - les notifications : une vue web n'a pas le push web, l'application les reçoit donc par Firebase Cloud Messaging, le service de notifications de Google, activées sur la page Activité comme sur le site ;
  - les liens du site (e-mails de confirmation et de mot de passe, fiches cartes partagées) s'ouvrent dans l'application, grâce à `/.well-known/assetlinks.json`, qui donne les empreintes des certificats de l'application (lues dans le .env du serveur) ;
  - hors connexion, une page fournie avec l'application le dit et propose de réessayer ; le bouton retour revient à la page précédente ;
  - les téléchargements (l'export des données du compte) : une vue web ne télécharge pas d'elle-même, l'application passe donc par le gestionnaire de téléchargements du téléphone, et le fichier arrive dans Téléchargements ;
  - les autres sites (Wikipédia, Commons, les licences) s'ouvrent dans un onglet par-dessus l'application, aux couleurs du jeu, qui se referme sur la partie, plutôt que dans le navigateur.
- Rien ne doit trahir la vue web (demandé le 16 novembre 2026) : ni zoom, ni surlignage au toucher, ni état « survolé » qui reste après un tap, ni sélection de texte avec sa barre Copier/Partager à l'appui long (les champs de saisie gardent la leur, pour coller), ni barre de défilement. Les commandes montrent leur propre état appuyé, et une barre court en haut de l'écran pendant qu'une page se charge. Le texte suit la taille de police choisie dans les réglages du téléphone, comme une application native. Les barres du téléphone (heure, navigation) prennent le fond de la page affichée : le thème choisi dans le jeu, la scène sombre de l'ouverture des paquets. L'écran de lancement montre le logo jusqu'à ce que le site soit affiché, plutôt qu'un écran vide sur une connexion lente.
- L'appui long sur l'icône de l'application propose « Ouvrir un paquet » (décidé le 22/11/2026), qui ouvre la page d'ouverture ; le site installé depuis un navigateur offre le même raccourci. Les vibrations passent par le module natif de l'application. Les deux demandent une nouvelle version de l'application.
- Une application iOS serait la même coquille : elle demanderait « Se connecter avec Apple » à côté de Google (règle de l'App Store).
- Avant de vendre dans l'application (lot 4) : Google Play impose sa facturation pour les biens numériques. Dans l'Espace économique européen, son programme de facturation alternative autorise un autre prestataire comme Stripe, contre une commission. À trancher avec l'avocat.
- Règles du Play Store : probabilités publiées avant l'achat, suppression du compte depuis l'application et depuis le web, questionnaire de classification (public de 18 ans et plus), fiche « Sécurité des données » (dont la position précise, demandée par « Je suis ici » et « Autour de moi », envoyée au serveur sans y être conservée).

## Modèle de données

Les tables de jeu portent un `collection_id` dès la version 1, pour accueillir d'autres collections sans migration lourde. Les règles chiffrées (probabilités, rythme de recharge, prix) sont des paramètres en base, jamais des constantes dans le code.

| Table | Champs clés | Remarques |
| --- | --- | --- |
| `users` | e-mail, hash du mot de passe, date de naissance, e-mail vérifié le, plafond de dépenses, banni le | Mot de passe haché en argon2id |
| `collections` | slug, nom, thème (tokens), active | Une ligne « patrimoine » au lancement |
| `cards` | identifiant Wikidata, nom, rareté, rang, région, département, famille, protection, UNESCO, extrait, URL de l'article, image, auteur, licence, URL de la licence, URL du fichier Commons, masquée, motif | La rareté est figée au lancement |
| `series`, `card_series` | type (région, famille, UNESCO, péril), nom ; numéro de la carte dans la série | Une carte appartient à plusieurs séries |
| `pack_state` | joueur, collection, paquets en réserve, dernière recharge ; série de jours (jours, dernier jour, jour pardonné, jours réparés, série remplacée le jour de sa rupture), rappel du soir (activé, dernier jour examiné) | Recharge et série calculées à la lecture |
| `pack_openings`, `pack_cards` | joueur, origine (gratuit, abonnement, bonus, achat), date, achat lié ; carte, position, nouvelle, souhaitée, brillante | Historique complet des tirages |
| `user_cards` | joueur, carte, quantité, première obtention | Une ligne par carte possédée |
| `wishlist_items` | joueur, collection, carte, date d'ajout | La liste de souhaits ; une carte obtenue en sort |
| `card_visits` | joueur, collection, carte, date et heure de la visite | Les monuments débloqués sur place, un par carte et par joueur ; jamais la position |
| `coin_ledger` | joueur, montant (+/-), motif, référence, date | Registre jamais modifié ; solde = somme |
| `rarity_odds` | collection, rareté, probabilité, valable à partir du | Historique publié sur la page Probabilités |
| `subscriptions` | joueur, identifiant Stripe, statut, fin de période, résiliation demandée | Mise à jour par les webhooks Stripe |
| `purchases` | joueur, produit, montant, identifiant de paiement Stripe, statut, renonciation à la rétractation (date et version du texte), remboursé le | Preuve de la renonciation |
| `consents` | joueur, document (CGU, CGV), version, date | Preuve des acceptations |
| `achievements`, `user_achievements` | succès, récompense ; date d'obtention | Source de monnaie virtuelle ; chaque succès obtenu est un badge |
| `featured_badges` | joueur, collection, succès | Le badge affiché à côté du pseudo, choisi parmi les siens |
| `announcements` | message, lien, ton, début, fin | Bandeau du site, écrit dans le back-office ; chaque publication est gardée |
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

1. **Monuments** : extraction Wikidata des monuments ayant un identifiant Mérimée et un statut classé, inscrit ou UNESCO, avec une photo et un article Wikipédia en français. On garde aussi leurs coordonnées (P625), avec leur précision : un seul point par monument, celui de rang préféré puis le plus précis, écarté s'il tombe hors du territoire du monument (métropole ou outre-mer). Elles sont reprises à chaque import, pour la carte des monuments et le déblocage sur place.
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
- Chaque ouverture d'un paquet gratuit rapporte des pièces : 5 par défaut, paramétrable, versées une fois par ouverture, même après un double clic.

**Série de jours** (décidée le 21/11/2026)

- Chaque jour (heure de Paris) où le joueur ouvre au moins un paquet allonge sa série d'un jour. Un jour manqué par semaine, du lundi au dimanche, ne la casse pas : il ne compte pas, mais la série continue. Un deuxième jour manqué dans la même semaine l'arrête : elle repart de un au paquet suivant.
- Réparation (décidée le 22/11/2026) : le jour où sa série s'arrête, et ce jour-là seulement, le joueur peut la réparer avec des pièces, tant par jour de série jusqu'à un prix maximum (10 et 1 000 par défaut, réglables dans le back-office et publiés sur `/rules`). Les jours manqués que la grâce de la semaine ne couvre pas sont alors « réparés » : ils ne comptent pas et ne cassent rien. Si un paquet a déjà été ouvert ce jour-là, la série qu'il a commencée rejoint la série réparée (et peut atteindre un palier). Les pièces de la réparation sortent du jeu ; une double demande ne les débite qu'une fois.
- Rappel du soir (décidé le 22/11/2026) : à 20 h, heure de Paris, une notification prévient le joueur dont la série d'au moins 2 jours s'arrête à minuit s'il n'ouvre pas de paquet. Il peut la couper depuis la page Activité.
- La série avance dans la transaction de l'ouverture, sous le même verrou. À un palier, des paquets bonus s'ajoutent à la réserve, même au-delà de son maximum (le minuteur attend alors, comme pour une réserve pleine). Paliers par défaut : 3, 7, 14, 30, 50, 100, 200, 365, 500 et 1000 jours, un paquet chacun ; ce sont des lignes en base, modifiables dans le back-office et publiées sur `/rules`.
- L'écran de la série (flamme, jours, semaine en cours, prochain palier, réparation le jour d'une rupture) s'affiche à la fin de la première ouverture du jour ; la flamme de l'accueil le rouvre.

**Monnaie virtuelle**

- Gains : ouverture d'un paquet gratuit (paramétrable), revente rapide d'un doublon (montant par rareté, paramétrable), succès, ventes aux enchères. Qu'un paquet payant rapporte aussi des pièces reviendrait à vendre de la monnaie virtuelle : à trancher avec l'avocat avant le lot 4.
- Dépenses : les enchères (leur commission sort du jeu) et la réparation de la série de jours (ses pièces sortent du jeu).
- Chaque mouvement est une ligne du registre ; le solde ne peut pas devenir négatif.
- Aucun achat, aucun retrait, aucun transfert hors du jeu : les pièces ne passent d'un joueur à un autre que par les enchères.

**Progression et classement**

- Progression par série = cartes différentes possédées / cartes visibles de la série, recalculée à chaque ouverture.
- Classement : nombre de cartes différentes ; à égalité, le plus de Légendaires passe devant, puis le plus d'Ultra rares, et ainsi de suite.
- Badges (décidés le 22/11/2026) : chaque succès obtenu donne un badge, un autocollant à l'icône de son type et à la couleur de son palier (son rang parmi les succès de son type, posé sur l'échelle des raretés). Le profil les montre tous, la collection d'un ami montre les siens, et le joueur en choisit un qui s'affiche à côté de son pseudo (classement, amis).
- Historique des ouvertures (décidé le 22/11/2026) : la page Paquets mène à la liste des paquets ouverts par le joueur, par jour, les plus récents d'abord, avec leurs cartes dans l'ordre de révélation et les nouvelles marquées. L'export des données du compte les contient tous.

**Liste de souhaits** (décidée le 22/11/2026)

- Le joueur ajoute à sa liste une carte visible qu'il n'a pas, d'un cœur posé sur la carte (sa collection, la collection d'un ami, la fiche de la carte) ; 100 cartes au plus par collection, une limite anti-abus du code comme celles des amis.
- Une carte obtenue quitte la liste, dans la transaction qui l'apporte (paquet, échange, enchère) ; l'ouverture d'un paquet annonce « Souhait exaucé ! ».
- La page de la liste (`/c/heritage/wishlist`) dit où trouver chaque carte : les ventes en cours et leur prix le plus bas, les amis qui l'ont (un lien propose l'échange). Le marché a un filtre « Ma liste de souhaits », l'accueil compte les cartes de la liste en vente.
- La mise en vente d'une carte prévient les joueurs qui la souhaitent (ni le vendeur, ni un joueur banni), une fois par jour et par carte au plus.
- Les amis voient la liste l'un de l'autre : la collection d'un ami compte ses souhaits que l'on possède, et la composition d'un échange place en premier, d'un cœur, les cartes que l'autre côté souhaite. La politique de confidentialité le dit ; l'export du compte contient la liste.

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

- Demande d'ami, ami accepté, offre reçue, acceptée, refusée ou expirée, mise dépassée, vente gagnée, conclue, invendue ou annulée ; réserve de paquets gratuits de nouveau pleine (ajoutée le 17 novembre 2026), une fois par remplissage après une ouverture ; carte de la liste de souhaits mise en vente (ajoutée le 22 novembre 2026).
- Écrites dans la transaction de l'événement ; une cloche dans l'en-tête compte les non-lues, `/activity` montre les 50 dernières. Effacées au bout de 90 jours.
- En push web dans un second temps, sur l'appareil où le joueur l'active (page Activité) ; se déconnecter les y coupe. Dans l'application Android, elles passent par Firebase Cloud Messaging, qui en voit le texte : la politique de confidentialité le dit. Depuis le 19 novembre 2026, elles n'arrivent que dans l'application (le push web reste dans le code, éteint), et l'application propose de les activer au joueur qui ne les reçoit pas, une fois après chaque connexion et après chaque mise à jour de l'application.

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
- L'ouverture de paquet et l'écran de la série de jours suivent `MobileB.dc.html` (écrans « B · Ouverture » et « B · Série ») du projet Claude Design « World Up Mobile UX » (`04a53348-44c8-4c9f-a3fb-f3a2faf6a706`).
- Sons et vibrations (décidés le 22/11/2026) : l'ouverture de paquet et l'écran de la série ont des sons, produits par le navigateur sans fichier, et des vibrations (celles du téléphone dans l'application). Un bouton de la scène d'ouverture et un choix du profil les coupent, sur l'appareil.
- Carte des monuments (décidée le 22/11/2026, maquette `Carte - Monuments.dc.html` du projet Claude Design `57936f5d-de5d-4211-aee8-9def1a24e9c9`) : la France par département, chacun coloré selon la part de ses monuments que le joueur possède (six paliers, de « Aucune » à « Complet »), les cinq départements d'outre-mer en encarts ; toucher un département ouvre sa feuille (progression, « Voir les cartes », « Zoomer »). En zoomant, chaque carte visible qui a des coordonnées est une épingle autocollant, possédée ou manquante (grisée, avec son nom et sa rareté, sans photo ni lien), les épingles proches regroupées en pastilles ; un filtre par rareté et « Il me manque », une vue en liste des monuments de la zone, du plus proche au plus loin. Le fond de carte vient d'OpenStreetMap, découpé en tuiles vectorielles servies par le site lui-même (aucun service de cartographie tiers), aux couleurs Organic. « Autour de moi » utilise la position de l'appareil dans le navigateur seulement : elle n'est pas envoyée au serveur. On y accède par une vignette du menu de l'accueil (famille « Ma collection »), la tête de la collection et la fiche d'une carte (« Voir sur la carte »).
- Déblocage sur place (décidé le 22/11/2026, maquettes `Carte - Je suis ici`, `Carte - Refus Je suis ici` et `Carte - Tampon profil acces` du même projet) : devant un monument, « Je suis ici » (sur sa fiche de la carte, ou sur la page de sa carte) envoie une seule fois la position de l'appareil ; le serveur la vérifie puis l'oublie, sans l'enregistrer ni la journaliser. Si elle est connue à ± 100 m ou mieux et à moins de 200 m du monument (distance élargie à la précision de ses coordonnées Wikidata, jusqu'à 2 km), le joueur reçoit un exemplaire de la carte, qui compte et s'échange comme une carte de paquet, avec le tampon « Visité » et sa date. Chaque monument ne se débloque qu'une fois par joueur, 5 par jour au plus (heure de Paris), et une visite qui suivrait la précédente plus vite qu'un avion (900 km/h, rayons déduits) attend le temps du trajet. Distance, précision et visites par jour sont des paramètres modifiables dans le back-office. Les refus (trop loin, position imprécise, déjà visité, limite du jour, trajet trop court, localisation refusée) ne comptent pas. Les visites sont privées : un ami en voit le nombre, jamais lesquelles ; le profil du joueur montre ses monuments et départements visités, avec une famille de badges « Visites » qu'il ne peut pas afficher à côté de son pseudo. La carte filtre les monuments visités, la collection a un onglet « Visitées ». Une position truquée sur Android ne peut pas être empêchée, seulement limitée par ces règles.
- Annonces (décidées le 22/11/2026) : le back-office publie un bandeau sous l'en-tête de toutes les pages du site (un message, un lien facultatif, un ton « information » ou « important », un début et une fin facultative). Un visiteur qui le ferme ne le revoit plus sur cet appareil.

**Pages et adresses**

| Adresse | Page | Accès |
| --- | --- | --- |
| `/` | Accueil visiteur | Public |
| `/signup`, `/login` | Comptes | Public |
| `/c/heritage` | Accueil joueur | Connecté |
| `/c/heritage/open` | Ouverture de paquet | Connecté |
| `/c/heritage/packs`, `/c/heritage/packs/history` | Réserve et probabilités, historique des ouvertures | Connecté |
| `/c/heritage/collection` | Collection et filtres | Connecté |
| `/c/heritage/map` | Carte des monuments (par département, puis les épingles) | Connecté |
| `/c/heritage/wishlist` | Liste de souhaits | Connecté |
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
| `/map/tiles/…`, `/map/fonts/…` | Tuiles et glyphes du fond de carte | Public, technique |

Les adresses sont en anglais, les textes de l'interface restent en français. La collection a pour slug `heritage` ; le slug d'une carte vient de son nom (par exemple `chateau-de-chambord`).

**Exigences**

- Les fiches cartes publiques montrent la photo, l'extrait et les crédits : elles amènent des visiteurs depuis les moteurs de recherche.
- Temps d'affichage du contenu principal (LCP) sous 2,5 s sur mobile en 4G ; images WebP en chargement différé.
- Ouverture de paquet de 3 s au plus, passable ; simple fondu si le système demande moins d'animations.
- Accessibilité WCAG 2.1 niveau AA, sauf le zoom : il est désactivé partout, sur le site comme dans l'application (décidé le 21 novembre 2026). Dans l'application, le texte suit toujours la taille de police choisie dans les réglages du téléphone.
- Textes en français, regroupés dans des fichiers de traduction pour pouvoir traduire plus tard.

## Sécurité, données personnelles et hébergement

Le site est hébergé dans l'Union européenne et ne collecte que l'e-mail, la date de naissance et l'historique d'achats (et, pour un joueur qui se connecte avec Google, l'identifiant de son compte Google).

**Sécurité**

- Mots de passe hachés en argon2id ; limite de tentatives de connexion ; vérification de l'e-mail avant tout achat.
- Connexion avec Google en option (OAuth, portées `openid` et `email` seulement : ni nom ni photo). L'inscription avec Google demande d'abord le pseudo, la date de naissance (18 ans et plus) et l'acceptation des CGU, vérifiés par le serveur avant de partir chez Google ; une connexion Google ne crée jamais de compte seule. L'adresse confirmée par Google sert d'e-mail vérifié ; une adresse qui a déjà un compte confirmé s'y rattache. Aucun jeton de Google n'est conservé. Un joueur inscrit avec Google peut se créer un mot de passe par « Mot de passe oublié ».
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
- [ ] La série de jours compte un jour par jour d'ouverture, même pour deux ouvertures simultanées, pardonne un seul jour manqué par semaine et ajoute ses paquets bonus à un palier, au-delà de la réserve maximale (test avec une horloge simulée).

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

Le développement avance en cinq lots, chacun livré en préproduction et validé avant le suivant. Les paiements n'arrivent qu'au lot 4, après l'avis de l'avocat. Le volet social, avancé le 22 octobre 2026, passe avant le lot 4, en quatre étapes validées chacune en préproduction : amis et notifications, échanges, enchères, push web. Le 25 octobre 2026, le lot 4 est mis de côté : la bêta fermée du lot 5 ouvre avec un jeu entièrement gratuit, et les paiements viendront plus tard, toujours après l'avis de l'avocat. D'ici là, les points « Paiements » de la recette attendent. La bêta n'a pas de barrière à l'inscription (l'adresse n'est donnée qu'aux testeurs), et la production garde `NOINDEX=1` jusqu'à l'ouverture au public.

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
