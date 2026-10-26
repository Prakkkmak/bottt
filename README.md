# Blood on the Tanguy Tower

Une application en français pour organiser les soirées Blood on the Clocktower, avec Next.js, Supabase Auth et PostgreSQL. Elle peut fonctionner en local avec Docker Compose et Mailpit, ou en production avec Vercel et Supabase hébergé. La pile locale décrite ci-dessous conserve ses comptes, ses données et ses e-mails sur la machine.

## Ouvrir le site

- Site : http://127.0.0.1:3000
- Boîte mail locale : http://127.0.0.1:54324
- Interface de la base (Supabase Studio) : http://127.0.0.1:55433
- API locale : http://127.0.0.1:54321
- PostgreSQL : 127.0.0.1:55432

Le compte organisateur d’exemple est **camille@cercle.test**. Clique sur « Se connecter », demande un code et récupère-le dans la boîte mail locale. Ce compte n’a pas de mot de passe. Les e-mails restent sur ta machine. Pour tester un nouveau joueur, utilise par exemple `nouveau@cercle.test` : après le code, le site lui demande d’abord son pseudo.

Les 2 lieux, 4 sessions, 16 joueurs et adresses fournis sont fictifs. Les réservations et modifications, elles, sont réellement enregistrées dans PostgreSQL. Le volume Docker `le-cercle-local_cercle-db` conserve ces données entre les redémarrages. Ne l’efface pas si tu veux garder tes modifications.

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

Dans un second terminal, pour les rappels et la livraison des notifications restées en attente :

```sh
pnpm local:worker
```

Le worker traite la file toutes les minutes. Sans lui, les inscriptions et désistements restent opérationnels, mais les traitements programmés et les e-mails attendent sa reprise. Les statuts des participations restent visibles dans « Jouer ».

Pour arrêter les services Docker sans effacer les données : `pnpm local:stop`. Le site se limite à l’adresse de boucle locale, comme les ports de la base, du courrier et de Studio. Ne publie pas cette pile de développement sur Internet.

Les identifiants locaux sont générés automatiquement dans `.docker/` et `.env.docker`. `.env.local` configure l’application. Ces fichiers sont ignorés par Git. Le script refuse de remplacer une configuration Supabase distante.

## Fonctionnement

