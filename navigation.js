// Navigation par échange du contenu.
//
// Reste INERTE tant qu'aucune lecture n'a commencé : ce module ne s'arme qu'à
// la réception de l'événement « taos:lecture-demarree » sur document, posé
// par la barre de lecture au premier clic sur lecture. Avant cet armement,
// aucun clic n'est intercepté et le site navigue comme n'importe quel site
// sans JavaScript. C'est le choix qui borne le risque de ce module : une
// visite qui n'écoute jamais un extrait ne prend aucun risque, seule une
// lecture en cours justifie de protéger la continuité du son en évitant un
// rechargement complet du document.
//
// Amélioration progressive à deux niveaux : sans JavaScript, les liens
// restent des liens ; et à la moindre anomalie une fois armé (réponse non
// conforme, erreur réseau, <main> introuvable, analyse impossible), le
// module abandonne et laisse le navigateur charger la page normalement — le
// son s'arrête alors, ce qui est déjà le comportement d'aujourd'hui : une
// dégradation, jamais une page cassée.
(function () {
  "use strict";

  var SELECTEUR_MAIN = "#contenu";
  var EVENEMENT_ARMEMENT = "taos:lecture-demarree";
  var EVENEMENT_CHANGEMENT = "taos:page-changee";

  var armee = false;
  // Chemin de la page réellement affichée dans le document. Il ne suit pas
  // l'adresse du navigateur pendant un parcours d'historique : c'est
  // justement l'écart entre les deux qui dit s'il y a quelque chose à faire.
  var cheminAffiche = location.pathname;

  document.addEventListener(EVENEMENT_ARMEMENT, function () {
    armee = true;
  });

  document.addEventListener("click", gererClic);

  // Retour arrière et retour avant. Les entrées posées par ce module (marquées
  // à la pose, voir naviguerVers) refont le chemin par échange.
  //
  // Une entrée antérieure à l'armement — typiquement celle du chargement
  // initial, où la personne revient après deux retours en arrière — n'a pas ce
  // marqueur. Ne rien faire ne la laisse pas « se recharger normalement » : un
  // parcours d'historique dans le même document ne recharge rien, si bien que
  // l'adresse changerait pendant que le contenu affiché resterait celui de la
  // page précédente. Il faut donc recharger explicitement. Le son s'arrête,
  // c'est la dégradation assumée : une page juste vaut mieux qu'un son qui
  // continue sur une adresse qui ment.
  window.addEventListener("popstate", function (evenement) {
    if (!armee) return;
    if (evenement.state && evenement.state.taosNavigation) {
      naviguerVers(location.href, { pousserHistorique: false });
      return;
    }
    // Entrée que ce module n'a pas posée. Deux cas très différents, que le
    // seul marqueur ne distingue pas :
    //
    // - le chemin est celui déjà affiché : c'est un déplacement entre ancres
    //   de la même page, poussé par le navigateur. Le contenu affiché est
    //   juste, il n'y a rien à faire — recharger couperait le son pour rien ;
    // - le chemin diffère : c'est une entrée antérieure à l'armement,
    //   typiquement la page de départ retrouvée après deux retours en arrière.
    //   Un parcours d'historique dans le même document ne recharge rien de
    //   lui-même, donc sans rechargement explicite l'adresse mentirait sur le
    //   contenu affiché.
    if (location.pathname !== cheminAffiche) {
      window.location.reload();
    }
  });

  /**
   * Le clic lui-même laisse la main au navigateur dès qu'il porte une
   * intention différente d'une navigation simple : bouton secondaire ou du
   * milieu, ou une touche de modification (nouvel onglet, nouvelle fenêtre).
   */
  function estClicOrdinaire(evenement) {
    return (
      evenement.button === 0 &&
      !evenement.metaKey &&
      !evenement.ctrlKey &&
      !evenement.shiftKey &&
      !evenement.altKey
    );
  }

  /**
   * Un lien mérite l'échange de contenu : même origine, aucune cible ni
   * téléchargement explicites, et pas une simple ancre vers la page déjà
   * affichée — rien n'y est à échanger, le navigateur sait déjà faire.
   *
   * @param {{origin: string, pathname: string, target: string, hasAttribute: function}} lien
   * @param {{origin: string, pathname: string}} origine page actuellement affichée, le point de référence de la comparaison
   */
  function doitIntercepter(lien, origine) {
    if (!lien || !origine) return false;
    if (lien.target) return false;
    if (lien.hasAttribute && lien.hasAttribute("download")) return false;
    if (lien.origin !== origine.origin) return false;
    if (lien.pathname === origine.pathname) return false;
    if (estUnFichier(lien.pathname)) return false;
    return true;
  }

  /**
   * Les pages du site sont des dossiers : leur adresse finit par une barre
   * oblique. Un dernier segment qui porte une extension désigne donc un
   * fichier — la fiche technique en PDF, les archives de la page qui s'adresse
   * aux personnes qui programment.
   *
   * Intercepter un tel lien serait doublement mauvais : le fichier serait
   * entièrement chargé en mémoire par la récupération, l'analyse n'y
   * trouverait pas de `<main>`, et le repli le ferait télécharger une seconde
   * fois. Une archive de photos en haute définition, sur un téléphone, deux
   * fois.
   */
  function estUnFichier(chemin) {
    var segments = String(chemin).split("/");
    return segments[segments.length - 1].indexOf(".") !== -1;
  }

  /**
   * Extrait du texte d'une page servie ce dont l'échange a besoin : titre,
   * description, lien canonique, blocs JSON-LD et le `<main>`. Par
   * expressions régulières plutôt que par un analyseur HTML complet — les
   * gabarits (page.mjs) écrivent toujours ces balises sous la même forme
   * exacte, comme ouverture.test.mjs le fait déjà pour styles.css.
   * Renvoie null si le `<main id="contenu">` attendu est introuvable :
   * l'appelant abandonne alors l'échange plutôt que de deviner un contenu.
   */
  function extraireContenu(texteHtml) {
    if (typeof texteHtml !== "string") return null;

    var main = texteHtml.match(/<main id="contenu">([\s\S]*?)<\/main>/);
    if (!main) return null;

    var titre = texteHtml.match(/<title>([\s\S]*?)<\/title>/);
    var description = texteHtml.match(/<meta name="description" content="([^"]*)"/);
    var canonical = texteHtml.match(/<link rel="canonical" href="([^"]*)"/);
    var jsonld = [];
    var regexJsonld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
    var trouve;
    while ((trouve = regexJsonld.exec(texteHtml))) {
      jsonld.push(trouve[1]);
    }

    return {
      main: main[1],
      titre: titre ? decoderEntitesHtml(titre[1]) : "",
      description: description ? decoderEntitesHtml(description[1]) : "",
      canonical: canonical ? canonical[1] : "",
      jsonld: jsonld,
    };
  }

  // page.mjs échappe titre et description avec echapperHtml/echapperAttribut
  // avant de les écrire dans le HTML servi : les relire tels quels afficherait
  // un « &amp; » littéral au lieu d'une esperluette.
  function decoderEntitesHtml(texte) {
    return String(texte)
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }

  function gererClic(evenement) {
    if (!armee || !estClicOrdinaire(evenement)) return;

    var lien = evenement.target.closest ? evenement.target.closest("a[href]") : null;
    if (!lien || !doitIntercepter(lien, location)) return;

    evenement.preventDefault();
    naviguerVers(lien.href, { pousserHistorique: true });
  }

  // Numéro de la dernière navigation demandée. Deux clics rapprochés lancent
  // deux récupérations que rien n'annule : sans ce compteur, la page affichée
  // serait celle qui répond en dernier et non la dernière demandée, et l'échec
  // tardif de la première ferait quitter une adresse déjà abandonnée.
  var navigationCourante = 0;

  function naviguerVers(url, options) {
    navigationCourante += 1;
    var laMienne = navigationCourante;

    fetch(url)
      .then(function (reponse) {
        if (!reponse.ok) throw new Error("réponse non conforme");
        return reponse.text();
      })
      .then(function (texteHtml) {
        if (laMienne !== navigationCourante) return;
        var contenu = extraireContenu(texteHtml);
        if (!contenu) throw new Error("<main> introuvable ou analyse impossible");
        echangerContenu(url, contenu, options);
      })
      .catch(function () {
        // Anomalie à quelque étape que ce soit : le navigateur reprend la
        // main comme il l'aurait fait sans ce module — mais seulement si
        // personne n'a demandé autre chose depuis.
        if (laMienne !== navigationCourante) return;
        location.href = url;
      });
  }

  function echangerContenu(url, contenu, options) {
    var main = document.querySelector(SELECTEUR_MAIN);
    if (!main) {
      location.href = url;
      return;
    }

    main.outerHTML = '<main id="contenu">' + contenu.main + "</main>";
    document.title = contenu.titre;
    mettreAJourAttribut('meta[name="description"]', "content", contenu.description);
    mettreAJourAttribut('link[rel="canonical"]', "href", contenu.canonical);
    remplacerJsonld(contenu.jsonld);
    mettreAJourNavigationCourante(url);
    fermerLeMenuMobile();

    if (options.pousserHistorique) {
      history.pushState({ taosNavigation: true }, "", url);
    }

    cheminAffiche = new URL(url, location.href).pathname;

    // Un lien peut viser une ancre d'une autre page — « Crédits photo », dans
    // le pied de page de toutes les pages, vise une ancre des mentions
    // légales. Le navigateur l'aurait honorée ; l'échange de contenu doit donc
    // la retrouver lui-même, faute de quoi la personne arriverait en haut de
    // la page cible sans comprendre pourquoi.
    var ancre = new URL(url, location.href).hash;
    var cible = ancre ? document.getElementById(decodeURIComponent(ancre.slice(1))) : null;
    if (cible) {
      // Le focus suit la destination plutôt que le titre de la page : c'est ce
      // que fait le navigateur sur un lien d'ancre, et poser le focus sur le
      // h1 ramènerait le défilement en haut, annulant l'ancre.
      cible.setAttribute("tabindex", "-1");
      cible.focus();
      if (cible.scrollIntoView) cible.scrollIntoView();
    } else {
      window.scrollTo(0, 0);
      poserLeFocusSurLeTitre();
    }
    annoncerLeChangement(contenu.titre);

    document.dispatchEvent(new CustomEvent(EVENEMENT_CHANGEMENT));
  }

  function mettreAJourAttribut(selecteur, attribut, valeur) {
    var element = document.querySelector(selecteur);
    if (element) element.setAttribute(attribut, valeur);
  }

  function remplacerJsonld(blocs) {
    document.querySelectorAll('script[type="application/ld+json"]').forEach(function (script) {
      script.remove();
    });
    blocs.forEach(function (bloc) {
      var script = document.createElement("script");
      script.type = "application/ld+json";
      script.textContent = bloc;
      document.head.appendChild(script);
    });
  }

  function mettreAJourNavigationCourante(url) {
    var chemin = new URL(url, location.href).pathname;
    document.querySelectorAll(".nav-principale__liste a").forEach(function (lien) {
      var estCourant = new URL(lien.getAttribute("href"), location.href).pathname === chemin;
      if (estCourant) lien.setAttribute("aria-current", "page");
      else lien.removeAttribute("aria-current");
    });
  }

  function fermerLeMenuMobile() {
    var menu = document.querySelector(".nav-principale");
    if (menu) menu.open = false;
  }

  function poserLeFocusSurLeTitre() {
    var titre = document.querySelector("#contenu h1");
    if (!titre) return;
    if (!titre.hasAttribute("tabindex")) titre.setAttribute("tabindex", "-1");
    titre.focus();
  }

  // Région dédiée (§ 10.5), posée une fois et réutilisée à chaque
  // changement : la recréer à chaque navigation empêcherait certains
  // lecteurs d'écran de la repérer comme la même région vivante.
  function annoncerLeChangement(titre) {
    var region = document.getElementById("annonce-navigation");
    if (!region) {
      region = document.createElement("div");
      region.id = "annonce-navigation";
      region.setAttribute("role", "status");
      region.setAttribute("aria-live", "polite");
      region.style.position = "absolute";
      region.style.width = "1px";
      region.style.height = "1px";
      region.style.overflow = "hidden";
      region.style.clipPath = "inset(50%)";
      region.style.whiteSpace = "nowrap";
      document.body.appendChild(region);
    }
    region.textContent = "Page chargée : " + titre;
  }

  // Exposé uniquement pour src/navigation.test.mjs : ces fonctions ne
  // dépendent ni du réseau ni de l'historique, mais restent fermées dans
  // cette IIFE comme le reste du script (même forme que facade.js) — ce
  // point d'accès est leur seule porte pour un test mené hors navigateur.
  if (typeof window !== "undefined") {
    window.__navigationTaos = {
      doitIntercepter: doitIntercepter,
      extraireContenu: extraireContenu,
      estClicOrdinaire: estClicOrdinaire,
      gererClic: gererClic,
    };
  }
})();
