/* Rend les formules extraites sous forme lisible, pour les confronter au jeu. */
const champs = require('./champions.json');
const RANGS = [1, 2, 3, 4, 5];

const LIB = { AD: 'AD', AP: 'AP', PV: 'PV', PVmanquants: 'PV manquants',
              PVactuels: 'PV actuels', Armure: 'armure', RM: 'RM',
              VitesseAttaque: 'vit. att.', Mana: 'mana' };

function rendre(calc, nbRangs) {
  const RANGS = [1, 2, 3, 4, 5].slice(0, nbRangs || 5);
  // termes agrégés par (stat, mode) → une suite de valeurs, une par rang
  const cles = new Map();
  RANGS.forEach(r => {
    (calc.parRang[r] || []).forEach(t => {
      const k = t.stat + '|' + t.mode;
      if (!cles.has(k)) cles.set(k, { stat: t.stat, mode: t.mode, v: {} });
      cles.get(k).v[r] = (cles.get(k).v[r] || 0) + t.valeur;
    });
  });
  const suite = o => RANGS.map(r => {
    const x = o.v[r];
    return x == null ? '?' : (Math.round(x * 100) / 100);
  });
  const uniforme = a => a.every(x => x === a[0]);

  const flat = [...cles.values()].find(c => c.stat === 'flat' && c.mode === 'flat');
  const ratios = [...cles.values()].filter(c => c.stat !== 'flat');

  let s = '';
  if (flat) { const a = suite(flat); s += uniforme(a) ? String(a[0]) : a.join('/'); }
  ratios.forEach(c => {
    const a = suite(c);
    const pct = a.map(x => typeof x === 'number' ? Math.round(x * 1000) / 10 + '%' : x);
    const txt = uniforme(pct) ? pct[0] : pct.join('/');
    const mode = c.mode === 'bonus' ? ' bonus' : c.mode === 'total' ? ' total' : '';
    s += (s ? ' + ' : '') + txt + ' ' + (LIB[c.stat] || c.stat) + mode;
  });
  return s || '(vide)';
}

const demandes = process.argv.slice(2);
const liste = demandes.length ? demandes : ['Aatrox', 'Ahri', 'Ezreal', 'Nautilus', 'Rumble'];

liste.forEach(id => {
  const c = champs[id];
  if (!c) { console.log('\n### ' + id + ' : absent'); return; }
  console.log('\n### ' + c.nom + '  (' + c.role + ' #' + c.rang + ')');
  console.log('    base : ' + c.base.pv + ' PV (+' + c.base.pvParNiv + '/niv), '
    + c.base.ad + ' AD (+' + c.base.adParNiv + '/niv), '
    + c.base.armure + ' armure, ' + c.base.rm + ' RM');
  ['Q', 'W', 'E', 'R'].forEach(t => {
    const s = c.sorts[t];
    if (!s) { console.log('  ' + t + ' : —'); return; }
    const deg = Object.entries(s.calculs).filter(([, v]) => v.genre === 'degats');
    const soin = Object.entries(s.calculs).filter(([, v]) => v.genre === 'soin');
    console.log('  ' + t + ' (' + s.nomInterne + ')');
    deg.slice(0, 3).forEach(([n, v]) => console.log('      dégâts · ' + n + ' : ' + rendre(v, s.nbRangs)));
    soin.slice(0, 2).forEach(([n, v]) => console.log('      soin/bouclier · ' + n + ' : ' + rendre(v, s.nbRangs)));
    if (!deg.length && !soin.length) console.log('      (aucun calcul de dégâts — sort utilitaire ?)');
    if (s.alertes.length) console.log('      ⚠ ' + s.alertes.join(' ; '));
  });
});
