// Build step: inline engine/ into one self-contained HTML file per game.
//
// Every top-level folder whose index.html contains the placeholder comment
// below is a game: it gets a copy in dist/<folder>.html with the whole
// engine inlined as one <script>. Folders are discovered, so a new game only
// needs a folder with an index.html. Folders without an index.html (or with
// one that has no placeholder) are skipped.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLACEHOLDER = '<!-- rep-engine:inline -->';
const SKIP = new Set(['engine', 'build', 'dist', 'test', 'node_modules']);

// Game folders, sorted: top-level directories with a placeholder index.html.
// root defaults to the repo; tests pass a scratch folder.
export function gameFolders(root = ROOT) {
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !SKIP.has(d.name))
    .map((d) => d.name)
    .filter((name) => {
      const htmlPath = join(root, name, 'index.html');
      return existsSync(htmlPath) && readFileSync(htmlPath, 'utf8').includes(PLACEHOLDER);
    })
    .sort();
}

export function engineSource() {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'engine', 'manifest.json'), 'utf8'));
  const parts = manifest.files.map((file) => {
    const src = readFileSync(join(ROOT, 'engine', file), 'utf8');
    return `// ---- engine/${file} ----\n${src.trim()}\n`;
  });
  const banner = `/* rep-engine ${manifest.version}, inlined by build/build.mjs. Edit engine/, not this copy. */\n`;
  return banner + parts.join('\n');
}

export function build({ quiet = false, root = ROOT } = {}) {
  const engine = engineSource();
  // Guard against the inlined script closing its own <script> tag early.
  if (engine.includes('</script')) {
    throw new Error('engine source contains "</script", which would break inlining');
  }
  mkdirSync(join(root, 'dist'), { recursive: true });
  const built = [];
  for (const game of gameFolders(root)) {
    const html = readFileSync(join(root, game, 'index.html'), 'utf8');
    const out = html.replace(PLACEHOLDER, () => `<script>\n${engine}</script>`);
    const outPath = join(root, 'dist', `${game}.html`);
    writeFileSync(outPath, out);
    built.push(outPath);
    if (!quiet) console.log(`built dist/${game}.html (${(out.length / 1024).toFixed(1)} KB)`);
  }
  return built;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  build();
}
