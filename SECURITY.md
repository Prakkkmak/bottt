# Signaler une faille de sécurité

BOTTT gère les comptes, les inscriptions et les adresses privées de vrais joueurs. Si tu trouves une faille, merci de la signaler en privé plutôt que dans une issue publique.

## Comment la signaler

- De préférence par l’onglet **Security → Report a vulnerability** de ce dépôt GitHub, qui ouvre un échange privé.
- Ou par e-mail à [bonjour@bottt.fr](mailto:bonjour@bottt.fr), avec « Sécurité » dans l’objet.

Décris ce que tu as trouvé, comment le reproduire (de préférence sur la pile locale décrite dans le README) et ce qu’une personne malveillante pourrait en faire.

## Ce qui est concerné

- Le code de ce dépôt : le site Next.js, les migrations SQL et leurs règles d’accès, les scripts et le workflow GitHub.
- Par exemple : lire l’adresse privée d’une partie sans y avoir droit, agir à la place d’un autre joueur, contourner les rangs ou la liste d’attente, injecter un script.

Les failles des services utilisés (Supabase, Vercel, Resend, Cloudflare Turnstile) se signalent directement à eux.

## En retour

BOTTT est un projet bénévole : une première réponse arrive dès que possible, en général sous quelques jours. Tu es tenu·e au courant de la correction et, si tu le souhaites, remercié·e dans la pull request qui la corrige.

Merci de ne pas tester sur le site en ligne avec les comptes ou les données d’autres personnes, de ne pas envoyer d’e-mails en masse et de ne pas publier la faille avant sa correction.
