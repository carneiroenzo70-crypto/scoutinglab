/* Audit inverse des runes.

   Bonne nouvelle par rapport aux objets : les descriptions de runes sont ENTIÈREMENT
   rendues, chiffres compris (« Dégâts : 70 - 240 (+0.1 dégâts d'attaque bonus…) »).
   Le contrôle est donc beaucoup plus fort : chaque nombre annoncé doit se retrouver
   dans les valeurs extraites, et chaque valeur servie par le moteur doit correspondre.

   Trois choses recherchées :
     1. un nombre annoncé sans contrepartie extraite → donnée manquante ;
     2. une rune dont le moteur sort une valeur absente de sa description → échelle
        probablement fausse (le piège du facteur 100) ;
     3. l'exhaustivité d'ECHELLE_FRACTION, dressée à la main — donc suspecte. */
const runes = require('./runes.json');
const { evaluerRune, MODELES } = require('./14_moteur_runes');

const nettoie = t => (t || '').replace(/«[^»]*»/g, ' ')      // citations de saveur
                              .replace(/\s+/g, ' ');
// Les nombres d'une description, tels qu'affichés
const nombres = t => [...new Set((nettoie(t).match(/\d+(?:[.,]\d+)?/g) || [])
  .map(x => parseFloat(x.replace(',', '.'))))];

/* Un nombre est « couvert » s'il apparaît dans les valeurs extraites, à l'une des
   échelles employées par Riot : brut, ×100 (fraction affichée en %), ou /100. */
function couvert(n, valeurs) {
  const v = Object.values(valeurs);
  return v.some(x => Math.abs(x - n) < 0.011 ||
                     Math.abs(x * 100 - n) < 0.011 ||
                     Math.abs(x / 100 - n) < 0.011);
}

const jouables = runes.filter(r => r.active);
const orphelins = [], sansValeur = [];
let totalNombres = 0, couverts = 0;

/* Un nombre peut aussi venir du MODÈLE et non du fichier : valeur relevée sur une
   source externe, équivalent adaptatif en dégâts d'attaque (0,6 ×), ou palier d'une
   progression dans le temps. Les ignorer ferait crier au manque sur des runes
   parfaitement traitées. */
function couvertParModele(n, r) {
  const m = MODELES[r.id] || {};
  if (m.valeursExternes && couvert(n, m.valeursExternes.valeurs)) return true;
  /* Tolérance plus large sur l'équivalent adaptatif : la boutique ARRONDIT à l'entier,
     tantôt au plus près tantôt à l'inférieur (4,8 s'affiche « 5 », 14,4 s'affiche
     « 14 »). Exiger l'égalité stricte ferait échouer des valeurs justes. */
  const TOL_AD = 0.6;
  for (const niv of [1, 18]) {
    for (const min of [0, 10, 20, 30, 40, 50, 60, 70]) {
      const e = evaluerRune(r.id, { niveau: niv, minutes: min, cumuls: 99, ames: 10 });
      if (!e.ok || e.valeur == null) break;
      if (Math.abs(e.valeur - n) < 0.06) return true;
      if (e.valeurAD != null && Math.abs(e.valeurAD - n) <= TOL_AD) return true;
      if (!m.montant || !m.montant.triangulaire) break;   // inutile de balayer le temps
    }
  }
  /* Les jalons temporels (« 20 min », « 30 min ») sont des LIBELLÉS, pas des valeurs :
     ils se déduisent de l'intervalle et n'ont pas à figurer dans le fichier. */
  if (m.montant && m.montant.triangulaire) {
    const inter = r.valeurs[m.montant.triangulaire.intervalle];
    if (inter && n % inter === 0 && n <= inter * 8) return true;
  }
  return false;
}

jouables.forEach(r => {
  const ns = nombres(r.desc).filter(n => n > 0);
  if (!Object.keys(r.valeurs).length) { sansValeur.push(r.nom); return; }
  const manques = [];
  ns.forEach(n => {
    totalNombres++;
    if (couvert(n, r.valeurs) || couvertParModele(n, r)) couverts++;
    else manques.push(n);
  });
  if (manques.length) orphelins.push({ nom: r.nom, id: r.id, manques, desc: nettoie(r.desc).slice(0, 120) });
});

console.log('Runes jouables : ' + jouables.length);
console.log('Nombres annoncés confrontés aux valeurs extraites : ' + totalNombres +
            '  → couverts : ' + couverts + '  (' + Math.round(couverts / totalNombres * 100) + ' %)');

console.log('\n1. NOMBRES ANNONCÉS SANS CONTREPARTIE EXTRAITE : ' + orphelins.length + ' runes');
orphelins.slice(0, 30).forEach(o =>
  console.log('   ' + String(o.id).padEnd(6) + o.nom.padEnd(26) + '→ ' + o.manques.join(', ') +
              '\n        ' + o.desc));

console.log('\n2. Runes sans aucune valeur extraite : ' + sansValeur.length);
if (sansValeur.length) console.log('   ' + sansValeur.join(', '));

/* 3. Échelle : la valeur servie par le moteur doit se retrouver dans la description.
   C'est le contrôle qui attrape une erreur de facteur 100 — dans un sens comme dans
   l'autre, car ECHELLE_FRACTION est une liste dressée à la main. */
console.log('\n3. ÉCHELLE DES POURCENTAGES (le piège du facteur 100)');
const CTX = { niveau: 18, adBase: 100, adBonus: 150, ap: 200, pvMax: 2400, pvBonus: 1000,
              vitesseAttaqueBonus: 0.5, cumuls: 99, ames: 0, soinsEtBoucliers: 0 };
const suspectes = [], confirmees = [], nonRendues = [];
jouables.forEach(r => {
  const e = evaluerRune(r.id, CTX);
  if (!e.ok || e.valeur == null) return;
  const m = MODELES[r.id];
  /* On ne teste que les runes SANS ratio ni interpolation : leur valeur doit
     apparaître telle quelle dans le texte. Sur les autres, le moteur compose
     légitimement un nombre absent de la description. */
  const simple = m && m.montant && !m.montant.ratios && !m.montant.niveau &&
                 !m.montant.parCumul && !m.montant.pourcentStat && !m.montant.parAme &&
                 !m.montant.triangulaire;   // dépend du temps de jeu, pas d'un texte fixe
  if (!simple) return;
  /* Une description dont le gabarit n'a pas été résolu côté client (@f3@) ne peut
     rien confirmer : on ne la compte ni en réussite ni en échec. */
  if (/@\w+@/.test(r.desc)) { nonRendues.push(r.nom); return; }
  const ns = nombres(r.desc);
  /* La valeur adaptative existe sous deux formes dans le texte : X en puissance ou
     0,6 X en dégâts d'attaque. Retrouver l'une des deux suffit. */
  const trouve = ns.some(n => Math.abs(n - e.valeur) < 0.06 ||
                              (e.valeurAD != null && Math.abs(n - e.valeurAD) < 0.06));
  (trouve ? confirmees : suspectes).push(r.nom + ' → moteur ' + e.valeur +
    (e.valeurAD != null ? ' (ou ' + e.valeurAD + ' en AD)' : '') +
    ' ; texte : ' + ns.slice(0, 6).join(', '));
});
console.log('   valeurs simples confirmées dans le texte : ' + confirmees.length);
console.log('   SUSPECTES (valeur du moteur absente du texte) : ' + suspectes.length);
suspectes.forEach(s => console.log('     ' + s));
if (nonRendues.length)
  console.log('   non vérifiables (gabarit client non résolu, « @f3@ ») : ' + nonRendues.join(', '));
