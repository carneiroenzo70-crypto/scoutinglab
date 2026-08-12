/* Audit dans le sens qui manquait.

   Jusqu'ici on vérifiait que les stats EXTRAITES se retrouvent dans la description.
   Ça ne détecte pas l'oubli : une stat annoncée en boutique et absente de l'extraction
   passait inaperçue. C'est exactement comme ça que `mAbilityHasteMod` avait disparu de
   65 objets sans la moindre erreur.

   Ici on lit la ligne de stats de la description (le bloc « +N ... » du début) et on
   exige que CHAQUE entrée ait sa contrepartie extraite. */
const items = require('./items.json');
const fr = require('./items_fr.json');
const dd = require('./items_dd.json').data;

const descFr = {};
fr.forEach(x => { descFr[x.id] = (x.description || ''); });

/* La description commence par un bloc <stats>…</stats> : c'est la ligne de
   caractéristiques, séparée des passifs. On ne lit que celui-là — sinon on
   confondrait « +40 % de vitesse d'attaque » (stat) et « ralentit de 30 % » (passif). */
function blocStats(id) {
  const d = descFr[id] || '';
  const m = d.match(/<stats>([\s\S]*?)<\/stats>/i);
  return (m ? m[1] : '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/* Chaque entrée : un nombre (parfois en %) puis son libellé, qui court jusqu'au
   prochain chiffre ou au prochain « + ».

   ⚠ Découper sur le seul « + » ne marche pas : la boutique écrit la létalité SANS
   signe (« +20 dégâts d'attaque 10 létalité »), et les deux entrées se retrouvaient
   fondues en une seule — 14 objets à létalité passaient alors pour non extraits. */
function entrees(txt) {
  const out = [];
  const re = /(\d+(?:[.,]\d+)?)\s*(%?)\s*((?:(?![\d+])[\s\S])*)/g;
  let m;
  while ((m = re.exec(txt))) {
    const libelle = m[3].trim().toLowerCase().replace(/^(d['’]|de |des )/, '');
    if (!libelle) continue;
    out.push({ valeur: parseFloat(m[1].replace(',', '.')), pourcent: m[2] === '%', libelle });
  }
  return out;
}

/* Correspondance libellé affiché → clé extraite.

   ⚠ Le signe « % » fait partie de l'identification, il ne s'agit pas d'un détail de
   présentation : les Chaussures de lanceur de sorts portent À LA FOIS « +20
   pénétration magique » et « +8 % de pénétration magique », qui sont DEUX stats
   distinctes. Les confondre faisait comparer 0,08 à 20 et criait à l'erreur. */
const PONT = [
  [/dégâts d['’]attaque/,               { plat: 'ad' }],
  [/^puissance/,                        { plat: 'ap' }],
  [/^pv\b/,                             { plat: 'pv' }],
  [/^mana\b/,                           { plat: 'mana' }],
  [/^armure/,                           { plat: 'armure' }],
  [/résistance magique/,                { plat: 'rm' }],
  [/accélération de compétence/,        { plat: 'accel' }],
  [/létalité/,                          { plat: 'letalite' }],
  [/chances de coup critique/,          { pct: 'crit' }],
  [/dégâts de coup critique/,           { pct: 'degatsCrit' }],
  [/vitesse d['’]attaque/,              { pct: 'vitesseAttaque' }],
  [/vitesse de déplacement/,            { plat: 'vdPlate', pct: 'vd' }],
  [/vol de vie/,                        { pct: 'volVie' }],
  [/omnivampirisme/,                    { pct: 'omnivamp' }],
  [/efficacité des soins et boucliers/, { pct: 'soinsEtBoucliers' }],
  [/pénétration d['’]armure/,           { plat: 'penArmurePlate', pct: 'penArmure' }],
  [/pénétration magique/,               { plat: 'penMagiquePlat', pct: 'penMagique' }],
  [/ténacité/,                          { pct: 'tenacite' }],
  [/résistance aux ralentissements/,    { pct: 'resistRalent' }],
  [/régénération de base des pv/,       { pct: 'regenPVpct' }],
  [/régénération de vie/,               { plat: 'regenPV', pct: 'regenPVpct' }],
  [/régénération de base du mana/,      { pct: 'regenManapct' }],
  [/régénération de mana/,              { plat: 'regenMana', pct: 'regenManapct' }],
  [/portée d['’]attaque/,               { plat: 'portee' }]
];
const cleDe = (libelle, pourcent) => {
  for (const [re, p] of PONT) {
    if (!re.test(libelle)) continue;
    const c = pourcent ? (p.pct || p.plat) : (p.plat || p.pct);
    return c ? [c] : null;
  }
  return null;
};

const manquantes = [], inconnues = [], ecarts = [], enTrop = [];
let comparees = 0;

items.forEach(o => {
  const txt = blocStats(o.id);
  if (!txt) return;
  const lues = entrees(txt);
  const vues = new Set();

  lues.forEach(e => {
    /* Une valeur nulle affichée (« +0 % de chances de coup critique » sur les Flèches
       des Yun Tal) est bien réelle : l'objet ne donne aucun critique de base, il le
       gagne à l'usage. Vérifié sur le wiki. Rien à extraire, donc rien à signaler. */
    if (e.valeur === 0) return;
    const cles = cleDe(e.libelle, e.pourcent);
    if (!cles) { inconnues.push(o.nom + ' → « ' + e.libelle + ' »'); return; }
    const cle = cles.find(c => o.stats[c] != null);
    if (!cle) { manquantes.push(o.nom + ' → ' + e.valeur + (e.pourcent ? ' %' : '') +
                                ' ' + e.libelle + '  [clé attendue : ' + cles.join('/') + ']'); return; }
    vues.add(cle);
    comparees++;
    const extraite = o.stats[cle].valeur;
    // la boutique affiche 25 % là où le fichier stocke 0,25
    const attendu = o.stats[cle].pourcent ? e.valeur / 100 : e.valeur;
    if (Math.abs(extraite - attendu) > Math.max(0.011, Math.abs(attendu) * 0.02))
      ecarts.push(o.nom + ' · ' + cle + ' : extrait ' + extraite + ', boutique ' + attendu);
  });

  // Et l'inverse : une stat extraite que la boutique n'annonce pas
  Object.keys(o.stats).forEach(c => {
    if (!vues.has(c)) enTrop.push(o.nom + ' · ' + c + ' = ' + o.stats[c].valeur);
  });
});

console.log('Valeurs de stats confrontées à la ligne de boutique : ' + comparees);
console.log('\n1. STATS ANNONCÉES MAIS NON EXTRAITES : ' + manquantes.length);
manquantes.forEach(x => console.log('   ' + x));
console.log('\n2. ÉCARTS DE VALEUR : ' + ecarts.length);
ecarts.forEach(x => console.log('   ' + x));
console.log('\n3. LIBELLÉS NON RECONNUS (à ajouter au pont) : ' + inconnues.length);
[...new Set(inconnues)].slice(0, 25).forEach(x => console.log('   ' + x));
console.log('\n4. Extraites mais absentes de la ligne de boutique : ' + enTrop.length);
[...new Set(enTrop)].slice(0, 25).forEach(x => console.log('   ' + x));

console.log('\n── Objets portant une alerte du résolveur');
items.filter(o => o.alertes.length).forEach(o =>
  console.log('   ' + String(o.id).padEnd(6) + o.nom.padEnd(28) + o.alertes.join(' | ')));