- Compte personnel, connexion par code e-mail valable 10 minutes, sans autre champ que l’adresse. À la première connexion, le site demande d’abord un pseudo, modifiable ensuite dans le profil ; la page demandée s’ouvre juste après. Les comptes restés « Nouveau joueur » le choisissent à leur prochaine visite. Cookies HttpOnly ; session conservée et limitée à 30 jours, limite aussi contrôlée dans la base.
- Sessions publiques ou réservées aux membres/parrainés, script, début en heure de Paris, lieu général et adresse privée. La création préremplit le prochain vendredi à 19 h 30 et les réglages d’une partie existante. La fin est calculée côté serveur à +4 h pour l’agenda ; une modification conserve la durée précédente.
- Toutes les soirées accueillent les débutants ; aucune catégorie découverte ni page bienvenue séparée.
- Inscription en cliquant sur un + autour de la Tour Tanguy. Le jeton choisi est conservé ; cliquer sur son jeton permet de se désister après confirmation. Une place sur la liste d’attente ne réserve pas de jeton : la personne reçoit le premier jeton libre quand son tour vient.
- Pour amener quelqu’un, inscrit·e ou non, un seul bouton « Inscrire quelqu’un d’autre » dans « Tes invités », au-dessus du cercle. Une fois inscrit·e, un + libre ouvre la même fenêtre pour choisir sa place. La personne ajoutée et la confirmation s’affichent aussitôt dans ce bloc.
- Parties dépliables dans « Jouer » : sièges, inscriptions et désistements restent sur la même page. Plusieurs cercles peuvent être ouverts ensemble. L’ancien lien « Mes parties » redirige vers l’accueil.
- Événements limités aux informations pratiques, sans champ de description. Le nom de la partie est facultatif : sans nom, elle prend celui de son script. Les fenêtres ne se ferment pas au clic à côté ; celle de la partie demande confirmation avant de perdre une saisie.
- Parties à partir de 7 joueurs ; capacité de 15 places par défaut, ajustable jusqu’à 20. Compteur des places réservées visible dans la liste des parties.
- Une seule file pour tout le monde : les places vont aux premiers inscrits, membres, voyageurs et invités confondus, sans validation par un organisateur ni quota par rang. Les anciennes colonnes `newcomer_seats` et `release_hours` restent en base mais ne limitent plus rien.
- Pas de MJ désigné sur les parties : chaque personne peut se proposer dans son profil. Une petite icône de livre identifie les volontaires parmi les participants.
- Niveau d’expérience déclaré dans le profil : débutant·e, quelques parties ou expérimenté·e. Les organisateurs le voient dans les demandes et la liste des membres. L’ancienne colonne `beginner` reste synchronisée pour le site déjà déployé.
- Quatre statuts : membre, invité·e de membre, voyageur·se (compte pas encore membre) et voyageur·se amené·e par un voyageur. Un membre amène autant de personnes sans compte qu’il le souhaite tant qu’il reste des places, puis 2 au plus en liste d’attente. Un voyageur amène jusqu’à 2 amis et ne voit pas les parties réservées aux membres ; un organisateur peut le passer membre. Les prénoms des invités sont effacés 30 jours après la soirée.
- Parrainage à usage unique, valable 7 jours et limité à 5 invitations par jour. Le parrain n’accède jamais au compte de son invité. Le lien fait directement de l’invité·e un·e membre. Depuis « Inviter », un membre l’envoie par e-mail (Mailpit en local, Resend en production) ou le copie lui-même ; si l’e-mail ne part pas, le lien s’affiche pour être transmis. L’adresse de la personne invitée n’est visible que du parrain et s’efface 30 jours après la fin du lien. Une personne qui s’oppose aux invitations est ajoutée par un administrateur à `invitation_optouts` (empreinte SHA-256 de l’adresse en minuscules) ; le site refuse alors de l’inviter à nouveau.
- Désistement et liste d’attente unique dans l’ordre d’arrivée, invités compris : une place libérée (désistement, retrait, capacité augmentée) revient aussitôt à la première personne qui attend, sans proposition à confirmer. Personne n’est placé à moins de 30 minutes du début, quand les inscriptions sont closes. Le rang sur la liste est affiché dans la partie.
- Statuts dans « Jouer » et notifications par e-mail : inscription confirmée, ajout à la liste d’attente (avec le rang), place obtenue depuis la liste, désistement, changement de date ou de lieu, annulation et rappel à moins de 24 h. Les invités n’ont pas d’adresse : la personne qui les amène reçoit leurs messages. Chaque e-mail nomme la partie, sa date et son lieu. Les messages partent juste après l’action qui les crée (inscription, désistement…), avec la clé de service côté serveur ; le traitement programmé reprend ceux qui ont échoué et envoie les rappels.
- Création, modification, annulation et suppression de sessions : une partie à venir avec des inscrits s’annule d’abord, pour que chacun soit prévenu. Validation/retrait des participants, changement de rang (voyageur·se, membre, organisateur·rice) et suspension. Le rang d’un autre organisateur ne se change pas depuis le site.
- Profil et couleur d’avatar, interface mobile et navigation clavier. Cliquer sur la date ouvre les liens préremplis Google Agenda, Outlook ou un fichier iCalendar. Une partie visible peut être ajoutée à l’agenda ; seuls les organisateurs, les inscrits confirmés et les personnes dont un·e invité·e est confirmé·e obtiennent l’adresse privée. L’ajout crée une copie et ne synchronise pas les changements ultérieurs.
- Adresse texte ou lien partagé OpenStreetMap, Google Maps, Apple Plans, Waze, etc. Le lien est conservé avec l’adresse privée, sans changement de schéma, et s’ouvre au clic. Sans lien, l’adresse postale (la ligne du code postal et celle de la rue, sinon la première ligne) est cherchée sur OpenStreetMap.
- Lieux habituels gérés par les organisateurs dans « Organiser → Les lieux » : nom affiché à tous, adresse privée et lien de carte. Une partie choisit l’un d’eux ou « Autre lieu » pour une adresse saisie une seule fois ; elle garde sa propre copie du lieu. Modifier un lieu met à jour ses parties à venir et prévient leurs inscrits ; le supprimer laisse ses parties à leur place. À l’installation, les lieux déjà utilisés par les parties existantes sont repris, chacun avec sa dernière adresse.
- Footer avec conditions d’utilisation, données personnelles et cookies ; coordonnées du responsable : Lévy MARQUES, bonjour@bottt.fr. Bandeau d’information à valider, mémorisé localement six mois et accessible via « Gérer les cookies ». Le site n’ajoute aucun traceur facultatif.
- Polices variables servies localement avec leurs licences, cadre rendu côté serveur, formulaire organisateur chargé à l’ouverture, requêtes d’invitations réservées à leur page et suppression des requêtes de notifications inutilisées.
- Référencement : la production est ouverte aux moteurs de recherche, les déploiements de prévisualisation Vercel non. Les visiteurs non connectés voient une courte présentation de Blood on the Clocktower à Brest au-dessus des parties, et la page « Découvrir Blood on the Clocktower » (`/blood-on-the-clocktower`) explique le jeu, le lien avec le Loup-Garou et les questions fréquentes. Titres, descriptions, image de partage, `robots.txt`, `sitemap.xml` et données structurées (site, groupe, parties publiques à venir comme événements situés à Brest, sans adresse privée, et questions fréquentes) sont générés par le site. Le profil, l’organisation, les invitations et les liens de parrainage restent hors des résultats.

