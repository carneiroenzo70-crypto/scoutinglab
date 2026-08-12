/* Vérifie le moteur contre les valeurs ANNONCÉES dans les descriptions du jeu.
   Au niveau 1 sans aucune stat, une rune doit rendre sa borne basse ; au niveau 18,
   sa borne haute. C'est le contrôle le plus simple et le plus dur à truquer. */
const { evaluerRune } = require('./14_moteur_runes');

let ok = 0, ko = 0;
function verifie(libelle, obtenu, attendu, tol = 0.01) {
  const bon = obtenu != null && Math.abs(obtenu - attendu) <= tol;
  console.log((bon ? '  OK   ' : '  ÉCHEC') + '  ' + libelle.padEnd(52) +
    'obtenu ' + obtenu + '   attendu ' + attendu);
  bon ? ok++ : ko++;
}

console.log('── Interpolation par niveau (borne basse au niv. 1, haute au niv. 18)');
verifie('Électrocution niv.1, aucune stat', evaluerRune(8112, { niveau: 1 }).valeur, 70);
verifie('Électrocution niv.18, aucune stat', evaluerRune(8112, { niveau: 18 }).valeur, 240);
verifie('Attaque soutenue niv.1', evaluerRune(8005, { niveau: 1 }).valeur, 40);
verifie('Attaque soutenue niv.18', evaluerRune(8005, { niveau: 18 }).valeur, 160);
verifie('Comète arcanique niv.1', evaluerRune(8229, { niveau: 1 }).valeur, 15);
verifie('Comète arcanique niv.18', evaluerRune(8229, { niveau: 18 }).valeur, 100);
verifie('Gardien niv.1 (bouclier)', evaluerRune(8465, { niveau: 1 }).valeur, 40);
verifie('Gardien niv.18 (bouclier)', evaluerRune(8465, { niveau: 18 }).valeur, 150);
verifie('Jeu de jambes niv.18 (soin)', evaluerRune(8021, { niveau: 18 }).valeur, 130);
verifie('Après-coup niv.1', evaluerRune(8439, { niveau: 1 }).valeur, 25);
verifie('Après-coup niv.18', evaluerRune(8439, { niveau: 18 }).valeur, 120);

console.log('\n── Ratios');
// Électrocution : 70 + 0.1 AD bonus + 0.05 AP
verifie('Électrocution niv.1, 100 AD bonus', evaluerRune(8112, { niveau: 1, adBonus: 100 }).valeur, 80);
verifie('Électrocution niv.1, 200 AP', evaluerRune(8112, { niveau: 1, ap: 200 }).valeur, 80);
verifie('Électrocution niv.1, 100 AD + 200 AP',
  evaluerRune(8112, { niveau: 1, adBonus: 100, ap: 200 }).valeur, 90);
// Après-coup : 25 + 8% des PV bonus
verifie('Après-coup niv.1, 1000 PV bonus', evaluerRune(8439, { niveau: 1, pvBonus: 1000 }).valeur, 105);
// Gardien : 40 + 20% AP + 6% PV bonus
verifie('Gardien niv.1, 100 AP + 1000 PV bonus',
  evaluerRune(8465, { niveau: 1, ap: 100, pvBonus: 1000 }).valeur, 120);

console.log('\n── Pourcentage de stat (Poigne : 3,5% des PV max)');
verifie('Poigne, 2000 PV max, mêlée', evaluerRune(8437, { pvMax: 2000 }).valeur, 70);
verifie('Poigne, 2000 PV max, à distance (40%)',
  evaluerRune(8437, { pvMax: 2000, distance: true }).valeur, 28);

console.log('\n── Cumuls (Conquérant : 12 x 1,8 au niv.1, 12 x 4 au niv.18)');
verifie('Conquérant niv.1, 12 cumuls', evaluerRune(8010, { niveau: 1, cumuls: 12 }).valeur, 21.6);
verifie('Conquérant niv.18, 12 cumuls', evaluerRune(8010, { niveau: 18, cumuls: 12 }).valeur, 48);
verifie('Conquérant niv.18, 6 cumuls', evaluerRune(8010, { niveau: 18, cumuls: 6 }).valeur, 24);

