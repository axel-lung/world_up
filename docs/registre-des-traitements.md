# Registre des traitements – World Up

Version du 25 octobre 2026. Registre tenu par l'éditeur au titre de l'article 30 du RGPD, à présenter à la CNIL sur demande. Il décrit les traitements du code actuel ; le lot 4 (paiements) y ajoutera le sien.

**Responsable du traitement** : l'éditeur du site (coordonnées sur `/legal-notice`, à compléter selon le statut juridique retenu).
**Délégué à la protection des données** : aucun (non obligatoire). Contact pour les demandes : l'adresse `PUBLISHER_EMAIL`.

## 1. Comptes joueurs et jeu

| | |
| --- | --- |
| Finalité | Créer et gérer le compte, faire fonctionner le jeu (paquets, collection, pièces, succès), afficher le classement, vérifier la majorité |
| Base légale | Exécution du contrat (CGU) |
| Personnes | Joueurs majeurs |
| Données | E-mail, pseudo (public au classement), date de naissance, mot de passe haché (argon2id), version et date des CGU acceptées, historique de jeu (ouvertures, cartes, registre des pièces, succès), date de dernière activité, sessions (sans adresse IP ni navigateur) |
| Destinataires | Éditeur ; hébergeur (sous-traitant, Union européenne) |
| Transferts hors UE | Aucun |
| Conservation | Inscription non confirmée : 30 jours. Compte : jusqu'à sa suppression, ou 3 ans sans activité (e-mail de prévenance 30 jours avant). Sauvegardes : 14 jours |
| Sécurité | HTTPS, hachage argon2id, limites de tentatives, secrets hors du dépôt, sauvegardes quotidiennes |

## 2. Amis, échanges et enchères

| | |
| --- | --- |
| Finalité | Ajouter des amis et voir leur collection, échanger des cartes entre amis, vendre et acheter des cartes aux enchères contre des pièces, prévenir le joueur de ce qui le concerne (notifications), repérer les comptes qui se passent des cartes ou des pièces |
| Base légale | Exécution du contrat (CGU) ; intérêt légitime pour la détection des abus |
| Personnes | Joueurs majeurs |
| Données | Amis et demandes d'ami, offres d'échange (cartes, réponses), ventes (carte, prix, durée), mises (montant maximal, date), notifications (type, identifiants liés, date de lecture) |
| Visibilité | Collection visible des seuls amis ; pseudo du vendeur public au marché ; enchérisseurs anonymes |
| Destinataires | Éditeur ; hébergeur (sous-traitant, Union européenne) |
| Conservation | Jusqu'à la suppression du compte : l'autre joueur d'un échange ou d'une vente garde alors son historique, sans le pseudo. Notifications : 90 jours |

## 3. Notifications sur les appareils (push web)

| | |
| --- | --- |
| Finalité | Afficher les notifications du jeu sur les appareils où le joueur les active, même le site fermé |
| Base légale | Exécution du contrat (CGU) ; activation par le joueur, appareil par appareil |
| Personnes | Joueurs majeurs qui les activent |
| Données | Adresse attribuée à l'appareil par le service de push du navigateur, clés de chiffrement des messages, date d'activation (ni adresse IP, ni navigateur) ; contenu du message : texte de la notification, pseudo de l'autre joueur, nom de la carte |
| Destinataires | Éditeur ; hébergeur ; service de push du navigateur, qui remet le message à l'appareil (Google pour Chrome et Android, Mozilla pour Firefox, Apple pour Safari, Microsoft pour Edge), pour son propre compte |
| Transferts hors UE | Possibles, selon le navigateur : ces services sont établis aux États-Unis. Le contenu est chiffré pour l'appareil (RFC 8291) : ils ne voient que l'adresse de l'appareil et l'heure d'envoi |
| Conservation | Jusqu'à la désactivation sur l'appareil, la déconnexion de cet appareil, la réponse du service qu'il ne le connaît plus, ou la suppression du compte. Tâche d'envoi effacée une heure après |
| Sécurité | Seules les adresses des services de push des navigateurs sont acceptées ; adresse de l'appareil absente des journaux |

## 4. E-mails du compte

| | |
| --- | --- |
| Finalité | Confirmation de l'adresse, mot de passe oublié, alerte d'inscription avec une adresse connue, avertissement avant suppression d'un compte inactif |
| Base légale | Exécution du contrat |
| Données | E-mail, lien à usage unique |
| Destinataires | Brevo (sous-traitant, France) |
| Conservation | Tâche d'envoi effacée un jour après l'envoi ; journaux d'envoi de Brevo selon son contrat |
| Sécurité | Adresses masquées dans les journaux d'erreur |

## 5. Signalements sur les cartes

| | |
| --- | --- |
| Finalité | Corriger une photo ou un texte, retirer un contenu illicite |
| Base légale | Intérêt légitime (qualité et licéité du catalogue) |
| Données | Message du joueur, lien vers son compte |
| Conservation | Le signalement reste, détaché du compte, après la suppression de celui-ci |

## 6. Sécurité et prévention des abus

| | |
| --- | --- |
| Finalité | Limiter les tentatives de connexion et d'inscription, détecter les comptes multiples (adresse e-mail normalisée ; moyen de paiement au lot 4) |
| Base légale | Intérêt légitime |
| Données | Adresse IP, en mémoire du serveur web seulement, le temps de la fenêtre de limitation ; e-mail |
| Conservation | En mémoire ; journaux d'accès de Traefik : durée à fixer s'ils sont activés |

## 7. Back-office

| | |
| --- | --- |
| Finalité | Administrer le catalogue, les signalements et le marché, tracer chaque action |
| Base légale | Intérêt légitime |
| Personnes | Administrateurs |
| Données | Compte administrateur (double authentification), journal d'audit (action, cible, date) |
| Conservation | Journal d'audit : durée à fixer (proposition : 5 ans) |

## Cookies

Cookie de session (connexion, 30 jours au plus) et cookie `theme` (préférence d'affichage) : tous deux exemptés de consentement. Aucun traceur publicitaire ni mesure d'audience à ce jour (Matomo ou Plausible à choisir, en configuration exemptée).

## Contrats de sous-traitance à signer

- Hébergeur du serveur.
- Brevo (accord de traitement des données dans son interface).
- Stripe, au lot 4.
