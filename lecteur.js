// Barre de lecture persistante : comportement client.
//
// Sans ce script, la barre reste telle que le serveur l'a rendue : masquée
// (attribut hidden) et sans le moindre extrait chargé. C'est une amélioration
// progressive au sens strict, comme facade.js et ligne-up.js : rien sur la
// page ne dépend de ce fichier pour fonctionner.
//
// Les boutons qui déclenchent une lecture (data-extrait="<identifiant de
// piste>") vivent dans les pages du site, pas dans ce fichier : il écoute
// leurs clics sur le document entier, comme facade.js le fait pour ses
// façades.
//
// Les trois fonctions qui suivent sont pures et posées hors de l'IIFE ci-
// dessous, à seule fin d'être testées isolément (src/lecteur.test.mjs) sans
// avoir à simuler un lecteur audio complet.
"use strict";

/** Formate une durée en secondes en "minutes:secondes" (102 -> "1:42"). */
function formaterDuree(secondesTotales) {
  var total = Math.max(0, Math.round(secondesTotales || 0));
  var minutes = Math.floor(total / 60);
  var secondes = total % 60;
  return minutes + ":" + (secondes < 10 ? "0" : "") + secondes;
}

/** Indice de la piste suivante, en boucle après la dernière (navigation manuelle,
    au bouton "suivant" — distinct de l'enchaînement automatique en fin de
    lecture, qui s'arrête après le dernier extrait). */
function indexPisteSuivante(indexCourant, nombrePistes) {
  if (nombrePistes <= 0) return -1;
  return (indexCourant + 1) % nombrePistes;
}

/** Indice de la piste précédente, en boucle avant la première. */
function indexPistePrecedente(indexCourant, nombrePistes) {
  if (nombrePistes <= 0) return -1;
  return (indexCourant - 1 + nombrePistes) % nombrePistes;
}

/** Position de lecture en pourcentage de la durée, bornée à [0, 100]. */
function positionEnPourcentage(tempsEcoule, duree) {
  if (!duree || duree <= 0) return 0;
  return Math.min(100, Math.max(0, (tempsEcoule / duree) * 100));
}

