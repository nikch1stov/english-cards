// Redraws the app icon from the «Эй» mascot: flat colours, light background (see CLAUDE.md → Design).
// Run from the project root on the Mac: node tools/make-icon.mjs — then bump icon-180.png?v=N in index.html.
import { mascot } from '../mascot.js';
import { writeFileSync, mkdtempSync } from 'fs';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';

const BG = '#FFFCF6';
const SHADOW = 'rgba(214,150,30,.35)';

const body = mascot('happy', 300, '', 'A')
  .replace(/<ellipse class="m-shadow"[^>]*\/>/, '')
  .replace('<svg class="mascot mood-happy "', '<svg x="106" y="62"');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="${SHADOW}" flood-opacity="1"/></filter></defs><rect width="512" height="512" fill="${BG}"/><g filter="url(#sh)">${body}</g></svg>`;
writeFileSync('icon.svg', svg);

// macOS Quick Look renders the SVG to a 512 px PNG; sips makes the smaller sizes.
const tmp = mkdtempSync(join(tmpdir(), 'icon-'));
execSync(`qlmanage -t -s 512 -o "${tmp}" icon.svg`, { stdio: 'ignore' });
execSync(`cp "${tmp}/icon.svg.png" icon-512.png`);
for (const size of [192, 180]) execSync(`sips -z ${size} ${size} icon-512.png --out icon-${size}.png`, { stdio: 'ignore' });
console.log('icon.svg, icon-512.png, icon-192.png, icon-180.png updated');
