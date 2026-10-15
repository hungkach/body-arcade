// Build step: inline engine/ into one self-contained HTML file per game.
//
// Each game folder (lab/, stomp-city/, manhattan-miles/) that has an
// index.html containing the placeholder comment below gets a copy in
// dist/<folder>.html with the whole engine inlined as one <script>.
// Folders without an index.html are skipped, so games can be added later.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLACEHOLDER = '<!-- rep-engine:inline -->';
const GAMES = ['lab', 'stomp-city', 'manhattan-miles'];

export function engineSource() {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'engine', 'manifest.json'), 'utf8'));
  const parts = manifest.files.map((file) => {
    const src = readFileSync(join(ROOT, 'engine', file), 'utf8');
    return `// ---- engine/${file} ----\n${src.trim()}\n`;
  });
  const banner = `/* rep-engine ${manifest.version}, inlined by build/build.mjs. Edit engine/, not this copy. */\n`;
  return banner + parts.join('\n');
}

export function build({ quiet = false } = {}) {
  const engine = engineSource();
  // Guard against the inlined script closing its own <script> tag early.
  if (engine.includes('</script')) {
    throw new Error('engine source contains "</script", which would break inlining');
  }
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  const built = [];
  for (const game of GAMES) {
    const htmlPath = join(ROOT, game, 'index.html');
    if (!existsSync(htmlPath)) continue;
    const html = readFileSync(htmlPath, 'utf8');
    if (!html.includes(PLACEHOLDER)) {
      throw new Error(`${game}/index.html is missing the ${PLACEHOLDER} placeholder`);
    }
    const out = html.replace(PLACEHOLDER, () => `<script>\n${engine}</script>`);
    const outPath = join(ROOT, 'dist', `${game}.html`);
    writeFileSync(outPath, out);
    built.push(outPath);
    if (!quiet) console.log(`built dist/${game}.html (${(out.length / 1024).toFixed(1)} KB)`);
  }
  return built;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  build();
}
