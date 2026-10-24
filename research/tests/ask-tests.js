// "Check an asking price", answer first (25 Oct 2026): the headline, the proportional chart, the figures and the quiet note.
// Run: node research/tests/ask-tests.js
const assert = require('assert'), path = require('path');
const A = require(path.join(__dirname, '../../assets/js/gw-ask.js'));
let pass = 0; const t = (name, fn) => { fn(); pass++; console.log('  ok  ' + name); };

const band = (o) => Object.assign({ bin: 700, label: '700–799 sq ft', n: 23, months: 9, latest: 'Sep 2026', lo: 1650, q1: 1720, med: 1790, q3: 1850, hi: 1935 }, o || {});
const condo = (bands) => ({ id: 'x', name: 'Test Residences', words: ['resale', 'resales'], bands: bands || [band()] });
const svgOf = (h) => (h.match(/<svg class="gw-ask-svg"[\s\S]*?<\/svg>/) || [''])[0];
// the asking marker's centre and the range's ends, read back from the drawing
function geom(h) {
  const s = svgOf(h), c = s.match(/<circle cx="([\d.-]+)" cy="[\d.]+" r="7.5"/), r = s.match(/<rect x="([\d.-]+)" y="[\d.]+" width="([\d.]+)" height="8" rx="4" fill="#DCE0EA"/);
  return { ax: +c[1], lx: +r[1], hx: +r[1] + +r[2], vb: +s.match(/viewBox="-4 0 (\d+)/)[1] };
}

t('headline groups place(): below | within | above', () => {
  assert.strictEqual(A.verdict('below'), 'below'); assert.strictEqual(A.verdict('above'), 'above');
  ['lower', 'middle', 'upper', 'within'].forEach((p) => assert.strictEqual(A.verdict(p), 'within'));
  assert.strictEqual(A.verdict(null), null);
});
t('within the range: headline, chart, figures, one quiet note', () => {
  const r = A.condoResult(condo(), '753', '1,350,000'); // 1,792.8 psf
  assert.strictEqual(r.state, 'ok'); assert.strictEqual(r.verdict, 'within');
  assert.ok(r.html.includes('Within recent comparable sale range'));
  assert.ok(r.html.indexOf('gw-ask-v') < r.html.indexOf('gw-ask-svg') && r.html.indexOf('gw-ask-svg') < r.html.indexOf('gw-ask-nums'), 'answer, then chart, then figures');
  ['$1,350,000', '$1,793 psf', '$1,650 – $1,935 psf', 'Median', '$1,790 psf', '700–799 sq ft', '23 resales · last 12 months'].forEach((w) => assert.ok(r.html.includes(w), w));
  assert.ok(!/gw-ask-note/.test(A.panelHtml('condo', condo())), 'the yellow panel is gone');
  assert.ok(A.panelHtml('condo', condo()).includes('Recent sales are a guide, not a valuation. Floor, facing and condition may affect price.'));
});
t('above and below: the gap is named against the nearest end', () => {
  const up = A.condoResult(condo(), '753', '1,550,000'); // 2,058 psf
  assert.strictEqual(up.verdict, 'above'); assert.ok(up.html.includes('Above recent comparable sale range') && up.html.includes('6% above the highest sale'));
  const dn = A.condoResult(condo(), '753', '1,180,000'); // 1,567 psf
  assert.strictEqual(dn.verdict, 'below'); assert.ok(dn.html.includes('Below recent comparable sale range') && dn.html.includes('5% below the lowest sale'));
  const just = A.condoResult(condo(), '1000', '1,936,000'); // 1,936 psf vs highest 1,935 (in the 1,000 band below, re-banded)
  assert.ok(/Just above|% above/.test(A.gapText(1936, { hi: 1935, lo: 1650 }, 'above')) && A.gapText(1936, { hi: 1935, lo: 1650 }, 'above').startsWith('Just above'));
  void just;
});
t('the scale is proportional, inside and outside the range', () => {
  [1350000, 1550000, 2600000, 900000].forEach((price) => {
    const r = A.condoResult(condo(), '753', String(price)), g = geom(r.html), psf = price / 753, b = band();
    const want = (psf - b.lo) / (b.hi - b.lo), got = (g.ax - g.lx) / (g.hx - g.lx);
    assert.ok(Math.abs(want - got) < 0.01, price + ': ' + want + ' vs ' + got);
    assert.ok(g.ax >= 0 && g.ax <= 320 && g.lx >= 0 && g.hx <= 320, 'everything inside the drawing');
    if (psf > b.hi || psf < b.lo) assert.ok(/stroke-dasharray="3 3"/.test(svgOf(r.html)), 'the gap is drawn');
  });
});
t('labels never overlap: a narrow range gets one "lowest – highest" label', () => {
  const far = A.condoResult(condo(), '753', '3,800,000'); // the range squeezes to the left
  assert.ok(svgOf(far.html).includes('lowest – highest') && !svgOf(far.html).includes('>lowest<'));
  const near = A.condoResult(condo(), '753', '1,350,000');
  assert.ok(svgOf(near.html).includes('>lowest<') && svgOf(near.html).includes('>highest<'));
});
t('few sales: no middle half and no median (fewer than 4), but still a range', () => {
  const r = A.condoResult(condo([band({ n: 3, months: 3 })]), '753', '1,350,000');
  assert.strictEqual(r.state, 'ok'); assert.ok(!r.html.includes('Median') && !r.html.includes('#5D6487') && !r.html.includes('Middle half'));
});
t('every sale at one price: one label, no division by zero', () => {
  const r = A.condoResult(condo([band({ n: 2, months: 2, lo: 1800, q1: 1800, med: 1800, q3: 1800, hi: 1800 })]), '753', '1,355,400');
  assert.strictEqual(r.state, 'ok'); assert.ok(!/NaN|Infinity/.test(r.html)); assert.ok(svgOf(r.html).includes('every sale'));
});
t('too few or no sales: no range is implied', () => {
  const thin = A.condoResult(condo([band({ n: 1, months: 1 })]), '753', '1,350,000');
  assert.strictEqual(thin.state, 'thin'); assert.ok(thin.html.includes('Too few recent sales to compare') && !/comparable sale range/.test(thin.html) && !thin.html.includes('gw-ask-svg'));
  const none = A.condoResult(condo([band({ n: 0 })]), '753', '1,350,000');
  assert.strictEqual(none.state, 'none'); assert.ok(none.html.includes('No recent comparable sales') && !/comparable sale range/.test(none.html));
});
t('HDB: actual sales as dots (only when the list is complete), a median from them, no psf', () => {
  const ps = [520000, 535000, 540000, 540000, 555000, 560000, 590000];
  const H = { lo: 520000, q1: 535000, q3: 560000, hi: 590000, n: 7, midN: 4, level: 'block', ft: '4-room', ps };
  const r = A.hdbResult(H, '600,000');
  assert.strictEqual(r.verdict, 'above'); assert.ok(r.html.includes('Above recent comparable sale range'));
  assert.strictEqual((svgOf(r.html).match(/r="3.4"/g) || []).length, 7, 'one dot per sale, overlapping prices stacked');
  assert.ok(r.html.includes('Each dot is one sale') && r.html.includes('$540,000') && r.html.includes('7 resales · last 2 years') && !r.html.includes('psf'));
  const part = A.hdbResult(Object.assign({}, H, { ps: ps.slice(1) }), '600,000');
  assert.ok(!part.html.includes('Each dot is one sale') && !part.html.includes('Median'), 'an incomplete list draws nothing');
  assert.strictEqual(A.median([1, 2, 3, 4]), 2.5); assert.strictEqual(A.median([1, 2, 3]), undefined);
});
t('privacy: the panel holds no block, and the result never builds a link', () => {
  const p = A.panelHtml('hdb', { lo: 1, q1: 2, q3: 3, hi: 4, n: 4, level: 'block', where: 'Blk 123 Somewhere St', ft: '4-room', ps: [1, 2, 3, 4] });
  assert.ok(!p.includes('Somewhere') && !/href=/.test(p));
  const r = A.condoResult(condo(), '753', '1,350,000'); assert.ok(!/href=|wa\.me/.test(r.html));
});
t('input states are unchanged', () => {
  assert.strictEqual(A.condoResult(condo(), '', '').state, 'input');
  assert.strictEqual(A.condoResult(condo(), '753', '5000').state, 'input');
  assert.strictEqual(A.hdbResult({ lo: 1, hi: 2, n: 5 }, '').state, 'input');
});
console.log('ask-tests: ' + pass + ' passed');
