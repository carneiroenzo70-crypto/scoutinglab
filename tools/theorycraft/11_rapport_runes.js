/* Rend les runes lisibles pour les confronter au jeu. */
const runes = require('./runes.json');

const ORDRE = ['DamageBase', 'DamageMax', 'MinDamage', 'MaxDamage', 'BaseDamage',
               'BonusADRatio', 'APRatio', 'ADRatio', 'TotalADRatio',
               'HealBase', 'HealMax', 'ShieldBase', 'ShieldMax',
               'Cooldown', 'CooldownMin', 'WindowDuration', 'Duration'];

const cle = k => { const i = ORDRE.indexOf(k); return i < 0 ? 99 : i; };
const fmt = (k, v) => /ratio|coefficient|percent|pct/i.test(k)
  ? (Math.round(v * 1000) / 10) + '%' : (Math.round(v * 1000) / 1000);

function ligne(r, max) {
  const ks = Object.keys(r.valeurs).sort((a, b) => cle(a) - cle(b) || a.localeCompare(b));
  const vus = ks.slice(0, max).map(k => k + ' ' + fmt(k, r.valeurs[k]));
  const reste = ks.length - vus.length;
  return vus.join(', ') + (reste > 0 ? '  (+' + reste + ')' : '');
}

const arbres = [...new Set(runes.filter(r => r.active).map(r => r.arbre))];

console.log('════ PIERRES DE FONDATION ════');
arbres.forEach(a => {
  console.log('\n── ' + a);
  runes.filter(r => r.active && r.arbre === a && r.genre === 'majeure')
    .forEach(r => console.log('  ' + r.nom.padEnd(26) + ligne(r, 6)));
});

console.log('\n\n════ FRAGMENTS ════');
runes.filter(r => r.active && r.genre === 'fragment')
  .forEach(r => console.log('  ' + r.nom.padEnd(26) + ligne(r, 4)));

console.log('\n\n════ MINEURES PORTANT DES DÉGÂTS ════');
runes.filter(r => r.active && r.genre === 'mineure' && r.aDegats)
  .forEach(r => console.log('  ' + (r.arbre || '').padEnd(12) + r.nom.padEnd(26) + ligne(r, 5)));
