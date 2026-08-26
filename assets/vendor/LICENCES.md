# Bibliothèques tierces hébergées par VisionScore

Ces quatre fichiers étaient auparavant chargés depuis trois CDN publics (jsdelivr,
cloudflare, unpkg). Ils sont désormais servis par visionscore.gg — voir le commentaire
en tête de `app.html` pour le raisonnement.

Chaque fichier est **inchangé** par rapport à la version publiée en amont : il a été
téléchargé puis comparé à l'empreinte SHA-384 relevée sur le CDN, et **conservé
uniquement en cas de correspondance**. Aucun n'a été modifié, reminifié ou concaténé.
L'en-tête de licence d'origine est donc intact dans chacun d'eux.

| Fichier | Version | Licence | Source d'origine |
|---|---|---|---|
| `chart-4.4.0.umd.min.js` | Chart.js 4.4.0 | MIT | `cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js` |
| `jspdf-2.5.1.umd.min.js` | jsPDF 2.5.1 | MIT | `cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js` |
| `jspdf-autotable-3.6.0.min.js` | jspdf-autotable 3.6.0 | MIT | `cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.6.0/jspdf.plugin.autotable.min.js` |
| `pdf-lib-1.17.1.min.js` | pdf-lib 1.17.1 | Apache-2.0 | `unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js` |

MIT et Apache-2.0 autorisent la redistribution ; toutes deux exigent le maintien des
mentions de copyright, qui sont présentes dans l'en-tête de chaque fichier minifié.

## Monter une version

Le numéro de version est **dans le nom du fichier**, et c'est ce qui rend sûr le cache
immuable posé par `vercel.json` sur `/assets/vendor/`. Remplacer le contenu d'un fichier
sans changer son nom laisserait les navigateurs servir l'ancienne version pendant un an.

1. Télécharger la nouvelle version sous un **nouveau nom** portant la version.
2. Mettre à jour la balise correspondante dans `app.html`.
3. Supprimer l'ancien fichier.
4. `node --test "test/*.test.js"` — un test vérifie qu'aucun script tiers n'est chargé
   depuis un domaine externe et que chaque fichier référencé existe bien sur le disque.
