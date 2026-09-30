'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="centered-panel panel"><h1>Un petit contretemps.</h1><p>La page n’a pas pu être chargée. Tes inscriptions sont conservées.</p><button className="button primary" onClick={reset}>Réessayer</button><a href="/">Retour aux sessions</a></main>;}
