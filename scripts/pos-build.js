'use strict';
// Depois do electron-builder: coloca o LEIA-ME.txt junto do Quizer.exe em dist/.
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const dist = path.join(raiz, 'dist');
if (!fs.existsSync(path.join(dist, 'Quizer.exe'))) {
  console.error('dist/Quizer.exe não foi gerado.');
  process.exit(1);
}
fs.copyFileSync(path.join(raiz, 'LEIA-ME.txt'), path.join(dist, 'LEIA-ME.txt'));
const mb = (fs.statSync(path.join(dist, 'Quizer.exe')).size / 1048576).toFixed(0);
console.log(`Pronto: dist/Quizer.exe (${mb} MB) e dist/LEIA-ME.txt`);
