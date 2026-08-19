/* Vérifications STATIQUES sur app.html.

   Il n'y a pas de runner côté client : ces deux défauts-ci sont passés en production
   parce que rien ne les regardait. Tous deux ont la même signature — ils ne lèvent
   AUCUNE erreur, ils rendent simplement l'interface inerte ou invisible. Ce sont
   exactement ceux qu'un test statique attrape pour presque rien. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');

/* Le code SEUL, commentaires retirés. Sans ça, la première version de ce fichier
   échouait sur le commentaire qui DÉCRIT le défaut : citer un motif fautif pour
   l'expliquer n'est pas le commettre, et un test qui interdit d'en parler pousse à
   supprimer l'explication plutôt que le défaut. */
const codeSeul = app.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

/* ── 1. Les attributs onclick construits par concaténation ──────────────────────────
   La liste de champions du sélecteur de builds était entièrement morte : ses boutons
   portaient
       onclick="boChoisir(" + JSON.stringify(nom) + ")"
   et `JSON.stringify` rend des GUILLEMETS DOUBLES, à l'intérieur d'un attribut lui-même
   délimité par des guillemets doubles. Le navigateur fermait l'attribut au premier, et
   l'appel devenait du code invalide, silencieusement ignoré. La liste s'affichait
   parfaitement ; aucun nom ne répondait. */
test('aucun onclick construit ne reçoit de JSON.stringify', () => {
  const fautifs = [];
  /* On regarde chaque onclick="…" ouvert par concaténation, jusqu'à sa fermeture. */
  for (const m of codeSeul.matchAll(/onclick="[^"]*?'\s*\+[\s\S]{0,400}?'\)?"/g)) {
    if (/JSON\.stringify/.test(m[0])) fautifs.push(m[0].slice(0, 120));
  }
  assert.deepStrictEqual(fautifs, [],
    'JSON.stringify dans un attribut onclick produit des guillemets doubles qui ferment ' +
    'l\'attribut : le gestionnaire devient inerte. Passer par des attributs data- et un ' +
    'écouteur délégué.');
});

/* ── 2. Les jetons de couleur inventés ──────────────────────────────────────────────
   La même liste s'est aussi affichée TRANSPARENTE, par-dessus les curseurs : son fond
   employait `var(--vs-bg-2)`, un jeton absent de la feuille. Une couleur inconnue ne
   déclenche pas d'erreur — le navigateur ne peint rien. Trois noms inventés étaient en
   place (`--vs-bg-2`, `--vs-line`, `--vs-line-soft`), plus un orphelin préexistant sur
   le « + » d'un poste vide du roster (`--vs-forest-400`, alors que l'échelle s'arrête
   à 500). */
test('tout jeton --vs-* employé sans repli est défini', () => {
  const definis = new Set([...app.matchAll(/(--vs-[a-z0-9-]+)\s*:/g)].map(m => m[1]));
  const employes = new Set();
  /* Seulement les emplois SANS valeur de repli : `var(--x, #fff)` est légitime. */
  for (const m of app.matchAll(/var\(\s*(--vs-[a-z0-9-]+)\s*([,)])/g)) {
    if (m[2] === ')') employes.add(m[1]);
  }
  const orphelins = [...employes].filter(j => !definis.has(j));
  assert.deepStrictEqual(orphelins, [],
    'jeton(s) de couleur employés sans être définis : le navigateur ne peint rien, ' +
    'sans la moindre erreur.');
  assert.ok(employes.size > 5, 'la détection doit trouver des emplois, sinon elle ne prouve rien');
});

/* ── 3. Le contre-test des deux précédents ─────────────────────────────────────────
   Une vérification qui ne trouve jamais rien ne prouve rien. On s'assure donc qu'elle
   attraperait bien le défaut qu'elle prétend surveiller. */
test('les deux détections attrapent effectivement le défaut qu\'elles visent', () => {
  const faux = '<button onclick="f(\' + JSON.stringify(x) + \')">';
  let vu = false;
  for (const m of faux.matchAll(/onclick="[^"]*?'\s*\+[\s\S]{0,400}?'\)?"/g)) {
    if (/JSON\.stringify/.test(m[0])) vu = true;
  }
  assert.ok(vu, 'la détection des onclick doit reconnaître le motif fautif');

  const cssFaux = ':root{--vs-ok:#000} .a{background:var(--vs-inexistant)}';
  const def = new Set([...cssFaux.matchAll(/(--vs-[a-z0-9-]+)\s*:/g)].map(m => m[1]));
  const emp = [];
  for (const m of cssFaux.matchAll(/var\(\s*(--vs-[a-z0-9-]+)\s*([,)])/g)) {
    if (m[2] === ')') emp.push(m[1]);
  }
  assert.deepStrictEqual(emp.filter(j => !def.has(j)), ['--vs-inexistant'],
    'la détection des jetons doit reconnaître un nom absent');
});