console.log('\n── Âmes (Moisson noire : 30 + 11 par âme)');
verifie('Moisson noire, 0 âme', evaluerRune(8128, {}).valeur, 30);
verifie('Moisson noire, 10 âmes', evaluerRune(8128, { ames: 10 }).valeur, 140);

console.log('\n── Version à distance entièrement différente (Tempo mortel)');
verifie('Tempo mortel niv.1 mêlée', evaluerRune(8008, { niveau: 1 }).valeur, 9);
verifie('Tempo mortel niv.18 mêlée', evaluerRune(8008, { niveau: 18 }).valeur, 30);
verifie('Tempo mortel niv.18 distance', evaluerRune(8008, { niveau: 18, distance: true }).valeur, 24);
verifie('Tempo mortel niv.18 mêlée, +50% VA bonus',
  evaluerRune(8008, { niveau: 18, vitesseAttaqueBonus: 0.5 }).valeur, 45);

console.log('\n── Variantes (Aery blesse ou protège)');
verifie('Aery dégâts niv.18', evaluerRune(8214, { niveau: 18, variante: 'degats' }).valeur, 50);
verifie('Aery bouclier niv.18', evaluerRune(8214, { niveau: 18, variante: 'bouclier' }).valeur, 100);

console.log('\n── Ratio « pour 100 points » (Optimisation glaciale)');
// 20% de base + 6% par 100 AP  →  200 AP doit donner 20 + 0.12 = 20.12 (et non 32)
verifie('Optimisation glaciale, 200 AP', evaluerRune(8351, { ap: 200 }).valeur, 20.12);

console.log('\n── Échelles de pourcentage (le piège du facteur 100)');
// Stockées en fraction → doivent ressortir en unité affichée
verifie('Coup de grâce (0.08 → 8%)', evaluerRune(8014, {}).valeur, 8);
verifie('Abattage (0.08 → 8%)', evaluerRune(8017, {}).valeur, 8);
verifie('Baroud d\'honneur (0.11 → 11%)', evaluerRune(8299, {}).valeur, 11);
verifie('Premier coup (0.07 → 7%)', evaluerRune(8369, {}).valeur, 7);
verifie('Arcaniste axiomatique (0.12 → 12%)', evaluerRune(8224, {}).valeur, 12);
verifie('Célérité (0.01 → 1%)', evaluerRune(8234, {}).valeur, 1);
verifie('Second souffle (0.04 → 4%)', evaluerRune(8444, {}).valeur, 4);
verifie('Transcendance (0.05 → 5 accél.)', evaluerRune(8210, {}).valeur, 5);
verifie('Assaut du maraudeur (0.48 → 48%)', evaluerRune(8230, {}).valeur, 48);
// Déjà stockées en unité affichée → ne doivent PAS être multipliées
verifie('Fragment vitesse d\'attaque (10 reste 10%)', evaluerRune(5005, {}).valeur, 10);
verifie('Fragment PV (65 reste 65)', evaluerRune(5011, {}).valeur, 65);
verifie('Fragment ténacité (15 reste 15%)', evaluerRune(5013, {}).valeur, 15);
verifie('Fragment force adaptative (9 puissance)', evaluerRune(5008, {}).valeur, 9);
verifie('Fragment PV croissants niv.18', evaluerRune(5001, { niveau: 18 }).valeur, 180);

console.log('\n── Mineures : valeurs composées');
// Démolition mêlée : 85 + 28% des PV max ; à distance : 50 + 20%
verifie('Démolition mêlée, 2400 PV', evaluerRune(8446, { pvMax: 2400 }).valeur, 757);
verifie('Démolition distance, 2400 PV',
  evaluerRune(8446, { pvMax: 2400, distance: true }).valeur, 530);
// Coup de bouclier niv.18 : 30 + 2,5% des PV bonus (clé stockée en points de %)
verifie('Coup de bouclier niv.18, 1000 PV bonus',
  evaluerRune(8401, { niveau: 18, pvBonus: 1000 }).valeur, 55);
