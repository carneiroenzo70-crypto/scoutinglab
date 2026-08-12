/* Rendu lisible d'un objet, pour confronter à ce que le jeu affiche en boutique.
   Usage : node 22_rapport_items.js 3153 6673   (ou un fragment de nom) */
const items = require('./items.json');

const args = process.argv.slice(2);
const cibles = args.length
  ? items.filter(o => args.some(a => String(o.id) === a ||
      new RegExp(a, 'i').test(o.nom) || new RegExp(a, 'i').test(o.nomInterne || '')))
  : items.filter(o => o.fini && o.prix >= 2500).slice(0, 5);

const STATS = { AD: 'AD', AP: 'puissance', PV: 'PV', PVactuels: 'PV actuels',
                PVmanquants: 'PV manquants', Mana: 'mana', Armure: 'armure', RM: 'RM',
                Cumuls: 'cumul', NbObjets: 'objet légendaire' };

function terme(t) {
  if (t.stat === 'flat' && t.mode === 'parNiveau')
    return t.jusqua != null ? t.valeur + ' → ' + t.jusqua + ' (selon le niveau)'
                            : t.valeur + ' au niv. 1 (paliers)';
  if (t.stat === 'flat') return String(Math.round(t.valeur * 1000) / 1000);
  const pct = Math.round(t.valeur * 10000) / 100;
  return pct + '% ' + (STATS[t.stat] || t.stat) + (t.mode === 'bonus' ? ' bonus' : '');
}

cibles.forEach(o => {
  console.log('\n══════ ' + o.nom + '  (' + o.id + ')  ' + o.prix + ' po' +
              (o.fini ? '' : ' — composant'));
  if (o.composeDe.length) {
    const n = o.composeDe.map(i => (items.find(x => x.id === i) || {}).nom || i);
    console.log('   se compose de : ' + n.join(' + '));
  }
  const st = Object.values(o.stats);
  if (st.length) console.log('   Stats : ' + st.map(s =>
    (s.pourcent ? Math.round(s.valeur * 1000) / 10 + '%' : s.valeur) + ' ' + s.libelle).join(' · '));

  const noms = Object.keys(o.calculs);
  if (noms.length) {
    console.log('   Passif chiffré :');
    noms.forEach(n => {
      const c = o.calculs[n];
      if (c.conditionnel) {
        const f = l => (l || []).map(terme).join(' + ') || '—';
        console.log('     ' + n.padEnd(28) + f(c.defaut) +
                    '   [si ' + (c.condition || '?') + '] ' + f(c.siCondition));
      } else {
        console.log('     ' + n.padEnd(28) + c.termes.map(terme).join(' + '));
      }
    });
  }
  const v = Object.keys(o.valeurs);
  if (v.length) console.log('   Valeurs brutes : ' +
    v.slice(0, 14).map(k => k + '=' + o.valeurs[k]).join(', ') +
    (v.length > 14 ? ' … (+' + (v.length - 14) + ')' : ''));
  if (o.alertes.length) console.log('   ⚠ ' + o.alertes.join(' | '));
});
