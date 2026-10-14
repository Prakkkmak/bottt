# Invités et voyageurs — design

Date : 2026-10-12 · Statut : validé en discussion

## Objectif

Un membre amène quelqu'un à une partie en quelques secondes, sans que cette personne crée de compte. Les nouveaux, appelés voyageurs, n'ont accès qu'aux places voyageurs et chacune de leurs parties est validée. Pour chaque participant, on voit qui l'a invité.

## Statuts

| Statut | Compte | Places | Validation | Peut amener | Sessions « membres » |
|---|---|---|---|---|---|
| Membre (et organisateur) | oui | membres | non | 2 personnes | oui |
| Invité·e de membre | non | membres | non, place d'office | — | oui |
| Voyageur·se (`membership = 'newcomer'`) | oui | voyageurs | oui, à chaque partie | 2 personnes | non |
| Voyageur·se de nouveau | non | voyageurs | oui, avec son parrain | — | non |

## Règles

- Un parrain amène au plus `MAX_GUESTS_PER_PERSON = 2` personnes par partie. Les statuts `pending`, `confirmed`, `waitlisted` et `offered` comptent dans cette limite.
- Le parrain n'est pas obligé de venir. S'il se désiste, la fenêtre de confirmation propose de libérer aussi ses invités (cases cochées par défaut).
- Liste d'attente et propositions fonctionnent pour les invités comme pour les comptes. C'est le parrain qui confirme une place proposée.
- La réunion des quotas `release_hours` est conservée. Dans le code, `circle` désigne les places membres et `newcomer` les places voyageurs.
- Un voyageur devient membre uniquement par l'organisateur (« Accepter et passer membre », « Passer membre ») ou par le lien de parrainage d'un membre. La promotion automatique de `review_booking` est supprimée.
- L'organisateur peut retirer n'importe quel invité. La suspension ou la suppression d'un parrain libère ses invités.
- Un invité est enregistré avec un prénom ou un pseudo de 2 à 40 caractères, sans contact. Ajouter deux fois le même prénom (sans tenir compte de la casse) renvoie l'inscription existante. Un prénom refusé ne peut pas être ajouté à nouveau sur la même partie.
- On ne peut plus ajouter d'invité moins de 30 minutes avant la partie, ni sur une partie annulée.

## Données — migration `202610120005_guests.sql` (additive)

- `bookings.user_id` devient facultatif. On ajoute :
  - `guest_name text` (2 à 40 caractères) ;
  - `sponsor_id uuid references auth.users(id) on delete cascade`. La clé pointe vers `auth.users` et non vers `profiles` : un second lien vers `profiles` rendrait ambiguë la requête `profile:profiles(*)` du site déjà en ligne.
- Une contrainte `bookings_person_or_guest` impose qu'une ligne soit soit l'inscription d'un compte (`user_id`), soit un invité (`guest_name` + `sponsor_id`).
- L'index `bookings_sponsor_idx(sponsor_id, session_id)` porte sur les lignes où `sponsor_id` est renseigné.
- La règle `bookings_read` autorise aussi `sponsor_id = auth.uid()`. La règle `addresses_read` autorise aussi le parrain d'un invité confirmé.

## Fonctions SQL

Les fonctions existantes gardent leur signature. Les nouvelles retirent l'exécution à `public`/`anon` et ne l'accordent qu'à `authenticated`.

**Nouvelles fonctions**

- `add_guest(p_session uuid, p_name text, p_seat integer default null) → text` :
  1. applique `rate_guard('guest', 20, 600)` et verrouille la session ;
  2. vérifie visibilité, ouverture, prénom, jeton, limite de 2 et doublon de prénom ;
  3. choisit le quota d'après l'appelant : `circle` pour un membre, `newcomer` pour un voyageur ;
  4. détermine le statut : `pending` pour un voyageur, sinon `confirmed` ou `waitlisted` selon `seat_available` ;
  5. place l'invité au jeton choisi s'il est confirmé.
- `remove_guest(p_booking uuid)` : réservée au parrain. Passe l'inscription à `cancelled` puis appelle `rebalance`.
- `accept_guest_offer(p_booking uuid) → text` : réservée au parrain. Confirme une proposition encore valable.
- `review_request(p_session uuid, p_person uuid, p_approve boolean, p_promote boolean default false) → text` : réservée à l'organisateur. Traite en une seule transaction toutes les demandes `pending` de la personne et de ses invités sur la partie :
  - avec `p_promote`, la personne passe membre et sa propre demande bascule dans le quota `circle` ;
  - la personne reçoit un seul message qui récapitule le résultat pour chacun.

**Fonctions modifiées**

- `review_booking` : plus de promotion automatique. Le message part à `coalesce(user_id, sponsor_id)` et nomme l'invité.
- `rebalance` : les propositions et les expirations concernant un invité sont envoyées au parrain, avec son prénom.
- `save_session` :
  - la base est la version de la migration 4 ;
  - le contrôle « voyageurs inscrits » couvre aussi les invités de quota `newcomer` ;
  - chaque destinataire reçoit un seul message, qui cite ses invités.
- `cancel_session` : chaque destinataire reçoit un seul message, dédoublonné et qui cite ses invités.
- `set_membership` : suspendre un compte libère aussi les inscriptions où `sponsor_id` vaut ce compte.
- `maintenance` :
  - un seul rappel par destinataire, avec les variantes « Paul vient avec toi » et « Paul est attendu·e » ;
  - 30 jours après la soirée, `guest_name` est remplacé par `Invité·e`.
