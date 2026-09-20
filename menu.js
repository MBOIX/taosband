// Menu mobile : amélioration progressive du <details class="nav-principale">
// de page.mjs. Le disclosure natif suffit à lui seul (ouverture au clic ou au
// clavier, fermeture au clic sur le résumé, lecteur d'écran) : ce script ne
// fait que fermer le menu après le choix d'une entrée, pour éviter qu'il
// reste déplié après une navigation dans un contexte où la page ne se
// recharge pas immédiatement (retour arrière du navigateur, par exemple).
(function () {
  "use strict";

  var menu = document.querySelector(".nav-principale");
  if (!menu) return;

  menu.querySelectorAll(".nav-principale__liste a").forEach(function (lien) {
    lien.addEventListener("click", function () {
      menu.open = false;
    });
  });
})();
