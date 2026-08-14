/* Runes de DÉGÂTS et de SOIN sur une fenêtre de combat.

   Quatorze runes de dégâts et sept de soin étaient modélisées et chiffrées depuis
   longtemps — mais évaluées une par une, hors du temps. Or une rune ne vaut rien dans
   l'absolu : l'Électrocution inflige 270 points toutes les 20 secondes, la Brûlure 40
   toutes les 10. Sur une fenêtre de 20 s, la seconde en inflige plus que la première.
   Sans cadence, on ne pouvait ni les additionner aux dégâts d'un build, ni les comparer
   entre elles.

   ── Liste blanche de cadence ───────────────────────────────────────────────────
   N'entre ici qu'une rune dont le RYTHME est déterminé par le fichier de jeu : une
   recharge, ou un intervalle. Les autres — celles qui dépendent d'une immobilisation,
   d'une élimination, d'un bouclier posé, des PV de la cible — sont REFUSÉES avec leur
   motif. Leur donner une cadence supposée reviendrait à inventer la partie.

   ⚠ Les recharges de runes ne sont PAS réduites par l'accélération de compétence. Leur
   appliquer `rechargeReelle` aurait gonflé toutes les runes de dégâts sur les builds à
   forte accélération — exactement ceux qu'on veut comparer. */

const M = require('./26_modele_degats');
const R = require('./14_moteur_runes');
const { versAdaptatif } = require('./36_runes_profil');

/* `cadence` : 'recharge' (une fois par recharge) | 'intervalle' (toutes les N s en
   combat) | 'parSeconde' (débit continu tant que l'effet dure).
   `hypothese` : ce que le chiffre suppose, écrit pour être contredit au besoin. */
const CADENCES = {
  8112: { cadence: 'recharge', cle: 'Cooldown', genre: 'degats',
          hypothese: '3 frappes distinctes en 3 s, acquises dans un combat engagé' },
  8229: { cadence: 'recharge', cle: 'RechargeTime', genre: 'degats',
          hypothese: 'recharge de base ; toucher avec une compétence la réduit ' +
                     '(jusqu\'à RechargeTimeMin) — le chiffre est donc un PLANCHER' },
  8237: { cadence: 'recharge', cle: 'BurnlockoutDuration', genre: 'degats' },
  8005: { cadence: 'recharge', cle: 'Cooldown', genre: 'degats',
          hypothese: '3 attaques consécutives sur la même cible' },
  8139: { cadence: 'recharge', cle: 'Cooldown', genre: 'soin' },
  8437: { cadence: 'intervalle', cle: 'TriggerTime', genre: 'degats',
          soinAussi: { cle: 'PercentHealthHeal', base: 'pvMax' },
          penaliteDistance: 'RangedPenaltyMod',
          hypothese: 'combat continu : la Poigne se déclenche toutes les 4 s' },
  8992: { cadence: 'parSeconde', duree: 'Duration', genre: 'degats',
          hypothese: 'brûlure entretenue par les compétences pendant toute la fenêtre ; ' +
                     'l\'amplification de 75 % après 3 s n\'est PAS appliquée — plancher' }
};

/* Runes de dégâts ou de soin dont la cadence dépend d'un état que le modèle ne connaît
   pas. Nommées ici pour que leur absence soit un choix documenté, jamais un oubli. */
const SANS_CADENCE = {
  8008: 'Tempo mortel : les dégâts n\'arrivent qu\'au maximum de cumuls d\'attaque',
  8126: 'Coup bas : exige une cible immobilisée par votre kit',
  8128: 'Moisson noire : exige une cible sous un seuil de PV, et se cumule aux éliminations',
  8143: 'Ruée offensive : exige un déplacement préalable',
  8214: 'Invocation d\'Aery : Aery doit revenir avant de repartir, et ce trajet n\'est pas dans le fichier',
  8401: 'Coup de bouclier : exige un bouclier posé',
  8439: 'Après-coup : exige une immobilisation infligée par votre kit',
  8446: 'Démolition : vise les tourelles, pas les champions',
  9923: 'Déluge de lames : exige une élimination récente',
  8021: 'Jeu de jambes : lié à la dépense d\'énergie',
  8345: 'Livraison de biscuits : consommable, hors combat',
  8444: 'Second souffle : déclenché par les dégâts SUBIS, non par les vôtres',
  8463: 'Fontaine de vie : exige une cible immobilisée',
  9101: 'Absorption vitale : exige une élimination',
  9111: 'Triomphe : exige une participation à une élimination',
  8465: 'Gardien : bouclier accordé en protégeant un allié'
};

