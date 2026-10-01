import Link from 'next/link';
export const metadata = { title: 'Conditions d’utilisation' };

export default function Page() {
  return <>
    <h1>Conditions d’utilisation</h1>
    <section><h2>Le service</h2><p>Blood on the Tanguy Tower (BOTTT) permet de consulter les soirées Blood on the Clocktower à Brest, de s’inscrire et de gérer ses participations. Il s’agit d’une communauté indépendante. Le service est géré par Lévy MARQUES, joignable à <a href="mailto:bonjour@bottt.fr">bonjour@bottt.fr</a>.</p></section>
    <section><h2>Ton compte</h2><p>La connexion se fait par un code envoyé à ton adresse e-mail. Utilise une adresse qui t’appartient, garde ton code confidentiel et choisis un pseudo respectueux. Ton compte est personnel ; le parrainage ne donne pas accès au compte d’une autre personne.</p></section>
    <section><h2>Les inscriptions</h2><p>Le statut affiché sur la partie indique si ton inscription est confirmée, en attente de validation ou en liste d’attente. Une demande en attente ne garantit pas une place. La première participation peut être validée par un organisateur.</p><p>Si une place t’est proposée, confirme-la avant l’échéance affichée. Si tu ne peux plus venir, désiste-toi depuis la partie pour permettre à une autre personne de participer. Les jetons autour de la tour sont une représentation ludique des participants.</p></section>
    <section><h2>Le respect des autres</h2><p>Respecte les participants, les organisateurs et les lieux d’accueil. Les propos discriminatoires, le harcèlement, l’usurpation d’identité et les tentatives de contournement des réservations sont interdits. Les organisateurs peuvent retirer une participation ou suspendre un compte en cas d’abus.</p><p>L’adresse précise d’une soirée est réservée aux personnes autorisées. Ne la diffuse pas publiquement sans l’accord de l’organisateur.</p></section>
    <section><h2>Les informations pratiques</h2><p>Les organisateurs peuvent modifier ou annuler une soirée. Consulte les informations de la partie avant de te déplacer. Un événement ajouté à ton agenda est une copie des informations au moment de l’ajout : il ne se met pas à jour automatiquement.</p><p>Les liens de carte et d’agenda ouvrent des services externes, soumis à leurs propres conditions et politiques de confidentialité. Le site peut être temporairement indisponible pour maintenance ou en cas de problème technique.</p></section>
    <section><h2>Données et contact</h2><p>Les informations relatives à tes données et aux cookies figurent dans la <Link href="/confidentialite">politique de données personnelles</Link> et la <Link href="/cookies">politique de cookies</Link>. Pour toute question, écris à <a href="mailto:bonjour@bottt.fr">bonjour@bottt.fr</a>.</p></section>
  </>;
}
