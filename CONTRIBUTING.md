# Contribuer à Blood on the Tanguy Tower

Merci de vouloir améliorer BOTTT. Le site sert un groupe de joueurs réel à Brest : chaque changement part en production après sa fusion, base de données comprise. Ces quelques règles évitent de casser le site en ligne ou d’exposer les données des joueurs.

## Avant de commencer

- Pour un changement plus gros qu’une correction, ouvre d’abord une issue pour en discuter.
- Une faille de sécurité ne se signale pas dans une issue : suis [SECURITY.md](SECURITY.md).
- Le site, ses textes et ses messages d’erreur sont en français, avec le tutoiement et l’écriture inclusive déjà utilisés (« inscrit·e »).

## Travailler en local

Le [README](README.md#démarrer-et-arrêter) décrit la pile locale (Docker Compose, Supabase Auth, PostgREST et Mailpit). Ses identifiants sont générés sur ta machine et ignorés par Git. N’utilise que des comptes et des adresses fictifs (`@cercle.test`, `@exemple.fr`), jamais les données de vraies personnes, ni dans les tests ni dans les exemples.

Ne commite jamais de fichier `.env*` (sauf `.env.example`, qui ne contient que des noms de variables), de clé ou de jeton.

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
- Ajoute une **nouvelle** migration dans `supabase/migrations/`, numérotée après la dernière. Ne modifie jamais une migration déjà fusionnée : elle est déjà appliquée en production.
- Garde chaque migration compatible avec le site déjà déployé : la base et Vercel se mettent à jour indépendamment.
- Pour chaque nouvelle table ou fonction, retire d’abord les droits (`revoke … from public, anon, authenticated`), puis accorde explicitement ceux qui sont nécessaires. Supabase hébergé les accorde par défaut, ce que le harnais de tests ne reproduit pas.
- Une nouvelle colonne de `sessions` n’est pas lisible par l’API tant qu’elle n’est pas accordée colonne par colonne.
- Active la sécurité par ligne (RLS) sur toute nouvelle table. Les fonctions identifient l’appelant par sa session et n’acceptent jamais un identifiant de joueur venu du navigateur.

**Navigateur**
- Un nouveau service tiers chargé par le navigateur (script, police, image, cadre) doit être ajouté dans `lib/content-security-policy.ts`, sinon la CSP le bloque en production.
- Une nouvelle police ou image de `public/` passe par le proxy à chaque chargement tant qu’elle n’est pas ajoutée, par son nom exact, aux exclusions du `matcher` de `proxy.ts`.
- N’importe pas zod dans le code client : le formulaire de partie se vérifie avec `lib/session-form.ts`, qui partage ses messages avec le schéma du serveur.

**Comptes**
- La connexion se fait uniquement par code e-mail. N’ajoute pas de connexion par mot de passe : la base refuse volontairement ces sessions (voir « Protection des données » dans le README).

## Licence

En proposant une contribution, tu acceptes qu’elle soit publiée sous la [licence MIT](LICENSE) du projet.
