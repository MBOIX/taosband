// Cadrage d'ouverture : tire au sort, à chaque chargement, sur quelle carte de
// membre la photo du groupe s'arrête et dans quel sens elle voyage, sous 600 px
// de large (charte graphique).
//
// Les deux tirages sont indépendants : trois cartes, deux sens, six
// combinaisons. C'est ce qui évite de toujours montrer les mêmes visages —
// aucun membre n'est privilégié d'un chargement à l'autre.
//
// Amélioration progressive du travelling de styles.css, comme menu.js l'est du
// <details> de la navigation : sans ce script, la photo s'arrête sur la carte
// du milieu et voyage vers la droite, et l'ouverture reste complète.
//
// Ce fichier porte aussi le défilement horizontal au doigt — le cadrage de
// départ s'y pose en pixels, ce que le CSS ne sait pas faire — et le repli de
// la dérive au défilement, pour les navigateurs qui ne savent pas lier une
// animation à la position de défilement (Safari avant la 26, Firefox avant la
// 144). Là où ils le savent, styles.css s'en charge seul et ce repli ne s'arme
// jamais : c'est ce qui garde le calcul hors du fil principal partout où c'est
// possible.
(function () {
  "use strict";

  var MOBILE = "(max-width: 37.49em)";
  var MOUVEMENT_REDUIT = "(prefers-reduced-motion: reduce)";

  // Les trois cartes centrables, mesurées sur la photo : au-delà, centrer
  // découvrirait un bord vide. Le vert et le turquoise sont hors de cette
  // liste pour cette raison — c'est la dérive qui va les chercher, et
  // désormais le doigt qui les atteint pour de bon.
  var CARTES = ["-11.9%", "-29.4%", "-47.7%"]; // orange, jaune, rose

  // Doivent rester d'accord avec styles.css : même course que `--course`,
  // même repère que `animation-range: 0 125vw`, même durée que le travelling
  // (1600 ms) additionnée de son délai (250 ms).
  var COURSE = 10;
  var COURSE_EN_LARGEURS = 1.25;
  var FIN_DU_TRAVELLING = 1850;

  // Les touches qui déplacent le rail, et elles seules.
  var TOUCHES_DU_RAIL = ["ArrowLeft", "ArrowRight", "Home", "End"];

  // Retire les écouteurs scroll/resize posés par un appel précédent
  // d'executer() (voir armerLaDerive) : window survit à un changement de
  // page par navigation.js (§ 10.5), contrairement à .ouverture__photo, donc
  // rien ne les retire tout seul. Remplacée à chaque armement, appelée au
  // suivant.
  var nettoyerEcouteursFenetre = function () {};

  executer();
  document.addEventListener("taos:page-changee", executer);

  function executer() {
  nettoyerEcouteursFenetre();
  nettoyerEcouteursFenetre = function () {};

  var photo = document.querySelector(".ouverture__photo");
  if (!photo) return;

  var rail = photo.querySelector("picture");
  var carte = CARTES[Math.floor(Math.random() * CARTES.length)];
  var sens = Math.random() < 0.5 ? 1 : -1;

  // Vrai dès que l'utilisateur a saisi le rail : la dérive lui a rendu la main
  // et ne doit plus rien déplacer, ni en CSS ni ici.
  var deriveGelee = false;
  var railArme = false;
  var courseLiberee = false;

  photo.style.setProperty("--sens", sens);

  var surMobile = window.matchMedia ? matchMedia(MOBILE) : null;
  if (rail && surMobile) {
    appliquerLeCadrage();
    ecouter(surMobile, appliquerLeCadrage);
  } else {
    photo.style.setProperty("--carte", carte);
  }

  if (!window.CSS || !CSS.supports("animation-timeline", "scroll()")) {
    armerLaDerive();
  }

  /* --- Cadrage de départ ---------------------------------------------------
   *
   * Deux façons de poser la carte tirée, selon que le rail se défile ou non.
   * En transformation, le CSS s'en charge seul à partir de `--carte`. En
   * défilement, c'est une position en pixels, donc ce script — et `--carte`
   * doit alors rester à zéro, sans quoi la transformation s'ajouterait au
   * défilement et le cadrage compterait double.
   */
  function appliquerLeCadrage() {
    if (!surMobile.matches) {
      photo.classList.remove("ouverture__photo--defilable");
      photo.removeAttribute("data-defilement");
      photo.removeAttribute("tabindex");
      photo.removeAttribute("role");
      photo.removeAttribute("aria-label");
      photo.style.setProperty("--carte", carte);
      return;
    }

    photo.style.removeProperty("--carte");
    photo.classList.add("ouverture__photo--defilable");

    // La classe remet le rail dans le flux : sa largeur mise en page n'existe
    // qu'après, et c'est elle qui convertit la carte en pixels.
    if (!deriveGelee) photo.scrollLeft = (rail.offsetWidth * -parseFloat(carte)) / 100;

    rendreLeRailManipulable();
    if (courseLiberee) libererLaCourse(); // l'ouverture était finie avant la bascule
  }

  /* --- Passage de main -----------------------------------------------------
   *
   * Pendant l'ouverture le rail ne se défile que par script : le travelling
   * joue sans que personne puisse le prendre à contre-sens. La course s'ouvre
   * ensuite, et le premier geste fige la dérive.
   */
  function rendreLeRailManipulable() {
    annoncerLeCadreCommeDefilable();
    if (railArme) return;
    railArme = true;

    guetterLePremierGeste();
    attendreLaFinDuTravelling();
  }

  /** Un cadre qui se défile doit s'atteindre au clavier autant qu'au doigt. */
  function annoncerLeCadreCommeDefilable() {
    photo.setAttribute("tabindex", "0");
    photo.setAttribute("role", "group");
    photo.setAttribute("aria-label", "Photo du groupe, défilable horizontalement");
  }

  /**
   * Ces trois événements précèdent tous le défilement qu'ils déclenchent : la
   * dérive est donc absorbée avant que quoi que ce soit ait bougé, et le
   * passage de main ne se voit pas.
   */
  function guetterLePremierGeste() {
    photo.addEventListener("pointerdown", gelerLaDerive, { passive: true });
    photo.addEventListener("wheel", gelerLaDerive, { passive: true });
    photo.addEventListener("keydown", function (evenement) {
      // Seules les touches qui parcourent le rail prennent la main : sans ce
      // tri, une simple tabulation suffirait à figer la dérive.
      if (TOUCHES_DU_RAIL.indexOf(evenement.key) !== -1) gelerLaDerive();
    });
  }

  function attendreLaFinDuTravelling() {
    if (matchMedia(MOUVEMENT_REDUIT).matches) {
      libererLaCourse(); // pas de travelling à protéger
      return;
    }

    var img = photo.querySelector("img");
    if (img) {
      img.addEventListener("animationend", function (evenement) {
        if (evenement.animationName === "ouverture-travelling") libererLaCourse();
      });
    }
    // Ceinture : si l'animation n'a pas lieu — onglet en arrière-plan au
    // chargement, image absente — la course s'ouvre quand même.
    window.setTimeout(libererLaCourse, FIN_DU_TRAVELLING);
  }

  function libererLaCourse() {
    courseLiberee = true;
    photo.setAttribute("data-defilement", "libre");
  }

  /**
   * Reporte le décalage que la dérive avait déjà pris dans la position de
   * défilement, puis l'éteint. Le rail ne bouge pas d'un pixel à cet instant :
   * seul change ce qui le porte. Le débattement de ±10 % disparaît avec elle,
   * donc la course couvre ensuite le rail entier — les cinq membres, vert et
   * turquoise compris — sans jamais découvrir de bord vide.
   */
  function gelerLaDerive() {
    if (deriveGelee || !surMobile.matches) return;
    deriveGelee = true;

    photo.scrollLeft -= decalageDuRail();
    rail.style.animation = "none";
    rail.style.transform = "none";
  }

  /**
   * Translation horizontale du rail, en pixels, animée en CSS ou posée ici.
   *
   * Une transformation illisible ne justifie pas de renoncer au passage de
   * main : on la traite comme une absence de dérive, quitte à ce que le rail
   * saute d'un cheveu, plutôt que de laisser l'utilisateur sans prise.
   */
  function decalageDuRail() {
    var transformation = getComputedStyle(rail).transform;
    if (!transformation || transformation === "none") return 0;
    try {
      return new DOMMatrixReadOnly(transformation).m41;
    } catch (transformationIllisible) {
      return 0;
    }
  }

  /* --- Repli de la dérive --------------------------------------------------
   *
   * Rejoue à la main ce que `scroll(root block)` fait seul ailleurs.
   */
  function armerLaDerive() {
    if (!rail) return;

    var trameDemandee = false;

    window.addEventListener("scroll", demanderUneTrame, { passive: true });
    window.addEventListener("resize", demanderUneTrame);
    nettoyerEcouteursFenetre = function () {
      window.removeEventListener("scroll", demanderUneTrame);
      window.removeEventListener("resize", demanderUneTrame);
    };
    placer();

    function demanderUneTrame() {
      if (trameDemandee) return;
      trameDemandee = true;
      window.requestAnimationFrame(placer);
    }

    function placer() {
      trameDemandee = false;

      // La main est passée au doigt : plus rien à déplacer.
      if (deriveGelee) return;

      // Hors du mobile, ou mouvement réduit : on rend la main au CSS plutôt
      // que de laisser une transformation en ligne figée sur la photo.
      if (!matchMedia(MOBILE).matches || matchMedia(MOUVEMENT_REDUIT).matches) {
        rail.style.transform = "";
        return;
      }

      var course = window.innerWidth * COURSE_EN_LARGEURS;
      var avancement = Math.min(1, Math.max(0, window.scrollY / course));
      rail.style.transform = "translateX(" + sens * COURSE * avancement + "%)";
    }
  }

  /** `addEventListener` sur une requête de média, avec le repli des vieux Safari. */
  function ecouter(requete, reaction) {
    if (requete.addEventListener) requete.addEventListener("change", reaction);
    else requete.addListener(reaction);
  }
  }
})();
