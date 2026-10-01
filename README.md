# Blood on Breizh

Une application en français pour organiser les soirées Blood on the Clocktower, avec Next.js, Supabase Auth et PostgreSQL. Elle peut fonctionner en local avec Docker Compose et Mailpit, ou en production avec Vercel et Supabase hébergé. La pile locale décrite ci-dessous conserve ses comptes, ses données et ses e-mails sur la machine.

## Ouvrir le site

- Site : http://127.0.0.1:3000
- Boîte mail locale : http://127.0.0.1:54324
- Interface de la base (Supabase Studio) : http://127.0.0.1:55433
- API locale : http://127.0.0.1:54321
- PostgreSQL : 127.0.0.1:55432

Le compte organisateur d’exemple est **camille@cercle.test**. Clique sur « Se connecter », demande un code et récupère-le dans la boîte mail locale. Ce compte n’a pas de mot de passe. Les e-mails restent sur ta machine. Pour tester un nouveau joueur, utilise par exemple `nouveau@cercle.test`.

Les 4 sessions, 16 joueurs et adresses fournis sont fictifs. Les réservations, modifications et validations, elles, sont réellement enregistrées dans PostgreSQL. Le volume Docker `le-cercle-local_cercle-db` conserve ces données entre les redémarrages. Ne l’efface pas si tu veux garder tes modifications.

## Démarrer et arrêter

Prérequis : Docker Desktop lancé, Node.js 22 ou plus, pnpm. Le fichier `DEMARRER.ps1` prépare et lance l’ensemble sur Windows. Il garde le serveur du site au premier plan et démarre le traitement des notifications en arrière-plan. Ctrl+C arrête le site et ce traitement ; les conteneurs conservent la base.

Ou, depuis ce dossier :

```sh
pnpm install
pnpm local:setup
pnpm local:up
pnpm local:migrate
pnpm local:seed
pnpm dev
```

Dans un second terminal, pour les rappels, l’expiration des propositions et la livraison des notifications :

```sh
pnpm local:worker
```

Le worker traite la file toutes les minutes. Sans lui, les inscriptions et désistements restent opérationnels, mais les traitements programmés et les e-mails attendent sa reprise. Les nouvelles restent consultables dans « Mes participations ».

Pour arrêter les services Docker sans effacer les données : `pnpm local:stop`. Le site se limite à l’adresse de boucle locale, comme les ports de la base, du courrier et de Studio. Ne publie pas cette pile de développement sur Internet.

Les identifiants locaux sont générés automatiquement dans `.docker/` et `.env.docker`. `.env.local` configure l’application. Ces fichiers sont ignorés par Git. Le script refuse de remplacer une configuration Supabase distante.

## Fonctionnement

- Compte personnel, connexion par code e-mail valable 10 minutes. Cookies HttpOnly ; session conservée et limitée à 30 jours, limite aussi contrôlée dans la base.
- Sessions publiques ou réservées aux membres/parrainés, script, horaires en heure de Paris, lieu général et adresse privée.
- Toutes les soirées accueillent les débutants ; aucune catégorie découverte ni page bienvenue séparée.
- Inscription en cliquant sur un + autour de la Tour Tanguy. Le jeton choisi est conservé ; cliquer sur son jeton permet de se désister après confirmation. Une demande en attente ne réserve pas de jeton.
- Parties dépliables sur l’accueil et dans « Mes parties » : sièges, inscriptions et désistements restent sur la même page. Plusieurs cercles peuvent être ouverts ensemble.
- Événements limités aux informations pratiques, sans champ de description.
- Parties à partir de 7 joueurs ; capacité de 15 places par défaut, ajustable jusqu’à 20. Compteur des places réservées visible dans la liste des parties.
- Quotas membres/nouveaux et réunion des quotas avant la soirée.
- Pas de MJ désigné sur les parties : chaque personne peut se proposer dans son profil. Une petite icône de livre identifie les volontaires parmi les participants.
- Première participation des nouveaux soumise à validation. Validation puis inscription confirmée ou liste d’attente selon les places. L’organisateur peut aussi valider un membre directement.
- Parrainage à usage unique, valable 7 jours et limité à 5 invitations par jour. Le parrain n’accède jamais au compte de son invité.
- Désistement, liste d’attente chronologique par quota éligible, proposition réservée jusqu’à 12 heures (ou 30 minutes avant la session), acceptation explicite. Une proposition expirée est annulée pour permettre de passer au suivant.
- Notifications dans le site et par e-mail : confirmation, validation, proposition, désistement, changements, annulation et rappel à moins de 24 h.
- Création et modification de sessions, validation/retrait des participants, suspension des membres.
- Profil et couleur d’avatar, export iCalendar d’une participation confirmée, interface mobile et navigation clavier.

## Protection des données

Les droits sont vérifiés côté serveur et dans PostgreSQL (RLS). Les joueurs ne peuvent pas écrire directement dans les réservations ni modifier leur statut de membre. Les fonctions transactionnelles identifient toujours l’appelant via sa session ; elles n’acceptent aucun identifiant de joueur à usurper. Le verrouillage de chaque session empêche deux réservations concurrentes de dépasser les quotas.

L’adresse précise est dans une table distincte et accessible uniquement aux organisateurs et aux participants confirmés. Les e-mails ne sont pas exposés aux autres joueurs. Les invitations sont stockées sous forme d’empreinte ; le lien complet n’est affiché qu’à sa création.

La pile locale ne comporte pas de CAPTCHA externe : les limites d’envoi et de tentatives d’Auth, ainsi que les limites des actions en base, sont actives. La boîte mail locale et Studio sont des outils de développement sans authentification destinés à cette machine. Utilise des comptes fictifs.