## Protection des données

Les droits sont vérifiés côté serveur et dans PostgreSQL (RLS). Les joueurs ne peuvent pas écrire directement dans les réservations ni modifier leur statut de membre. Les fonctions transactionnelles identifient toujours l’appelant via sa session ; elles n’acceptent aucun identifiant de joueur à usurper. Le verrouillage de chaque session empêche deux réservations concurrentes de dépasser les quotas. Par l’API, visiteurs et joueurs ne lisent des parties que les colonnes affichées par le site : ni l’ancien nom du MJ, ni l’ancienne description, ni le compte de l’organisateur. Seules les sessions ouvertes avec un code reçu par e-mail donnent accès au compte : Supabase Auth accepte aussi une inscription avec mot de passe, et quelqu’un pourrait en poser un sur l’adresse d’un joueur avant sa première connexion, mais une session ouverte avec ce mot de passe est traitée comme un visiteur. Cette parade suppose que, dans Supabase Auth, « Secure email change » reste activé et que la liaison manuelle d’identités, les passkeys, le fournisseur téléphone et les hooks de jeton d’accès restent désactivés : chacun permettrait de tirer de ce mot de passe une session d’un autre type.

Chaque page envoie une politique de sécurité du contenu (CSP) avec un nonce propre à la requête, posée par `proxy.ts` : seuls les scripts du site, et Turnstile qu’ils chargent, s’exécutent ; les gestionnaires d’événements injectés, les plugins et l’affichage du site dans un cadre sont refusés. `next.config.ts` ajoute HSTS et l’isolation de la fenêtre (COOP) aux en-têtes existants. Pour un nouveau service tiers chargé dans le navigateur, ajouter son domaine dans `lib/content-security-policy.ts`. Les fichiers statiques sont exclus du proxy un par un dans son `matcher` : une nouvelle police s’y ajoute, sinon chaque chargement passe par le proxy.

L’adresse précise est dans une table distincte et accessible uniquement aux organisateurs, aux participants confirmés et aux personnes dont un·e invité·e est confirmé·e ; comme personne ne valide plus les inscriptions, un·e voyageur·se ne la lit qu’à partir de 48 h avant la partie. La liste des lieux et leurs adresses ne sont lisibles que par les organisateurs. Les e-mails ne sont pas exposés aux autres joueurs. Les invitations sont stockées sous forme d’empreinte ; le lien complet n’est affiché qu’à sa création. Un invité n’a pas de compte : seul son prénom est enregistré, et la personne qui l’amène reçoit les messages qui le concernent.