- `book_session` : le texte « première participation » devient « ta demande ».
- `list_sessions`, à partir de la version de la migration 4 :
  - `participants` comprend les invités, chacun avec `role` (`member` | `guest` | `traveller` | `traveller_guest`), `invited_by` et la couleur de son parrain ;
  - `my_guests` donne pour chaque invité `id`, `name`, `status`, `seat_index` et `offer_expires_at` (les invités annulés sont exclus) ;
  - `member_seats_free` et `traveller_seats_free` tiennent compte de la réunion des quotas.

## Interface

- **Cercle (`tableau.tsx`)**
  - Anneau pointillé pour un voyageur, maillon pour une personne amenée, badge MJ dans le coin opposé.
  - Étiquettes du type « Paul · invité·e de Léa ».
  - Les jetons de ses propres invités sont cliquables.
- **Liste des participants** : toujours visible, avec le statut de chacun.
- **Clic sur un +** : une fonction pure, `seatAction` dans `lib/guests.ts`, décide de l'action selon la personne et la partie.
  - Visiteur : connexion.
  - Membre non inscrit : il prend la place. Le lien « Inscrire quelqu'un d'autre » permet d'amener quelqu'un sans venir.
  - Inscrit : il place un invité.
  - Voyageur : il fait une demande.
  - Places de son type épuisées : liste d'attente, avec l'explication.
  - Limite atteinte : message « Tu amènes déjà 2 personnes ».
- **Fenêtre « Qui t'accompagne ? » (`guest-dialog.tsx`)** : prénom, suggestions récentes, texte différent pour un membre et pour un voyageur.
- **Bloc « Tes invités » (`session-guests.tsx`)** : statut de chaque invité, boutons « Retirer » et « Confirmer pour Paul ».
- **Désistement** : la fenêtre propose de libérer aussi la place de ses invités.
- **Accueil** : le bandeau des propositions couvre les invités. La ligne de la partie indique « Inscrit·e · +1 ».
- **Organiser**
  - Cartes « À valider » regroupées par voyageur : « Accepter les N », « Accepter et passer membre », « Refuser », et refus d'un seul ami.
  - Dans « Participants », chaque invité apparaît sous son parrain.
  - Dans « Membres », « Voyageur·se » remplace « Nouveau », avec un bouton « Passer membre ».
- **Formulaire de partie** : « Dont places voyageurs ». La visibilité « members » s'intitule « Membres et leurs invités ».
- **Page Inviter**
  - « Amener quelqu'un à une partie » : explication et liste de tes invités à venir.
  - « Faire entrer quelqu'un dans le cercle » : le lien de parrainage, réservé aux membres.
- **Profil** : badge « Voyageur·se » et une phrase d'explication.
- **Adresse** : un parrain dont un invité est confirmé y a accès dans la partie et dans le fichier `.ics`.

## Notifications

Un invité n'a pas d'e-mail : tout ce qui le concerne part chez son parrain, avec son prénom. Chaque personne reçoit un seul message par événement. Les événements concernés :
- groupe accepté ou refusé, ou ami refusé seul ;
- invité retiré ;
- place proposée ou proposition expirée ;
- partie modifiée ou annulée ;
- rappel 24 h avant.

L'ajout d'un invité n'envoie aucun e-mail.

## Données personnelles

- La page « Données personnelles » ajoute un paragraphe sur les personnes amenées : prénom seul, visible des membres et des inscrits confirmés, effacé 30 jours après la soirée, base légale et contact.
- Les conditions ajoutent : « Tu réponds des personnes que tu amènes », et précisent que les voyageurs sont validés.

## Déploiement

- La migration n'ajoute que des éléments nouveaux et ne crée aucun invité. Le site en ligne continue de fonctionner jusqu'au déploiement Vercel. La promotion automatique s'arrête dès la migration.
- Le README est mis à jour : fonctionnement, protection des données, cinq migrations.
- Les données de démo (`lib/fixtures.ts`) et le seed local montrent un invité et un voyageur accompagné.

## Tests

- **SQL (`tests/database.test.ts`)**
  1. un invité est confirmé d'office au jeton choisi ;
  2. la limite et le doublon de prénom sont respectés ;
  3. un voyageur et son ami restent `pending` sans jeton ;
  4. `review_request` est atomique et n'envoie qu'un seul message ;
  5. pas de promotion automatique, sauf `p_promote`, qui fait basculer le quota ;
  6. les sessions « membres » restent fermées aux voyageurs ;
  7. la proposition faite à un invité ne peut être acceptée que par son parrain ;
  8. personne ne peut lire ni modifier l'invité d'un autre ;
  9. un visiteur ne voit aucun prénom ;
  10. la suspension ou la suppression d'un parrain libère ses invités ;
  11. un seul message par destinataire ;
  12. le contrôle de visibilité « membres » tient compte des invités ;
  13. les prénoms sont effacés au bout de 30 jours ;
  14. les compteurs par type sont justes avant et après la réunion des quotas.
- **TypeScript (`tests/guests.test.ts`)** : libellés des statuts, `seatAction`, regroupement des demandes, suggestions de prénoms.
- **Intégration (`tests/local-integration.ts`)** : deux invités ajoutés en même temps pour la dernière place ne la réservent pas deux fois. `profile:profiles(*)` fonctionne toujours.
- **Vérifications finales** : `pnpm typecheck`, `pnpm test`, `pnpm build`, puis contrôle visuel sur ordinateur et sur mobile.

## Hors périmètre

- Renommer ou déplacer un invité.
- Ajouter quelqu'un après la clôture des inscriptions.
- Transformer un invité en compte.
- Régler la limite partie par partie.
