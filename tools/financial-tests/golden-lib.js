'use strict';
/* Runs one scenario and reduces the result to its comparable leaves: numbers, booleans and short codes. Prose is left out on purpose, so wording can improve
   without touching the numbers, while any change to an amount, a rate, a date, a state or a count fails the test. */
const SKIP = /^(version|rulesChecked|conventions|checked|notes|text|source|sentence|why|basis|label|name|lowerWhy|msg|message|note|hint|title|summary)$/;
function leaves(x, path, out) {
  if (x === null || x === undefined) return out;
  if (typeof x === 'number') { if (isFinite(x)) out[path] = Math.round(x * 1e4) / 1e4; return out; }
  if (typeof x === 'boolean') { out[path] = x; return out; }
  if (typeof x === 'string') { if (x.length <= 24) out[path] = x; return out; }
  // the month-by-month balance series is sampled (every 6th month and the last): the events and headline carry the rest
  if (Array.isArray(x)) { x.forEach((v, k) => { if (/series$/.test(path) && k % 6 !== 0 && k !== x.length - 1) return; leaves(v, path + '[' + k + ']', out); }); return out; }
  if (typeof x === 'object') Object.keys(x).forEach((k) => { if (!SKIP.test(k)) leaves(x[k], path ? path + '.' + k : k, out); });
  return out;
}
function run(H, fn, input) {
  const i = JSON.parse(JSON.stringify(input));
  if (fn === 'timeline') return H.T.timeline(i);
  if (fn === 'assess') return H.A.assess(i);
  if (fn === 'hdbUpgrade') return H.ENG.analyse(i);
  return H.C[fn](i);
}
function snapshot(H, scenarios) {
  const out = {};
  scenarios.forEach(([fn, id, input]) => {
    let r; try { r = run(H, fn, input); } catch (e) { r = { threw: String(e.message).slice(0, 60) }; }
    out[id] = leaves(r, '', {});
  });
  return out;
}
module.exports = { snapshot, leaves, run };
