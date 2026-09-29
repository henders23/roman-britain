// Vite plugin: serves each dataset's latest pack round as a virtual module.
//   import { DATASETS, DEFAULT_DATASET } from 'virtual:atlas-datasets'
// The dev server validates in draft mode (unverified rows allowed); a production build
// validates in production mode and fails if the pack does not pass.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { listDatasets, loadDataset } from './pack.mjs';
import { validateDataset } from './validate.mjs';

const INDEX = 'virtual:atlas-datasets';
const ONE = 'virtual:atlas-dataset/';

export function datasetsPlugin({ root, defaultSlug = 'early-britain' }) {
  const dir = resolve(root, 'datasets');
  let draft = true;
  let server;

  const check = (slug) => {
    const { ok, output } = validateDataset(slug, { draft });
    if (!ok) throw new Error(`Research pack for "${slug}" failed validation (${draft ? 'draft' : 'production'} mode):\n${output}`);
    return output;
  };

  return {
    name: 'atlas-datasets',
    configResolved(c) {
      draft = c.command === 'serve';
    },
    configureServer(s) {
      server = s;
      s.watcher.add(dir);
      const reload = (file) => {
        if (!file.startsWith(dir)) return;
        for (const id of [...s.moduleGraph.idToModuleMap.keys()])
          if (id.startsWith('\0' + ONE) || id === '\0' + INDEX) s.moduleGraph.invalidateModule(s.moduleGraph.getModuleById(id));
        s.ws.send({ type: 'full-reload' });
      };
      s.watcher.on('change', reload);
      s.watcher.on('add', reload);
      s.watcher.on('unlink', reload);
    },
    buildStart() {
      if (!draft) for (const slug of listDatasets(dir)) console.log(check(slug));
    },
    resolveId(id) {
      if (id === INDEX || id.startsWith(ONE)) return '\0' + id;
    },
    load(id) {
      if (id === '\0' + INDEX) {
        const slugs = listDatasets(dir);
        const entries = slugs.map((slug) => {
          const cfg = JSON.parse(readFileSync(join(dir, slug, 'dataset.json'), 'utf8'));
          return `  ${JSON.stringify(slug)}: { slug: ${JSON.stringify(slug)}, title: ${JSON.stringify(cfg.title)}, subtitle: ${JSON.stringify(cfg.subtitle ?? '')}, load: () => import(${JSON.stringify(ONE + slug)}) },`;
        });
        const def = slugs.includes(defaultSlug) ? defaultSlug : slugs[0];
        return `export const DATASETS = {\n${entries.join('\n')}\n};\nexport const DEFAULT_DATASET = ${JSON.stringify(def ?? null)};\n`;
      }
      if (id.startsWith('\0' + ONE)) {
        const slug = id.slice(ONE.length + 1);
        const ddir = join(dir, slug);
        // The dev server's watcher reloads on any change under datasets/; builds need no watching.
        const out = check(slug);
        if (server) server.config.logger.info(`\n[atlas] ${slug}: ${out.split('\n')[0]} (${out.split('\n').filter((l) => l.includes('warning')).length} warnings)`, { timestamp: true });
        const data = loadDataset(ddir, slug);
        data.mode = draft ? 'draft' : 'production';
        // Optional territory layer: a JSON file in the dataset folder naming its region and border GeoJSON.
        let territory = 'null';
        let imports = '';
        const tFile = data.config.territory;
        if (tFile) {
          const tPath = join(ddir, tFile);
          if (!existsSync(tPath)) throw new Error(`${slug}: territory file ${tFile} not found`);
          const t = JSON.parse(readFileSync(tPath, 'utf8'));
          imports = `import regionsUrl from ${JSON.stringify(join(ddir, t.regionsFile) + '?url')};\nimport bordersUrl from ${JSON.stringify(join(ddir, t.bordersFile) + '?url')};\n`;
          territory = `{ ...${JSON.stringify({ ...t, regionsFile: undefined, bordersFile: undefined })}, regionsUrl, bordersUrl }`;
        }
        return `${imports}const data = ${JSON.stringify(data)};\ndata.territory = ${territory};\nexport default data;\n`;
      }
    },
  };
}
