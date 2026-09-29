// Runs the reference validator (tools/validate_pack.py) on every dataset, or on the slugs given.
// Usage: node scripts/validate.mjs [--draft] [slug...]
// Production mode (the default) is what `npm run build` uses: it fails while any include row
// is unverified, and names those rows.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { listDatasets, loadDataset } from './pack.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const datasetsDir = join(root, 'datasets');

/** Validate one dataset. Returns { ok, output }. */
export function validateDataset(slug, { draft = false } = {}) {
  const dir = join(datasetsDir, slug);
  const args = [join(root, 'tools', 'validate_pack.py'), dir, ...(draft ? ['--draft'] : [])];
  const res = spawnSync('python3', args, { encoding: 'utf8' });
  if (res.error) return { ok: false, output: `Could not run python3 ${args.join(' ')}: ${res.error.message}` };
  let output = (res.stdout + res.stderr).trimEnd();
  const ok = res.status === 0;
  if (!ok && !draft) {
    try {
      const { pack } = loadDataset(dir, slug);
      if (pack.unverified.length)
        output += `\n\nA production build needs every row checked. These ${pack.unverified.length} rows are still unverified:\n${pack.unverified.map((r) => `  - ${r.candidateId} (${r.disposition})`).join('\n')}\nCheck their locators, then set review_status to checked or reconciled in a new round of the pack.`;
    } catch {
      /* the validator's own message already says what is wrong */
    }
  }
  return { ok, output };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const draft = argv.includes('--draft');
  const slugs = argv.filter((a) => !a.startsWith('--'));
  const targets = slugs.length ? slugs : listDatasets(datasetsDir);
  if (!targets.length) {
    console.error(`No datasets found in ${datasetsDir}`);
    process.exit(1);
  }
  let failed = 0;
  for (const slug of targets) {
    const { ok, output } = validateDataset(slug, { draft });
    console.log(`── ${slug}\n${output}\n`);
    if (!ok) failed++;
  }
  if (failed) {
    console.error(`Validation failed for ${failed} of ${targets.length} dataset(s).`);
    process.exit(1);
  }
}
