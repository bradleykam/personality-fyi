const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const publish = path.join(root, '.publish');
fs.rmSync(publish, { recursive: true, force: true });
for (const relative of require('./publish-files.json')) {
  const destination = path.join(publish, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (relative.endsWith('.html')) {
    const html = fs.readFileSync(path.join(root, relative), 'utf8');
    fs.writeFileSync(destination, html.replace('</head>', '<script>if(window.self!==window.top)document.documentElement.classList.add("embedded-content")</script><link rel="stylesheet" href="/clarity.css?v=20261004-shell"><script defer src="/email-attribution.js"></script></head>'));
  } else fs.copyFileSync(path.join(root, relative), destination);
}
console.log('Prepared the production file set.');