La pile locale ne comporte pas de CAPTCHA externe : les limites d’envoi et de tentatives d’Auth, ainsi que les limites des actions en base, sont actives. La boîte mail locale et Studio sont des outils de développement sans authentification destinés à cette machine. Utilise des comptes fictifs.

## Vérifications

```sh
pnpm typecheck
pnpm test
pnpm build
node node_modules/tsx/dist/cli.mjs --env-file=.env.local tests/local-integration.ts
```

Les tests SQL couvrent les droits, l’identité, la liste d’attente, les doublons, le parrainage, l’expiration de session, les désistements, les invités, les rangs, la suppression des parties, le niveau d’expérience, les invitations par e-mail et les lieux. Le test d’intégration utilise la vraie pile Docker, effectue des réservations simultanées et supprime uniquement ses propres données temporaires.

## Mise en ligne

1. Créer un dépôt avec ce dossier, sans `.env*`, `.docker/`, `node_modules/` ou `.next/`, puis l’importer dans Vercel (projet Next.js).
2. Appliquer les fichiers `supabase/migrations/` au projet Supabase distant avec le workflow GitHub décrit ci-dessous. Le premier lancement applique toutes les migrations ; les suivants appliquent seulement celles qui manquent. Les exemples locaux ne sont pas importés.
3. Renseigner les variables de `.env.example` dans Vercel. La clé de service reste côté serveur ; seule la clé publique peut avoir le préfixe `NEXT_PUBLIC_`.
4. Configurer le fournisseur d’e-mails d’Auth, utiliser `supabase/templates/code.html` pour la confirmation et la connexion, choisir un code à 6 chiffres avec une expiration de 600 secondes. Vérifier l’URL réelle du site et les limites d’envoi.
5. Activer la protection Turnstile dans Supabase Auth avec sa clé secrète, et renseigner `NEXT_PUBLIC_TURNSTILE_SITE_KEY` dans Vercel. Sans clé publique configurée, le formulaire bloque les inscriptions sur Vercel. Tester aussi le rejet des requêtes directes sans jeton par Supabase.
6. Créer le compte du propriétaire, puis lui donner le rôle `organizer` depuis un accès administrateur à la base. Le site ne permet pas à un utilisateur de s’attribuer ce rôle. Un organisateur peut ensuite en nommer d’autres depuis « Organiser » ; retirer ce rang demande toujours l’accès administrateur.
7. Configurer Resend, `MAIL_FROM`, `NEXT_PUBLIC_SITE_URL` et `SUPABASE_SERVICE_ROLE_KEY` (clé secrète du projet, sans préfixe `NEXT_PUBLIC_`) : sans cette clé, les e-mails d’inscription et de liste d’attente ne partent pas. Pour les rappels et les nouvelles tentatives, ajouter `CRON_SECRET` et un ordonnanceur authentifié vers `/api/cron` au moins toutes les 5 minutes. Le rythme disponible dépend de l’offre d’hébergement ; aucun abonnement ni ordonnanceur distant n’est créé par ce projet.
8. Refaire les tests de connexion, de droits et d’envoi sur le déploiement réel. L’ajout d’une double authentification des organisateurs et des sauvegardes est à prévoir avant l’ouverture publique.

### Référencement

Le site s’appuie sur `NEXT_PUBLIC_SITE_URL` (ou, à défaut, le domaine de production Vercel) pour ses liens canoniques, son plan du site et ses données structurées. Après la mise en ligne :