verifie('Brûlure niv.1', evaluerRune(8237, { niveau: 1 }).valeur, 20);
verifie('Brûlure niv.18', evaluerRune(8237, { niveau: 18 }).valeur, 40);
verifie('Coup bas niv.18', evaluerRune(8126, { niveau: 18 }).valeur, 45);
verifie('Goût du sang niv.1, 100 AD bonus', evaluerRune(8139, { niveau: 1, adBonus: 100 }).valeur, 26);
verifie('Concentration absolue niv.18', evaluerRune(8233, { niveau: 18 }).valeur, 30);

console.log('\n── Absence assumée plutôt que zéro trompeur');
// Sixième sens détecte des balises : il n'y a rien à chiffrer, et 0 se lirait
// « ne fait rien » au lieu de « sans effet chiffrable ».
const ss = evaluerRune(8137, { niveau: 18 });
const bon = ss.ok && ss.valeur === null;
console.log((bon ? '  OK   ' : '  ÉCHEC') + '  Sixième sens : valeur = ' + ss.valeur +
  ' (rune sans grandeur à calculer)');
bon ? ok++ : ko++;

console.log('\n── Runes débloquées par recoupement avec une source externe');
// Polyvalence : clés hachées identifiées via le wiki (8 à 5 cumuls, 20 à 10 cumuls)
verifie('Polyvalence : 1 accélération par cumul', evaluerRune(8316, {}).valeur, 1);
// Grimoire déchaîné : 4,5 min = les 270 s annoncées par le wiki
verifie('Grimoire déchaîné : délai initial en minutes', evaluerRune(8360, {}).valeur, 4.5);
const gd = evaluerRune(8360, {});
const coherent = Math.abs(gd.valeur * 60 - 270) < 0.01;
console.log((coherent ? '  OK   ' : '  ÉCHEC') + '  ' +
  'Grimoire : 4,5 min x 60 = 270 s (concorde avec le wiki)'.padEnd(52) +
  'obtenu ' + gd.valeur * 60 + '   attendu 270');
coherent ? ok++ : ko++;
// Fontaine de vie : valeurs externes, mais le rapport mêlée/distance doit retomber
// sur le RangedMod du fichier de jeu (0,7) — c'est ce qui valide la saisie.
verifie('Fontaine de vie niv.1 mêlée', evaluerRune(8463, { niveau: 1 }).valeur, 10);
verifie('Fontaine de vie niv.18 mêlée', evaluerRune(8463, { niveau: 18 }).valeur, 54.71);
verifie('Fontaine de vie niv.18 distance (x0,7)',
  evaluerRune(8463, { niveau: 18, distance: true }).valeur, 38.3, 0.02);

console.log('\n── Traçabilité de la source');
const fdv = evaluerRune(8463, { niveau: 18 });
const trace = /wiki/i.test(fdv.source || '');
console.log((trace ? '  OK   ' : '  ÉCHEC') + '  Fontaine de vie signale sa source : ' + fdv.source);
trace ? ok++ : ko++;
const elec = evaluerRune(8112, { niveau: 1 });
const traceJeu = elec.source === 'fichier de jeu';
console.log((traceJeu ? '  OK   ' : '  ÉCHEC') + '  Électrocution signale sa source : ' + elec.source);
traceJeu ? ok++ : ko++;

console.log('\n── Refus explicites (jamais de valeur inventée)');
const inconnue = evaluerRune(9999);
console.log((inconnue.ok === false ? '  OK   ' : '  ÉCHEC') + '  rune inconnue refusée : ' + inconnue.raison);
inconnue.ok === false ? ok++ : ko++;
const retiree = evaluerRune(8359); // Kleptomancie, retirée du jeu
console.log((retiree.ok === false ? '  OK   ' : '  ÉCHEC') + '  rune retirée refusée : ' + retiree.raison);
retiree.ok === false ? ok++ : ko++;

console.log('\n═══ ' + ok + ' réussis, ' + ko + ' échoués ═══');
process.exit(ko ? 1 : 0);