/* ── SOUS HYPOTHÈSE EXPLICITE ────────────────────────────────────────────────────
   Neuf des seize refusées ne manquaient pas d'un chiffre : elles manquaient d'un FAIT.
   « Combien de fois immobilisez-vous la cible en dix secondes ? » n'a pas de réponse
   dans le fichier de jeu — mais elle en a une chez le coach, qui connaît son champion.

   Le modèle ne la devine donc pas : il la DEMANDE. Sans hypothèse fournie, la rune
   reste refusée exactement comme avant, et le refus dit désormais quelle donnée
   débloquerait le calcul. Avec une hypothèse, le chiffre est servi ET porte la mention
   de ce qu'il suppose — un lecteur qui juge l'hypothèse fausse sait immédiatement quoi
   corriger, ce qu'un chiffre moyenné inventé ne permet jamais.

   `plafond` : la recharge propre à la rune borne le nombre de déclenchements. Une
   Après-coup a beau suivre dix immobilisations, sa recharge de 20 s n'en laisse passer
   qu'une par 20 s. Sans ce plafond, une hypothèse généreuse produirait un chiffre que
   le jeu ne permet pas. */
const SOUS_HYPOTHESE = {
  8126: { condition: 'immobilisations', genre: 'degats', plafond: 'Cooldown',
          quoi: 'immobilisation(s) ou ralentissement(s) infligés par votre kit' },
  8439: { condition: 'immobilisations', genre: 'degats', plafond: 'Cooldown',
          quoi: 'immobilisation(s) infligées par votre kit' },
  8463: { condition: 'immobilisations', genre: 'soin', plafond: 'Cooldown',
          quoi: 'immobilisation(s) infligées par votre kit' },
  8143: { condition: 'ruees', genre: 'degats', plafond: 'Cooldown',
          quoi: 'ruée(s), saut(s) ou téléportation(s) de votre kit' },
  9923: { condition: 'ouverturesCombat', genre: 'degats', plafond: 'Cooldown',
          quoi: 'ouverture(s) de combat (première attaque après 10 s hors combat)' },
  8128: { condition: 'ciblesSousSeuil', genre: 'degats', plafond: 'Cooldown',
          quoi: 'passage(s) de la cible sous 50 % de ses PV' },
  8401: { condition: 'boucliersPoses', genre: 'degats',
          quoi: 'bouclier(s) posés sur vous-même' },
  9111: { condition: 'eliminations', genre: 'soin',
          quoi: 'participation(s) à une élimination' },
  9101: { condition: 'eliminations', genre: 'soin',
          quoi: 'élimination(s), sbires compris' }
};

/* Le TYPE des dégâts adaptatifs suit la même règle que la force adaptative : magique du
   côté puissance, physique du côté dégâts d'attaque. Le confondre changerait la
   résistance qui les mitige — donc le résultat, pas seulement l'étiquette. */
function typeAdaptatif(p, adaptatifAP) {
  return versAdaptatif(1, p, adaptatifAP).stat === 'ap'
    ? { type: 'magique', cle: 'valeur' } : { type: 'physique', cle: 'valeurAD' };
}

function nombreDeDeclenchements(regle, valeurs, secondes) {
  if (regle.cadence === 'recharge') {
    const cd = valeurs[regle.cle];
    if (!cd) return null;
    // premier déclenchement à t = 0, puis un par recharge écoulée
    return { n: 1 + Math.floor(secondes / cd), cd };
  }
  if (regle.cadence === 'intervalle') {
    const i = valeurs[regle.cle];
    if (!i) return null;
    return { n: 1 + Math.floor(secondes / i), cd: i };
  }
  if (regle.cadence === 'parSeconde') return { n: secondes, cd: 1 };
  return null;
}

/* Dégâts et soins apportés par la page de runes sur une fenêtre donnée.
   `cible` sert à mitiger ; sans elle, seuls les montants bruts sont renvoyés. */