1. Ouvrir [Google Search Console](https://search.google.com/search-console), ajouter la propriété du domaine et choisir la validation par balise HTML. Copier la valeur `content` de la balise dans la variable `GOOGLE_SITE_VERIFICATION` de Vercel (production), redéployer, puis valider.
2. Dans Search Console, envoyer `https://<domaine>/sitemap.xml` et demander l’indexation de la page d’accueil et de `/blood-on-the-clocktower`.
3. Faire de même dans [Bing Webmaster Tools](https://www.bing.com/webmasters), qui peut importer la propriété depuis Search Console.
4. Facultatif : une fiche Google Business Profile, sans adresse publique (zone desservie : Brest), rend le groupe visible sur Google Maps. Le lien du site partagé sur les groupes et pages du jeu (Discord, Facebook, ludothèques et bars à jeux brestois) aide aussi les moteurs à le trouver.

Le [test des résultats enrichis](https://search.google.com/test/rich-results) vérifie les données structurées de la page d’accueil quand une partie publique est prévue.

### Activer les migrations automatiques

Supabase conserve l'historique des migrations appliquées, mais la connexion Vercel–GitHub ne lui envoie pas les fichiers SQL. Le workflow `.github/workflows/supabase-production.yml` s'en charge. Il utilise le CLI Supabase, peut être lancé à la demande et démarre automatiquement lorsqu'un changement dans `supabase/migrations/` est poussé sur `main`.

1. Ouvrir les [jetons d'accès Supabase](https://supabase.com/dashboard/account/tokens), puis créer un jeton nommé `GitHub Blood on the Tanguy Tower`, limité au projet de production. Accorder **Read** à **Project Settings**, **API Keys**, **API Key Secrets** et **Connection Pooling**. Cette dernière permission se trouve dans **Database** et permet de récupérer la connexion IPv4 nécessaire depuis GitHub Actions ; sans elle, `supabase link` peut réussir alors que `supabase db push` échoue avec une erreur IPv6. Voir les [permissions Supabase](https://supabase.com/docs/guides/platform/personal-access-tokens#permission-scopes) et la [connexion IPv4 en mode session](https://supabase.com/docs/guides/database/connecting-to-postgres#shared-pooler-session-mode). Copier le jeton pour l'étape suivante.
2. Dans le dépôt GitHub : **Settings → Environments → Production → Environment secrets → Add secret**. Créer l'environnement `Production` s'il n'existe pas encore. Le workflow utilise cet environnement pour accéder aux secrets. Ajouter chacun de ces trois secrets :

   | Nom | Valeur |
   | --- | --- |
   | `SUPABASE_ACCESS_TOKEN` | Le jeton personnel créé à l'étape 1, différent de la clé publique de l'application. |
   | `SUPABASE_DB_PASSWORD` | Le mot de passe de la base choisi à la création du projet Supabase. En cas d'oubli, le réinitialiser dans **Supabase → Database → Settings**. |
   | `SUPABASE_PROJECT_ID` | La référence du projet, visible dans **Supabase → Project Settings → General** ou dans l'URL du tableau de bord, sans `https://` ni `.supabase.co`. |

3. Dans GitHub : **Actions → Supabase — migrations de production → Run workflow**, choisir `main` et confirmer **Run workflow**. Attendre que l'exécution soit verte. L'étape finale affiche l'historique local et distant des migrations.
4. Dans Supabase : ouvrir **Table Editor**. Les tables `profiles`, `sessions`, `session_addresses`, `venues`, `bookings`, `invitations`, `notifications` et `action_limits` doivent être présentes. Le site doit afficher une liste vide de parties plutôt que l'erreur d'indisponibilité.

Ces secrets restent dans GitHub Actions ; les fichiers publics contiennent uniquement leurs noms. Le workflow n'applique ni `seed.sql`, ni les réglages d'Auth de `config.toml`, ni les secrets Vault. Il ne réactive donc pas les inscriptions. Les réglages de CAPTCHA et de courrier se configurent séparément dans Supabase et Vercel.

Pour les futurs changements de schéma, ajouter une **nouvelle** migration plutôt que modifier un fichier déjà appliqué. Garder les migrations compatibles avec le site déployé : le traitement GitHub et le déploiement Vercel démarrent indépendamment. Une exécution en échec arrête les migrations suivantes ; elle ne relance pas celles déjà enregistrées avec succès. Une nouvelle exécution permet de reprendre après correction.

Documentation de référence : [Supabase Auth](https://supabase.com/docs/guides/auth/auth-email-passwordless), [installation locale](https://supabase.com/docs/guides/local-development/cli/getting-started), [Supabase avec Docker](https://supabase.com/docs/guides/self-hosting/docker), [Next.js](https://nextjs.org/docs/app/getting-started/installation).
