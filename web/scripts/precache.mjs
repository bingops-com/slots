// Après "next build" : dresse la liste des fichiers de l'interface pour le service worker,
// qui les garde tous afin que l'entraînement fonctionne hors ligne. Le service worker
// reçoit l'empreinte de cette liste : il se renouvelle dès qu'un fichier change.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const out = new URL('../out/', import.meta.url).pathname;
const skip = new Set(['precache.json', 'sw.js']);
const files = [];
const hash = createHash('sha256');

(function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else {
      const rel = relative(out, path).split(sep).join('/');
      if (skip.has(rel)) continue;
      hash.update(rel).update(readFileSync(path));
      // Une page se demande par son dossier : /g/beard/ et non /g/beard/index.html.
      files.push('/' + rel.replace(/(^|\/)index\.html$/, '$1'));
    }
  }
})(out);

const build = hash.digest('hex').slice(0, 16);
writeFileSync(join(out, 'precache.json'), JSON.stringify({ build, files }));
const sw = join(out, 'sw.js');
writeFileSync(sw, readFileSync(sw, 'utf8').replace('__BUILD__', build));
console.log(`precache: ${files.length} fichiers, version ${build}`);
