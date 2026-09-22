// Line-up de la page « Le groupe » : ordre de présentation tiré au sort à
// chaque chargement.
//
// Les cinq musiciens ne sont pas classés. L'ordre du HTML servi est celui dans
// lequel les fiches sont lues : le figer à l'écran reviendrait à poser une
// hiérarchie que le groupe n'a pas, et à laisser toujours le même portrait en
// tête de grille.
//
// Le document servi garde, lui, un ordre stable : sans JavaScript la page
// reste complète, et les moteurs lisent une liste, pas un tirage.
//
// Les éléments sont déplacés dans le document plutôt que réordonnés à l'écran
// par la propriété CSS `order` : sous 600 px, la feuille de style donne la
// pleine largeur au cinquième portrait, et elle compte dans l'ordre du
// document. Un réordonnancement purement visuel laisserait cette pleine
// largeur à un portrait affiché ailleurs dans la grille.
(function () {
  "use strict";

  executer();
  // navigation.js (§ 10.5) remplace <main> sans recharger le document : ce
  // point d'entrée idempotent est rejoué à chaque changement de page pour
  // retirer un nouveau tirage. Gardé optionnel : les tests exécutent ce
  // fichier dans un contexte minimal où document.addEventListener n'existe
  // pas (ligne-up.test.mjs).
  if (document.addEventListener) {
    document.addEventListener("taos:page-changee", executer);
  }

  function executer() {
  var liste = document.querySelector(".ligne-up");
  if (!liste) return;

  var membres = Array.prototype.slice.call(liste.children);
  if (membres.length < 2) return;

  // Mélange de Fisher-Yates : chacun des ordres possibles a la même chance.
  // Tirer l'indice dans tout le tableau au lieu de la partie non encore
  // mélangée en favoriserait certains.
  for (var i = membres.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var echange = membres[i];
    membres[i] = membres[j];
    membres[j] = echange;
  }

  // Un fragment pour ne toucher au document qu'une fois : réinsérés un à un,
  // les portraits feraient autant de recalculs de la grille.
  var fragment = document.createDocumentFragment();
  membres.forEach(function (membre) {
    fragment.appendChild(membre);
  });
  liste.appendChild(fragment);
  }
})();