(function () {
  var CLE_PISTE = "taos-lecteur-piste";
  var CLE_POSITION = "taos-lecteur-position";

  var barre = document.getElementById("lecteur-persistant");
  if (!barre) return;

  var pistes;
  try {
    pistes = JSON.parse(barre.dataset.pistes || "[]");
  } catch (erreur) {
    console.error("Lecteur : données de pistes illisibles.", erreur);
    pistes = [];
  }
  if (pistes.length === 0) return;

  var urlSource = barre.dataset.sourceUrl;
  var titreAlbum = barre.dataset.albumTitre || "";
  var pochette = barre.dataset.pochetteUrl || "";

  var audio = barre.querySelector(".lecteur-persistant__audio");
  var boutonLecture = barre.querySelector(".lecteur-persistant__lecture");
  var boutonPrecedent = barre.querySelector(".lecteur-persistant__precedent");
  var boutonSuivant = barre.querySelector(".lecteur-persistant__suivant");
  var boutonFermeture = barre.querySelector(".lecteur-persistant__fermeture");
  var champTitrePiste = barre.querySelector(".lecteur-persistant__titre-piste");
  var champTemps = barre.querySelector(".lecteur-persistant__temps");
  var zoneAnnonce = barre.querySelector(".lecteur-persistant__annonce");
  var curseur = barre.querySelector(".lecteur-persistant__position");
  var canevas = barre.querySelector(".lecteur-persistant__canevas");
  var contexteCanevas = canevas ? canevas.getContext("2d") : null;

  var extraitsParSlug = {};
  var promesseSource = null;
  var indexCourant = -1;
  var premiereLecture = false;
  var deplacementEnCours = false;
  var positionARestaurer = 0;

  // --- Persistance de la position, protégée : en navigation privée, l'accès
  // à sessionStorage peut lever une exception, et la barre doit continuer de
  // fonctionner malgré tout (elle ne retrouvera simplement pas sa position
  // au prochain chargement classique).
  function lireStockage(cle) {
    try {
      return sessionStorage.getItem(cle);
    } catch (erreur) {
      return null;
    }
  }

  function ecrireStockage(cle, valeur) {
    try {
      sessionStorage.setItem(cle, valeur);
    } catch (erreur) {
      // Quota dépassé ou navigation privée : rien à faire de plus, voir
      // lireStockage ci-dessus.
    }
  }

  function effacerStockage() {
    try {
      sessionStorage.removeItem(CLE_PISTE);
      sessionStorage.removeItem(CLE_POSITION);
    } catch (erreur) {
      // Voir lireStockage.
    }
  }

  function annoncer(message) {
    if (zoneAnnonce) zoneAnnonce.textContent = message;
  }

  /** Récupère une seule fois l'index des extraits : c'est la requête réseau que
      le premier clic autorise, et elle apporte à la fois l'adresse des fichiers
      audio et leurs pics de forme d'onde.

      Les adresses y sont relatives à l'index lui-même — « extraits/x.mp3 » à
      côté de « /assets/EXTRAITS.json » —, et se résolvent donc correctement que
      le site soit servi à la racine d'un domaine ou sous un sous-dossier, sans
      que le fichier ait à connaître sa propre adresse. */
  function recupererSource() {
    if (promesseSource) return promesseSource;
    promesseSource = fetch(urlSource)
      .then(function (reponse) {
        if (!reponse.ok) throw new Error("réponse HTTP " + reponse.status);
        return reponse.json();
      })
      .then(function (donnees) {
        var base = new URL(urlSource, window.location.href);
        Object.keys(donnees || {}).forEach(function (slug) {
          var entree = donnees[slug];
          if (!entree || !entree.fichier) return;
          extraitsParSlug[slug] = {
            url: new URL(entree.fichier, base).href,
            pics: entree.pics || null,
          };
        });
      })
      .catch(function (erreur) {
        console.error("Lecteur : index des extraits inaccessible.", erreur);
        annoncer("Les extraits n'ont pas pu être chargés.");
        // Rien n'est deviné : sans index, aucune adresse de fichier n'est
        // reconstruite de tête et aucune forme d'onde n'est dessinée.
      });
    return promesseSource;
  }

  // Les deux couleurs de l'onde sont lues une fois : `getComputedStyle` force
  // un recalcul de style, et l'onde se redessine quatre fois par seconde
  // pendant toute la lecture.
  var couleursOnde = null;

  function couleurs() {
    if (!couleursOnde) {
      var style = getComputedStyle(document.documentElement);
      couleursOnde = {
        jouee: style.getPropertyValue("--kaki-3").trim(),
        restante: style.getPropertyValue("--kaki-2").trim(),
      };
    }
    return couleursOnde;
  }

  function dessinerOnde() {
    if (!contexteCanevas || indexCourant < 0) return;

    var ratio = window.devicePixelRatio || 1;
    var largeur = canevas.clientWidth;
    var hauteur = canevas.clientHeight;
    if (largeur === 0 || hauteur === 0) return;
    // Redimensionner un canevas le réalloue et l'efface : ne le faire que
    // lorsque ses dimensions ont réellement changé, pas à chaque trame.
    var largeurVoulue = Math.round(largeur * ratio);
    var hauteurVoulue = Math.round(hauteur * ratio);
    if (canevas.width !== largeurVoulue || canevas.height !== hauteurVoulue) {
      canevas.width = largeurVoulue;
      canevas.height = hauteurVoulue;
    }
    contexteCanevas.setTransform(ratio, 0, 0, ratio, 0, 0);
    contexteCanevas.clearRect(0, 0, largeur, hauteur);

    var piste = pistes[indexCourant];
    var extrait = extraitsParSlug[piste.slug];
    var pics = extrait ? extrait.pics : null;
    if (!pics || pics.length === 0) return; // Donnée absente : rien dessiné, rien inventé.

    var progression = positionEnPourcentage(audio.currentTime, audio.duration || piste.duree);
    var largeurBarre = largeur / pics.length;
    var palette = couleurs();
    var couleurJouee = palette.jouee;
    var couleurRestante = palette.restante;

    pics.forEach(function (valeur, indice) {
      var hauteurBarre = Math.max(1, (valeur / 100) * hauteur);
      var positionBarre = (indice / pics.length) * 100;
      contexteCanevas.fillStyle = positionBarre <= progression ? couleurJouee : couleurRestante;
      contexteCanevas.fillRect(
        indice * largeurBarre,
        hauteur - hauteurBarre,
        Math.max(1, largeurBarre - 1),
        hauteurBarre,
      );
    });
  }

  function poserMetadonneesMediaSession(piste) {
    if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: piste.titre,
      artist: "TAOS",
      album: titreAlbum,
      // Ni `sizes` ni `type` : les dérivés de pochette du site sont de formats
      // et de tailles variables, et les renseigner au jugé donnerait à
      // l'appareil une information fausse. L'adresse seule suffit.
      artwork: pochette ? [{ src: new URL(pochette, window.location.href).href }] : [],
    });
  }

  function basculerIconeLecture(enLecture) {
    if (!boutonLecture) return;
    boutonLecture.setAttribute("aria-pressed", String(enLecture));
    boutonLecture.setAttribute("aria-label", enLecture ? "Mettre en pause" : "Lecture");
  }

  function reveler() {
    barre.hidden = false;
  }

  /** Affiche la position courante : curseur, temps lisible, et intitulé vocal.
   *
   * La valeur brute du curseur est un millième, qui ne veut rien dire à
   * l'oreille : une synthèse vocale annoncerait « 430 ». `aria-valuetext` lui
   * fait dire « 0:32 sur 1:15 », ce que le champ de temps montre par ailleurs
   * à l'écran — d'où son `aria-hidden`, qui évite de tout annoncer deux fois. */
  function afficherPosition(ecoule, duree) {
    var lisible = formaterDuree(ecoule) + " / " + formaterDuree(duree);
    if (curseur) {
      curseur.value = String(Math.round(positionEnPourcentage(ecoule, duree) * 10));
      curseur.setAttribute("aria-valuetext", formaterDuree(ecoule) + " sur " + formaterDuree(duree));
    }
    if (champTemps) champTemps.textContent = lisible;
  }

  function mettreAJourInfos(piste) {
    if (champTitrePiste) champTitrePiste.textContent = piste.titre;
    afficherPosition(0, piste.duree);
    poserMetadonneesMediaSession(piste);
  }

  /** Toutes les promesses de play() rejetées ne sont pas des pannes.
   *
   * Mettre en pause, fermer la barre ou changer de piste interrompt une lecture
   * en cours, et le navigateur rejette alors la promesse du play() précédent
   * avec « AbortError ». Traiter ce rejet comme un média défaillant faisait
   * sauter au titre suivant à chaque pause — et, la piste suivante étant
   * chargée en écrasant la source, en cascade sur toute la fin de la liste.
   *
   * Un refus de lecture automatique (« NotAllowedError ») n'est pas davantage
   * une panne : le fichier est bon, c'est le geste qui manque. On le dit, on
   * n'enchaîne pas.
   */
  function gererRejetDeLecture(piste, erreur) {
    var nom = erreur && erreur.name;
    if (nom === "AbortError") return;
    if (nom === "NotAllowedError") {
      annoncer("Appuyez sur lecture pour écouter « " + piste.titre + " ».");
      return;
    }
    passerAuSuivantApresEchec(piste, erreur);
  }

  /** Échec avéré du média : on le dit et on passe au titre suivant. */
  function passerAuSuivantApresEchec(piste, erreur) {
    console.error("Lecteur : échec de lecture pour « " + piste.titre + " ».", erreur);
    annoncer("« " + piste.titre + " » n'a pas pu être lu. Passage au titre suivant.");
    if (indexCourant + 1 < pistes.length) {
      chargerPiste(indexCourant + 1, { jouer: true });
    }
  }

  /** Charge une piste par son indice et, sur demande, la joue. L'adresse du
      fichier vient de l'index : l'attente de sa récupération est portée ici, une
      fois pour toutes, plutôt que laissée à chaque appelant — un oubli
      donnerait une barre qui affiche un titre et ne joue rien. */
  function chargerPiste(indice, options) {
    var piste = pistes[indice];
    if (!piste) return;
    recupererSource().then(function () {
      var extrait = extraitsParSlug[piste.slug];
      if (!extrait) {
        annoncer("« " + piste.titre + " » n'est pas disponible à l'écoute.");
        return;
      }
      indexCourant = indice;
      positionARestaurer = 0;
      audio.src = extrait.url;
      mettreAJourInfos(piste);
      ecrireStockage(CLE_PISTE, piste.slug);
      ecrireStockage(CLE_POSITION, "0");
      dessinerOnde();
      if (options && options.jouer) {
        audio.play().catch(function (erreur) {
          gererRejetDeLecture(piste, erreur);
        });
      }
    });
  }

  function demarrerDepuisBouton(indice) {
    reveler();
    chargerPiste(indice, { jouer: true });
  }

  audio.addEventListener("error", function () {
    var piste = pistes[indexCourant];
    if (piste) passerAuSuivantApresEchec(piste, audio.error);
  });

  // Le seul moment où poser une position retenue : avant, le média n'a pas de
  // durée et l'écriture est ignorée sans erreur.
  audio.addEventListener("loadedmetadata", function () {
    if (positionARestaurer <= 0) return;
    var cible = positionARestaurer;
    positionARestaurer = 0;
    if (cible < (audio.duration || 0)) audio.currentTime = cible;
  });

  audio.addEventListener("playing", function () {
    basculerIconeLecture(true);
    if (!premiereLecture) {
      premiereLecture = true;
      document.dispatchEvent(new CustomEvent("taos:lecture-demarree"));
    }
  });

  audio.addEventListener("pause", function () {
    basculerIconeLecture(false);
  });

  audio.addEventListener("timeupdate", function () {
    if (deplacementEnCours || indexCourant < 0) return;
    var piste = pistes[indexCourant];
    var duree = audio.duration || piste.duree;
    afficherPosition(audio.currentTime, duree);
    ecrireStockage(CLE_POSITION, String(audio.currentTime));
    dessinerOnde();
  });

  // Enchaînement automatique dans l'ordre de la tracklist, arrêt après le
  // dernier extrait (§ 10.4) : contrairement au bouton "suivant", la fin de
  // liste ne boucle pas toute seule.
  audio.addEventListener("ended", function () {
    if (indexCourant + 1 < pistes.length) {
      chargerPiste(indexCourant + 1, { jouer: true });
    }
  });

  if (boutonLecture) {
    boutonLecture.addEventListener("click", function () {
      if (indexCourant < 0) return;
      if (audio.paused) {
        audio.play().catch(function (erreur) {
          gererRejetDeLecture(pistes[indexCourant], erreur);
        });
      } else {
        audio.pause();
      }
    });
  }

  if (boutonSuivant) {
    boutonSuivant.addEventListener("click", function () {
      if (indexCourant < 0) return;
      chargerPiste(indexPisteSuivante(indexCourant, pistes.length), { jouer: !audio.paused });
    });
  }

  if (boutonPrecedent) {
    boutonPrecedent.addEventListener("click", function () {
      if (indexCourant < 0) return;
      chargerPiste(indexPistePrecedente(indexCourant, pistes.length), { jouer: !audio.paused });
    });
  }

  if (boutonFermeture) {
    boutonFermeture.addEventListener("click", function () {
      audio.pause();
      barre.hidden = true;
      effacerStockage();
    });
  }

  if (curseur) {
    curseur.addEventListener("input", function () {
      if (indexCourant < 0) return;
      var duree = audio.duration || pistes[indexCourant].duree;
      deplacementEnCours = true;
      audio.currentTime = (Number(curseur.value) / 1000) * duree;
      dessinerOnde();
    });
    curseur.addEventListener("change", function () {
      deplacementEnCours = false;
    });
  }

  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", function () {
      if (indexCourant < 0) return;
      audio.play().catch(function (erreur) {
        gererRejetDeLecture(pistes[indexCourant], erreur);
      });
    });
    navigator.mediaSession.setActionHandler("pause", function () {
      audio.pause();
    });
    navigator.mediaSession.setActionHandler("previoustrack", function () {
      if (indexCourant < 0) return;
      chargerPiste(indexPistePrecedente(indexCourant, pistes.length), { jouer: true });
    });
    navigator.mediaSession.setActionHandler("nexttrack", function () {
      if (indexCourant < 0) return;
      chargerPiste(indexPisteSuivante(indexCourant, pistes.length), { jouer: true });
    });
  }

  window.addEventListener("resize", dessinerOnde);

  document.addEventListener("click", function (evenement) {
    var declencheur = evenement.target.closest("[data-extrait]");
    if (!declencheur) return;

    var slug = declencheur.dataset.extrait;
    var indice = -1;
    for (var i = 0; i < pistes.length; i += 1) {
      if (pistes[i].slug === slug) {
        indice = i;
        break;
      }
    }
    if (indice === -1) {
      console.error("Lecteur : aucune piste ne correspond à l'extrait « " + slug + " ».");
      return;
    }
    demarrerDepuisBouton(indice);
  });

  // Reprise après une navigation classique (§ 10.5) : la barre ne relance
  // jamais le son elle-même, elle revient visible et à l'arrêt, à la
  // position déjà atteinte avant le rechargement du document.
  (function reprendreDepuisStockage() {
    var slugStocke = lireStockage(CLE_PISTE);
    if (!slugStocke) return;

    var indice = -1;
    for (var i = 0; i < pistes.length; i += 1) {
      if (pistes[i].slug === slugStocke) {
        indice = i;
        break;
      }
    }
    if (indice === -1) return;

    var piste = pistes[indice];
    var positionStockee = Number(lireStockage(CLE_POSITION)) || 0;
    reveler();
    recupererSource().then(function () {
      var extrait = extraitsParSlug[piste.slug];
      if (!extrait) return;
      indexCourant = indice;
      // La position ne se pose pas tout de suite : avec `preload="none"`, rien
      // n'est encore chargé et écrire `currentTime` sur un média sans données
      // n'a aucun effet. Elle est retenue ici et posée à l'arrivée des
      // métadonnées, quand la première lecture chargera le fichier.
      positionARestaurer = positionStockee;
      audio.src = extrait.url;
      mettreAJourInfos(piste);
      afficherPosition(positionStockee, piste.duree);
      dessinerOnde();
    });
  })();
})();
