# Contribuer à Blood on the Tanguy Tower

Merci de vouloir améliorer BOTTT. Le site sert un vrai groupe de joueurs à Brest : chaque changement part en production après sa fusion, base de données comprise. Ces quelques règles évitent de casser le site en ligne ou d’exposer les données des joueurs.

## Avant de commencer

- Pour un changement plus important qu’une simple correction, ouvre d’abord une issue pour en discuter.
- Une faille de sécurité ne se signale pas dans une issue : suis [SECURITY.md](SECURITY.md).
- Le site, ses textes et ses messages d’erreur sont en français, avec le tutoiement et l’écriture inclusive déjà utilisés (« inscrit·e »).

## Travailler en local

Le [README](README.md#démarrer-et-arrêter) décrit la pile locale (Docker Compose, Supabase Auth, PostgREST et Mailpit). Ses identifiants sont générés sur ta machine et ignorés par Git. N’utilise que des comptes et des adresses fictifs (`@cercle.test`, `@example.com`), jamais les données de vraies personnes, ni dans les tests ni dans les exemples.

Ne commite jamais de fichier `.env*` (sauf `.env.example`, qui ne contient que des noms de variables et des valeurs d’exemple, jamais de secret), de clé ou de jeton.

## Avant d’ouvrir une pull request

```sh
pnpm typecheck
pnpm test
pnpm build
```

Les trois doivent passer. Ajoute un test pour chaque règle que tu changes, surtout côté SQL (`tests/sql-*.test.ts`).

Une pull request traite un seul sujet. Sa description explique pourquoi le changement est utile, ce qu’il change pour les joueurs et les organisateurs, et comment tu l’as vérifié.

## Règles du projet

**Base de données**
- Ajoute une **nouvelle** migration dans `supabase/migrations/`, nommée `AAAAMMJJNNNN_nom_en_minuscules.sql` : la date, puis le numéro qui suit celui de la dernière migration. La pile locale ignore sans prévenir un fichier qui ne suit pas ce format. Ne modifie jamais une migration déjà fusionnée : elle est déjà appliquée en production.
- Garde chaque migration compatible avec le site déjà déployé : la base et Vercel se mettent à jour indépendamment.
- Pour chaque nouvelle table ou fonction, retire d’abord les droits (`revoke … from public, anon, authenticated`), puis accorde explicitement ceux qui sont nécessaires. Supabase hébergé accorde les nouvelles tables à `anon` et `authenticated` par défaut, ce que ni le harnais de tests ni la pile Docker locale ne reproduisent : un oubli ne se voit qu’en production.
- Active la sécurité par ligne (RLS) sur toute nouvelle table.
- Les fonctions identifient l’appelant par `auth.uid()`, jamais par un paramètre. Un identifiant reçu du navigateur ne désigne qu’une cible, et la fonction vérifie que l’appelant a le droit d’agir sur elle (`is_organizer()`, `sponsor_id = auth.uid()`…).
- Toute politique RLS ou fonction qui s’appuie sur `auth.uid()` vérifie aussi `public.active_user()`, directement ou par `rate_guard()`, `is_member()` ou `is_organizer()`. C’est ce contrôle qui écarte les sessions ouvertes par mot de passe, les comptes suspendus et les sessions de plus de 30 jours.
- Une fonction `security definer` fixe `set search_path = ''` et qualifie chaque objet (`public.`, `auth.`).
- Une nouvelle colonne de `sessions` n’est pas lisible directement par l’API tant qu’elle n’est pas accordée colonne par colonne. En revanche, `list_sessions()` la renvoie aussitôt à tout le monde, visiteurs compris, car elle exclut des colonnes au lieu d’en lister : retire-la de `to_jsonb(s)-…` si elle ne doit pas être publique.

**Navigateur**
- Un nouveau service tiers chargé par le navigateur (script, police, image, cadre) doit être ajouté dans `lib/content-security-policy.ts`, sinon la CSP le bloque en production.
- Une nouvelle police ou image de `public/` passe par le proxy à chaque chargement tant qu’elle n’est pas ajoutée, par son nom exact, aux exclusions du `matcher` de `proxy.ts`.
- N’importe pas zod dans le code client : le formulaire de partie se vérifie avec `lib/session-form.ts`, qui partage ses messages avec le schéma du serveur.

**Comptes**
- La connexion se fait uniquement par code e-mail. N’ajoute aucune autre méthode de connexion (mot de passe, OAuth, téléphone, passkey) ni hook de jeton : la base traite une session ouverte par mot de passe comme un visiteur, et cette parade dépend des réglages listés dans « Protection des données » du README.

## Licence

En proposant une contribution, tu acceptes qu’elle soit publiée sous la [licence MIT](LICENSE) du projet.
