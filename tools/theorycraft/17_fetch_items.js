/* Télécharge les trois sources des objets. Aucune n'est versionnée (15 Mo pour la
   première) : elles se refont d'une commande à chaque patch.

   Trois fichiers parce que chacun sait une chose que les autres ignorent :
     — items.cdtb.bin.json : les STATS et les PASSIFS chiffrés. Seule source à donner
       l'accélération de compétence et la létalité.
     — item.json (Data Dragon) : la CARTE — indispensable, le fichier de jeu mélange
       Faille, Arena et TFT — plus le prix cumulé et l'arbre de construction.
     — items.json du client en fr_fr : le libellé français.  */
const fs = require('fs');
const path = require('path');

const SOURCES = [
  ['items.bin.json',
   'https://raw.communitydragon.org/latest/game/items.cdtb.bin.json'],
  ['items_fr.json',
   'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/fr_fr/v1/items.json']
];

async function versionDDragon() {
  const r = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
  return (await r.json())[0];
}

async function un(nom, url, essai = 1) {
  const dest = path.join(__dirname, nom);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) throw new Error('http ' + r.status);
    const t = await r.text();
    if (t.length < 10000) throw new Error('trop court (' + t.length + ' o)');
    fs.writeFileSync(dest, t);
    console.log('  ' + nom.padEnd(18) + Math.round(t.length / 1024) + ' Ko');
  } catch (e) {
    if (essai < 3) { await new Promise(r => setTimeout(r, 900 * essai)); return un(nom, url, essai + 1); }
    console.log('  ÉCHEC ' + nom + ' → ' + e.message);
    process.exitCode = 1;
  }
}

(async () => {
  const v = await versionDDragon();
  console.log('Patch Data Dragon : ' + v);
  await Promise.all([
    ...SOURCES.map(([n, u]) => un(n, u)),
    un('items_dd.json', 'https://ddragon.leagueoflegends.com/cdn/' + v + '/data/fr_FR/item.json')
  ]);
})();
