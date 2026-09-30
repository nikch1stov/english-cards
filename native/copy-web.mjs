// Copies the website (the folder above) into www/, which Capacitor bundles into the iPhone app.
// The service worker stays out: inside the app every file is already on the phone.
import { cpSync, rmSync, mkdirSync } from 'fs';

const FILES = ['index.html', 'app.js', 'core.js', 'mascot.js', 'cloud.js', 'config.js', 'native.js', 'style.css', 'words.md',
  'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

rmSync('www', { recursive: true, force: true });
mkdirSync('www');
for (const f of FILES) cpSync(`../${f}`, `www/${f}`);
console.log(`www/: ${FILES.length} files copied`);