## Vérifications

```sh
pnpm typecheck
pnpm test
pnpm build
node node_modules/tsx/dist/cli.mjs --env-file=.env.local tests/local-integration.ts
```

Les tests SQL couvrent les droits, l’identité, les quotas, les doublons, le parrainage, l’expiration de session et les désistements. Le test d’intégration utilise la vraie pile Docker, effectue des réservations simultanées et supprime uniquement ses propres données temporaires.

## Mise en ligne

1. Créer un dépôt avec ce dossier, sans `.env*`, `.docker/`, `node_modules/` ou `.next/`, puis l’importer dans Vercel (projet Next.js).
2. Appliquer les fichiers `supabase/migrations/` au projet Supabase distant avec le workflow GitHub décrit ci-dessous. Le premier lancement applique les quatre migrations ; les suivants appliquent seulement celles qui manquent. Les exemples locaux ne sont pas importés.
3. Renseigner les variables de `.env.example` dans Vercel. La clé de service reste côté serveur ; seule la clé publique peut avoir le préfixe `NEXT_PUBLIC_`.
4. Configurer le fournisseur d’e-mails d’Auth, utiliser `supabase/templates/code.html` pour la confirmation et la connexion, choisir un code à 6 chiffres avec une expiration de 600 secondes. Vérifier l’URL réelle du site et les limites d’envoi.
5. Activer la protection Turnstile dans Supabase Auth avec sa clé secrète, et renseigner `NEXT_PUBLIC_TURNSTILE_SITE_KEY` dans Vercel. Sans clé publique configurée, le formulaire bloque les inscriptions sur Vercel. Tester aussi le rejet des requêtes directes sans jeton par Supabase.
6. Créer le compte du propriétaire, puis lui donner le rôle `organizer` depuis un accès administrateur à la base. Le site ne permet pas à un utilisateur de s’attribuer ce rôle.
7. Configurer Resend, `MAIL_FROM`, `NEXT_PUBLIC_SITE_URL` et `CRON_SECRET`, puis un ordonnanceur authentifié vers `/api/cron` au moins toutes les 5 minutes. Le rythme disponible dépend de l’offre d’hébergement ; aucun abonnement ni ordonnanceur distant n’est créé par ce projet.
8. Refaire les tests de connexion, de droits et d’envoi sur le déploiement réel. L’ajout d’une double authentification des organisateurs et des sauvegardes est à prévoir avant l’ouverture publique.

### Activer les migrations automatiques

Supabase conserve l'historique des migrations appliquées, mais la connexion Vercel–GitHub ne lui envoie pas les fichiers SQL. Le workflow `.github/workflows/supabase-production.yml` s'en charge. Il utilise le CLI Supabase, peut être lancé à la demande et démarre automatiquement lorsqu'un changement dans `supabase/migrations/` est poussé sur `main`.

1. Ouvrir les [jetons d'accès Supabase](https://supabase.com/dashboard/account/tokens), puis créer un jeton nommé `GitHub Blood on Breizh`, limité au projet de production. Accorder **Read** à **Project Settings**, **API Keys** et **API Key Secrets**, comme indiqué dans la [documentation Supabase](https://supabase.com/docs/guides/deployment/managing-environments). Copier le jeton pour l'étape suivante.
2. Dans le dépôt GitHub : **Settings → Secrets and variables → Actions → New repository secret**. Ajouter chacun de ces trois secrets :

   | Nom | Valeur |
   | --- | --- |
   | `SUPABASE_ACCESS_TOKEN` | Le jeton personnel créé à l'étape 1, différent de la clé publique de l'application. |
   | `SUPABASE_DB_PASSWORD` | Le mot de passe de la base choisi à la création du projet Supabase. En cas d'oubli, le réinitialiser dans **Supabase → Database → Settings**. |
   | `SUPABASE_PROJECT_ID` | La référence du projet, visible dans **Supabase → Project Settings → General** ou dans l'URL du tableau de bord, sans `https://` ni `.supabase.co`. |

3. Dans GitHub : **Actions → Supabase — migrations de production → Run workflow**, choisir `main` et confirmer **Run workflow**. Attendre que l'exécution soit verte. L'étape finale affiche l'historique local et distant des migrations.
4. Dans Supabase : ouvrir **Table Editor**. Les tables `profiles`, `sessions`, `session_addresses`, `bookings`, `invitations`, `notifications` et `action_limits` doivent être présentes. Le site doit afficher une liste vide de parties plutôt que l'erreur d'indisponibilité.

Ces secrets restent dans GitHub Actions ; les fichiers publics contiennent uniquement leurs noms. Le workflow n'applique ni `seed.sql`, ni les réglages d'Auth de `config.toml`, ni les secrets Vault. Il ne réactive donc pas les inscriptions. Les réglages de CAPTCHA et de courrier se configurent séparément dans Supabase et Vercel.

Pour les futurs changements de schéma, ajouter une **nouvelle** migration plutôt que modifier un fichier déjà appliqué. Garder les migrations compatibles avec le site déployé : le traitement GitHub et le déploiement Vercel démarrent indépendamment. Une exécution en échec arrête les migrations suivantes ; elle ne relance pas celles déjà enregistrées avec succès. Une nouvelle exécution permet de reprendre après correction.

Documentation de référence : [Supabase Auth](https://supabase.com/docs/guides/auth/auth-email-passwordless), [installation locale](https://supabase.com/docs/guides/local-development/cli/getting-started), [Supabase avec Docker](https://supabase.com/docs/guides/self-hosting/docker), [Next.js](https://nextjs.org/docs/app/getting-started/installation).
