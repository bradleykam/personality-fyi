const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const publish = path.join(root, '.publish');
fs.rmSync(publish, { recursive: true, force: true });
for (const relative of require('./publish-files.json')) {
  const destination = path.join(publish, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, relative), destination);
}
console.log('Prepared the production file set.');
