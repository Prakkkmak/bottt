# Signaler une faille de sécurité

BOTTT gère les comptes, les inscriptions et les adresses privées de vrais joueurs. Si tu trouves une faille, merci de la signaler en privé plutôt que dans une issue publique.

## Comment la signaler

- De préférence par l’onglet **Security → Report a vulnerability** de ce dépôt GitHub, qui ouvre un échange privé.
- Ou par e-mail à [bonjour@bottt.fr](mailto:bonjour@bottt.fr), avec « Sécurité » dans l’objet.

Décris ce que tu as trouvé, comment le reproduire (de préférence sur la pile locale décrite dans le README) et ce qu’une personne malveillante pourrait en faire.

## Ce qui est concerné

- Le code de ce dépôt : le site Next.js, les migrations SQL et leurs règles d’accès, les scripts et le workflow GitHub.
- La configuration du site en ligne dont dépend cette protection : en-têtes de sécurité, réglages de Supabase Auth décrits dans le README.
- Par exemple : lire l’adresse privée d’une partie sans y avoir droit, agir à la place d’un autre joueur, contourner les rangs ou la liste d’attente, injecter un script.

Les failles des services utilisés (Supabase, Vercel, Resend, Cloudflare Turnstile) se signalent directement à eux.

## En retour

BOTTT est un projet bénévole : une première réponse arrive dès que possible, en général sous quelques jours. La correction est préparée en privé et publiée au moment de son déploiement. Tu es tenu·e au courant et, si tu le souhaites, remercié·e quand elle est publiée.

Merci de ne pas tester sur le site en ligne avec les comptes ou les données d’autres personnes. Ne t’inscris pas aux vraies parties pour tester la liste d’attente ou les rangs, car tu prendrais la place de vrais joueurs, et ne déclenche pas d’envoi d’e-mails. Merci enfin de ne pas publier la faille avant sa correction.