function surFenetre(champId, p, cible, secondes, options = {}) {
  const base = (M.champions[champId] || {}).base || {};
  const adapt = typeAdaptatif(p, base.adaptatifAP);
  const ctx = {
    niveau: p.niveau, adBase: p.adBase, adBonus: p.adBonus, ap: p.ap,
    pvMax: p.pvMax, pvBonus: p.pvBonus, minutes: options.minutes,
    /* ⚠ Sans ce drapeau, TOUTES les runes à pénalité de distance servaient leur valeur
       de mêlée à des champions à distance : la Poigne de l'immortel en donnait deux fois
       et demie trop sur une ADC. Le moteur de runes savait l'appliquer depuis toujours —
       personne ne lui disait de quel champion il s'agissait. */
    distance: p.distance
  };

  const lignes = []; const refus = [];
  let degatsSubis = 0, degatsBruts = 0, soins = 0;

  const hyp = options.hypotheses || {};

  (p.runes || []).forEach(id => {
    let regle = CADENCES[id];
    let sousHypothese = null;

    /* Rune conditionnée à un fait de partie. Si l'appelant a fourni ce fait, on le sert
       en le plafonnant par la recharge ; sinon on refuse, en NOMMANT la donnée
       manquante. Un refus qui dit quoi fournir vaut infiniment mieux qu'un refus muet :
       le premier se lève, le second se subit. */
    const sh = SOUS_HYPOTHESE[id];
    if (sh && !regle) {
      const fourni = hyp[sh.condition];
      if (fourni == null) {
        /* `SANS_CADENCE[id]` porte DÉJÀ le nom de la rune : le préfixer à nouveau
           donnait « Après-coup : Après-coup : exige… ». */
        refus.push(SANS_CADENCE[id] +
                   ' — fournissez `hypotheses.' + sh.condition + '` (' + sh.quoi + ') pour la chiffrer');
        return;
      }
      const valeurs = (R.parId[id] || {}).valeurs || {};
      const cd = sh.plafond ? valeurs[sh.plafond] : null;
      const max = cd ? 1 + Math.floor(secondes / cd) : Infinity;
      const n = Math.max(0, Math.min(Math.floor(fourni), max));
      sousHypothese = {
        n, cd,
        texte: fourni + ' ' + sh.quoi + ' fournis par l\'appelant' +
               (cd && fourni > max
                 ? ' — ramenés à ' + n + ' par la recharge de ' + cd + ' s'
                 : '')
      };
      regle = { cadence: 'fournie', genre: sh.genre };
    }
    if (!regle) {
      if (SANS_CADENCE[id]) refus.push(SANS_CADENCE[id]);
      return;                                 // rune de stat ou d'amplification : ailleurs
    }

    const e = R.evaluerRune(id, ctx);
    if (!e.ok) { refus.push((e.nom || id) + ' : ' + e.raison); return; }
    const valeurs = (R.parId[id] || {}).valeurs || {};
    const cad = sousHypothese
      ? { n: sousHypothese.n, cd: sousHypothese.cd }
      : nombreDeDeclenchements(regle, valeurs, secondes);
    if (!cad) { refus.push(e.nom + ' : cadence absente du fichier'); return; }

    /* Dégâts adaptatifs : on sert la face qui correspond au champion, et le type qui
       va avec. Une rune magique ou physique déclarée garde évidemment son type. */
    const estAdaptatif = /adaptatif/i.test(e.typeDegats || '');
    const type = regle.genre === 'soin' ? null
               : estAdaptatif ? adapt.type : e.typeDegats;
    let montant = estAdaptatif && adapt.cle === 'valeurAD' && e.valeurAD != null
      ? e.valeurAD : e.valeur;
    if (montant == null) { refus.push(e.nom + ' : aucune valeur chiffrée'); return; }

    if (regle.genre === 'soin') {
      soins += montant * cad.n;
      lignes.push({ rune: e.nom, genre: 'soin', parDeclenchement: Math.round(montant),
                    declenchements: cad.n, total: Math.round(montant * cad.n),
                    cadence: cad.cd ? cad.cd + ' s' : 'sur hypothèse',
                    hypothese: sousHypothese ? sousHypothese.texte : (regle.hypothese || null) });
      return;
    }

    const brut = montant * cad.n;
    /* Source 'rune' : elle ne doit déclencher NI les amplifications réservées aux
       compétences (Lance de Shojin) NI celles réservées aux attaques (Lunettes). */
    const mit = cible ? M.mitiger(montant, type, cible, p, 'rune', options) : null;
    const subis = (mit ? mit.subis : montant) * cad.n;
    degatsBruts += brut; degatsSubis += subis;
    lignes.push({ rune: e.nom, genre: 'degats', type,
                  parDeclenchement: Math.round(montant),
                  declenchements: cad.n,
                  brut: Math.round(brut), subis: Math.round(subis),
                  cadence: cad.cd ? cad.cd + ' s' : 'sur hypothèse',
                  hypothese: sousHypothese ? sousHypothese.texte : (regle.hypothese || null) });

    /* La Poigne de l'immortel soigne en plus de blesser : deux effets, une seule
       cadence. Les séparer évite de compter le soin comme des dégâts. */
    if (regle.soinAussi) {
      const part = valeurs[regle.soinAussi.cle];
      if (part != null) {
        /* La pénalité de distance frappe aussi le soin — le modèle de la rune la déclare
           (`RangedPenaltyMod`), mais elle ne s'applique automatiquement qu'au montant
           principal : ce second effet doit la recevoir explicitement. */
        const mod = (p.distance && regle.penaliteDistance && valeurs[regle.penaliteDistance] != null)
          ? valeurs[regle.penaliteDistance] : 1;
        const s = part * mod * (p[regle.soinAussi.base] || 0) * cad.n;
        soins += s;
        lignes.push({ rune: e.nom + ' (soin)', genre: 'soin',
                      parDeclenchement: Math.round(part * mod * (p[regle.soinAussi.base] || 0)),
                      declenchements: cad.n, total: Math.round(s), cadence: cad.cd + ' s' });
      }
    }
  });

  return {
    secondes,
    degatsBruts: Math.round(degatsBruts),
    degatsSubis: Math.round(degatsSubis),
    soins: Math.round(soins),
    lignes, refus,
    typeAdaptatif: adapt.type
  };
}

module.exports = { surFenetre, typeAdaptatif, CADENCES, SANS_CADENCE, SOUS_HYPOTHESE };
