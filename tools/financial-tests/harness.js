/* Loads the financial engines the same way the browser does (rules -> calc -> timeline -> answer; schedule adapter), from the repo this file sits in.
   Usage: const H = require('./harness.js')(rootDir?)  ->  { R, C, T, A, S, ENG } */
'use strict';
const path = require('path');
module.exports = function load(root) {
  root = path.resolve(root || path.join(__dirname, '..', '..'));
  global.self = global;
  const KR = require(root + '/tools/hdb-upgrade/rules.js');
  const R = require(root + '/assets/js/gw-rules.js')(KR); global.GW_RULES = R;
  const ENG = require(root + '/tools/hdb-upgrade/engine.js'), ASM = require(root + '/tools/hdb-upgrade/assumptions.js');
  const C = require(root + '/assets/js/gw-calc.js')(R, ENG, ASM); global.GW_CALC = C;
  const T = require(root + '/assets/js/gw-timeline.js')(R, C);
  const A = require(root + '/assets/js/gw-answer.js')(R, C, T);
  const S = require(root + '/assets/js/gw-schedule.js')(R, C);
  return { root, R, C, T, A, S, ENG };
};
