import { copyFileSync, mkdirSync, existsSync, writeFileSync, renameSync, rmSync } from 'fs';
import { join } from 'path';

const DIST = join(import.meta.dir, 'dist');

// Clean and create dist
if (existsSync(DIST)) rmSync(DIST, { recursive: true });
mkdirSync(DIST, { recursive: true });

async function buildEntry(entry: string, outputName: string) {
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: DIST,
    target: 'browser',
    minify: true,
  });
  if (!result.success) {
    console.error(`Build failed for ${entry}:`, result.logs);
    process.exit(1);
  }
  // Rename to desired output name
  const builtPath = result.outputs[0].path;
  const targetPath = join(DIST, outputName);
  if (builtPath !== targetPath) {
    renameSync(builtPath, targetPath);
  }
}

// Build all entries
await buildEntry('src/background/index.ts', 'background.js');
await buildEntry('src/content/index.ts', 'content.js');
await buildEntry('src/content/inpage.ts', 'inpage.js');
await buildEntry('src/popup/index.tsx', 'popup.js');
await buildEntry('src/confirm/index.tsx', 'confirm.js');
await buildEntry('src/unlock/index.tsx', 'unlock-page.js');

// Unlock HTML (dApp-triggered unlock popup)
writeFileSync(join(DIST, 'unlock.html'), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unlock - Auto Wallet</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div id="root"></div>
  <script src="unlock-page.js"></script>
</body>
</html>`);

// Confirm HTML (transaction approval popup)
writeFileSync(join(DIST, 'confirm.html'), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm - Auto-Wallet</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div id="root"></div>
  <script src="confirm.js"></script>
</body>
</html>`);

// Popup HTML
writeFileSync(join(DIST, 'popup.html'), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Auto-Wallet</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div id="root"></div>
  <script src="popup.js"></script>
</body>
</html>`);

// Copy CSS
copyFileSync(join(import.meta.dir, 'src/popup/styles.css'), join(DIST, 'popup.css'));

// Copy manifest
copyFileSync(join(import.meta.dir, 'public/manifest.json'), join(DIST, 'manifest.json'));

// Copy pre-built icon PNGs (16, 48, 128)
mkdirSync(join(DIST, 'icons'), { recursive: true });
for (const size of [16, 48, 128]) {
  const src = join(import.meta.dir, 'public/icons', `icon${size}.png`);
  const target = join(DIST, 'icons', `icon${size}.png`);
  copyFileSync(src, target);
}

console.log('Build complete! Output: dist/');
console.log('Load as unpacked extension: chrome://extensions -> Load unpacked -> select dist/');
