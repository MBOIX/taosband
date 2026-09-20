// Façade « clic pour charger » du lecteur Bandcamp.
//
// Ce fichier est servi tel quel sur un dépôt public : il ne renvoie à aucun
// document interne. La spécification et le contrôle qui l'imposent se lisent
// dans le dépôt du générateur.
//
// Sans ce script, l'élément marqué [data-facade-bandcamp] est un simple lien
// <a href="…bandcampUrl…" target="_blank"> vers la page Bandcamp de l'album :
// c'est le comportement par défaut, déjà correct sans JavaScript. Ce script
// n'est qu'une amélioration progressive : au clic, il annule la navigation et
// injecte l'iframe à la place.
//
// Aucune iframe n'existe dans le HTML servi : elle est entièrement construite
// ici, après une action volontaire de la personne.
(function () {
  "use strict";

  // Hauteur usuellement constatée pour un lecteur Bandcamp size=large sans
  // tracklist. Non garantie par Bandcamp, et non vérifiée officiellement : la
  // valeur vient de l'observation. Une façade peut la
  // remplacer via l'attribut data-hauteur si la valeur exacte est un jour
  // récupérée depuis Partager > Intégrer sur la page de l'album.
  var HAUTEUR_PAR_DEFAUT = 472;

  function construireIframe(facade) {
    var albumId = facade.dataset.albumId;
    var titreAlbum = facade.dataset.titreAlbum || "";
    var hauteur = facade.dataset.hauteur || HAUTEUR_PAR_DEFAUT;

    var iframe = document.createElement("iframe");
    iframe.className = "facade-audio__iframe";
    iframe.width = "100%";
    iframe.height = String(hauteur);
    iframe.loading = "lazy";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allow = "clipboard-write; encrypted-media";
    iframe.title = "Lecteur Bandcamp : " + titreAlbum;
    iframe.src =
      "https://bandcamp.com/EmbeddedPlayer/album=" +
      encodeURIComponent(albumId) +
      "/size=large/bgcol=030303/linkcol=849356/tracklist=false/transparent=true/";

    return iframe;
  }

  document.addEventListener("click", function (evenement) {
    var facade = evenement.target.closest("[data-facade-bandcamp]");
    if (!facade || !facade.dataset.albumId) return;

    evenement.preventDefault();
    facade.replaceWith(construireIframe(facade));
  });
})();
