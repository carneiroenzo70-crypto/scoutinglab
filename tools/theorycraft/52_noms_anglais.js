/* Génère `noms_en.json` : nom ANGLAIS d'objet → identifiant Riot.
   `node 52_noms_anglais.js`

   POURQUOI. Leaguepedia publie les builds des matchs professionnels avec les noms
   d'objets en ANGLAIS (« Lord Dominik's Regards »), alors que tout le produit travaille
   en identifiants et affiche du français. Il faut donc un pont, et il doit être STATIQUE :
   le construire à chaud imposerait un aller-retour vers Data Dragon à chaque ouverture,
   pour une correspondance qui ne change qu'au patch.

   ⚠ LE PIÈGE, découvert en mesurant. Data Dragon contient plusieurs objets DU MÊME NOM :
   la version Faille de l'invocateur et ses variantes d'autres modes.

       Lord Dominik's Regards → 3036 (Faille)  ET  223036 (Arena)
       Guardian Angel         → 3026 (Faille)  ET  223026, 773026

   Un dictionnaire naïf garde la DERNIÈRE rencontrée, donc la variante, et l'objet devient
   introuvable dans le reste du produit. Première mesure : 125 objets sur 158 « absents »,
   alors qu'ils y étaient tous. On ne retient donc que les objets jouables sur la FAILLE
   (`maps['11']`), qui est le seul terrain des matchs officiels. */
const fs = require('fs');
const path = require('path');

async function main() {
  const versions = await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json();
  const version = versions[0];
  const en = await (await fetch('https://ddragon.leagueoflegends.com/cdn/' + version + '/data/en_US/item.json')).json();

  /* Clé NORMALISÉE, et pas le nom brut. Un seul objet manquait à la première mesure :
     Leaguepedia écrit « Blade of the Ruined King », Data Dragon « Blade of The Ruined
     King ». Une majuscule. Plutôt que de corriger ce cas-là, on ferme toute la classe —
     casse, espaces multiples, et les deux apostrophes typographiques (' et ’) que les
     deux sources n'emploient pas toujours de la même façon. */
  const cle = n => String(n).toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();

  /* ⚠ Le filtre « Faille » ne suffit pas : certains objets ont DEUX entrées marquées
     Faille, l'objet canonique et une variante de mode saisonnier, plus chère.

         Mikael's Blessing → 3222 (2 300 po)  et  323222 (2 800 po)
         Echoes of Helia   → 6620 (2 200 po)  et  326620 (2 600 po)

     Les variantes portent un identifiant PRÉFIXÉ (22…, 32…, 77…) ; le canonique est le
     plus court. On garde donc le plus court, puis le plus petit à longueur égale. Sans
     cette règle, l'icône affichée serait celle d'une variante que personne ne joue en
     match officiel. */
  const parNom = {};
  const collisions = [];
  Object.entries(en.data).forEach(([id, o]) => {
    if (!o.maps || o.maps['11'] !== true) return;      // hors Faille : ignoré
    const k = cle(o.name);
    const actuel = parNom[k];
    if (actuel && actuel !== id) {
      collisions.push(o.name + ' : ' + actuel + ' / ' + id);
      const meilleur = (id.length !== actuel.length)
        ? (id.length < actuel.length ? id : actuel)
        : (Number(id) < Number(actuel) ? id : actuel);
      parNom[k] = meilleur;
      return;
    }
    parNom[k] = id;
  });

  /* Le nom FRANÇAIS pour l'affichage. On pourrait le tirer d'items.json, mais celui-ci
     vit dans le paquet de 1,8 Mo du moteur de theorycraft — or la vue « builds joués en
     compétition » n'a besoin d'AUCUN calcul : elle affiche des faits. Un fichier autonome
     de quelques kilo-octets lui évite de charger tout le moteur pour deux libellés. */
  const fr = await (await fetch('https://ddragon.leagueoflegends.com/cdn/' + version + '/data/fr_FR/item.json')).json();
  const nomsFr = {};
  const prix = {};
  Object.values(parNom).forEach(id => {
    const o = fr.data[id];
    if (o && o.name) nomsFr[id] = o.name;
    /* Le prix sert a separer un objet de build d une potion ou d une balise : la liste
       d objets de Leaguepedia est l inventaire de FIN de partie, consommables compris.
       Compter une Potion de soin parmi les "objets les plus joues" serait vrai et
       parfaitement inutile. */
    const g = (en.data[id] || {}).gold || {};
    if (g.total != null) prix[id] = g.total;
  });

  fs.writeFileSync(path.join(__dirname, 'noms_en.json'),
                   JSON.stringify({ version, noms: parNom }, null, 0));
  const asset = path.join(__dirname, '..', '..', 'assets', 'objets_noms.json');
  fs.mkdirSync(path.dirname(asset), { recursive: true });
  fs.writeFileSync(asset, JSON.stringify({ version, parNomEn: parNom, fr: nomsFr, prix }, null, 0));

  const nos = require('./items.json');
  const connus = new Set(nos.map(o => String(o.id)));
  const orphelins = Object.values(parNom).filter(id => !connus.has(id));
  const sansFr = Object.values(parNom).filter(id => !nomsFr[id]);

  console.log('Data Dragon ' + version);
  console.log('  noms anglais (Faille uniquement) : ' + Object.keys(parNom).length);
  console.log('  collisions de noms restantes     : ' + collisions.length +
              (collisions.length ? ' → ' + collisions.slice(0, 5).join(' | ') : ''));
  console.log('  identifiants absents de items.json : ' + orphelins.length +
              ' (normal : items.json ne garde que ce que le moteur sait modéliser)');
  console.log('  sans nom français                 : ' + sansFr.length);
  console.log('  assets/objets_noms.json — ' + Math.round(fs.statSync(asset).size / 1024) + ' Ko');
}

main().catch(e => { console.error('échec :', e.message); process.exit(1); });
