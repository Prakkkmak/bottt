/**
 * The rules sheet handed to players, front and back: the official « Rules Explanation » of The Pandemonium Institute in
 * BambiPotato's French translation (CC BY 4.0), lightly adapted: the Storyteller's signals said in words, repeats removed.
 */
export function RulesSheet() {
  return <div className="rules-sheet">
    <div className="rules-side">
      <p className="rules-face">Recto</p>
      <section aria-labelledby="regles-avant">
        <h3 id="regles-avant">Avant que la partie commence</h3>
        <p>Il y a longtemps, dans le paisible village de Ravenswood Bluff, en pleine tempête, à minuit pile… un cri retentit. Sur la place du village, vous découvrez que votre Conteur bien-aimé a été assassiné, empalé sur l’aiguille de l’horloge. Le sang coule sur les pavés.</p>
        <p>Vous comprenez aussitôt qu’il s’agit de l’œuvre d’un Démon, qui tue la nuit et prend forme humaine le jour.</p>
        <p>Vous allez recevoir en secret un jeton de rôle : <strong className="rules-good">bleu</strong>, vous êtes du camp du <strong className="rules-good">Bien</strong> ; <strong className="rules-evil">rouge</strong>, du camp du <strong className="rules-evil">Mal</strong>.</p>
        <ul>
          <li><strong className="rules-good">Si vous êtes Bon</strong> : trouvez et exécutez le Démon, et le Bien gagne.</li>
          <li><strong className="rules-evil">Si vous êtes Maléfique</strong> : détruisez le village. S’il ne reste que deux joueurs en vie, dont le Démon, le Mal gagne.</li>
        </ul>
      </section>
      <section aria-labelledby="regles-jour">
        <h3 id="regles-jour">Le jour</h3>
        <p>Discutez, enquêtez, accusez. La plupart des joueurs du Bien partagent leurs informations pour démasquer le Démon. Attention : certains mentent… et si vous êtes Maléfique, vous devrez mentir.</p>
      </section>
      <section aria-labelledby="regles-nuit">
        <h3 id="regles-nuit">La nuit</h3>
        <p>Tout le monde ferme les yeux. Le Conteur réveille certains joueurs pour utiliser leur capacité ou leur donner des informations. Ses signaux :</p>
        <ul className="rules-signals">
          <li><strong>Deux tapes sur l’épaule ou le genou</strong> : ouvrez les yeux.</li>
          <li><strong>Une main devant les yeux</strong> : rendormez-vous.</li>
          <li><strong>Hocher la tête</strong> : oui. <strong>Secouer la tête</strong> : non.</li>
          <li><strong>Pouce levé</strong> : Bon. <strong>Pouce baissé</strong> : Maléfique.</li>
          <li><strong>Des doigts levés</strong> : un nombre, 0, 1, 2, 3…</li>
          <li><strong>Un doigt pointé</strong> : choisir une personne.</li>
        </ul>
      </section>
      <section aria-labelledby="regles-mort">
        <h3 id="regles-mort">La mort n’est pas la fin</h3>
        <p>À Ravenswood Bluff, mourir n’est pas grave. Une fois mort :</p>
        <ul>
          <li>vous continuez de parler et d’influencer le village ;</li>
          <li>vous fermez toujours les yeux la nuit ;</li>
          <li>vous gagnez ou perdez avec votre équipe.</li>
        </ul>
        <p>Mais vous perdez votre capacité, vous ne pouvez plus nommer, et il ne vous reste qu’un seul vote pour le reste de la partie : utilisez-le avec soin.</p>
      </section>
    </div>
    <div className="rules-side">
      <p className="rules-face">Verso</p>
      <section aria-labelledby="regles-essentielles" className="rules-essentials">
        <h3 id="regles-essentielles">Les 4 règles essentielles</h3>
        <ol>
          <li><strong>Vous pouvez dire ce que vous voulez, quand vous voulez.</strong> C’est un jeu de déduction sociale : à vous de choisir entre discussion publique et conversations privées.</li>
          <li><strong>Pas d’espionnage.</strong> Gardez votre jeton de rôle secret et ne regardez jamais le Grimoire, qui contient tous les rôles. Voir ce que vous ne devriez pas voir gâche le plaisir.</li>
          <li><strong>Posez vos questions au Conteur.</strong> Un doute sur votre rôle, sur un rôle que vous bluffez, sur un événement de la nuit, ou besoin d’un conseil de stratégie : demandez. Le Conteur est neutre et là pour vous aider. Faites-lui signe et parlez-en en privé, pour ne rien révéler aux autres.</li>
          <li><strong>Jouez avec respect et bienveillance.</strong> Le jeu parle de tromperie, pas d’irrespect. Tuez avec élégance, et mourez avec dignité.</li>
        </ol>
      </section>
      <section aria-labelledby="regles-ivresse">
        <h3 id="regles-ivresse">Ivresse et poison</h3>
        <p>Le Conteur peut donner de fausses informations. Si vous êtes ivre (l’Ivrogne, par exemple) ou empoisonné, votre capacité ne fonctionne pas, mais le Conteur fait comme si elle fonctionnait.</p>
        <ul>
          <li>L’Ivrogne pense être un Villageois, mais sa capacité est inactive.</li>
          <li>Une personne empoisonnée agit normalement, mais ses résultats peuvent être faux.</li>
        </ul>
      </section>
      <section aria-labelledby="regles-votes">
        <h3 id="regles-votes">Nominations et exécutions</h3>
        <ul>
          <li>Pour nommer, dites clairement : « Je nomme Ben. »</li>
          <li>Tout le monde vote. Le Conteur annonce : « Les votes pour Ben, c’est parti. » Il fait le tour dans le sens des aiguilles d’une montre : main levée, vous votez pour l’exécution ; main baissée, contre.</li>
          <li>Le joueur nommé est exécuté s’il obtient les votes d’au moins la moitié des joueurs encore en vie. En cas d’égalité, personne n’est exécuté.</li>
          <li>Les morts restent essentiels : la partie se décide souvent grâce à leurs votes et à leurs avis.</li>
        </ul>
      </section>
    </div>
  </div>;
}
