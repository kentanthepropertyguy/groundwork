'use strict';
/* Writes golden.json from the engines in the repo (or in the directory given as the first argument).
   Only run this on purpose, then read the diff: a changed number must be one you meant to change. */
const fs = require('fs'), path = require('path');
const H = require('./harness.js')(process.argv[2]);
const { snapshot } = require('./golden-lib.js');
const snap = snapshot(H, require('./scenarios.js'));
const target = process.argv[3] || path.join(__dirname, 'golden.json');
fs.writeFileSync(target, JSON.stringify(snap, null, 1) + '\n');
console.log('wrote', target, Object.keys(snap).length, 'scenarios', Object.values(snap).reduce((s, o) => s + Object.keys(o).length, 0), 'values');
