'use strict';
/* Research Filters, Parts 1 and 2 (Claude C FINAL spec, approved 29 Oct 2026), section 7 acceptance tests 1-16 and 21 on the published data.
   The real page (tests 7, 17-20): research/tests/records-filters-render.py. Run from the site folder: node research/tests/records-filters-tests.js */
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const REC = require(path.join(ROOT, 'assets/js/gw-records.js')), B = require(path.join(ROOT, 'assets/js/gw-bedroom.js')), P = require(path.join(ROOT, 'assets/js/kpt-project.js'));
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else { fail++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info).slice(0, 600)); } };
const txt = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/manifest.json'), 'utf8'));
const tdir = path.join(ROOT, 'data/projects/tx'), tm = JSON.parse(fs.readFileSync(path.join(tdir, 'manifest.json'), 'utf8')), tsh = {};
const txOf = (id) => { const f = P.shardName(P.shardOf(id, tm.shards)) + '.json'; tsh[f] = tsh[f] || JSON.parse(fs.readFileSync(path.join(tdir, f), 'utf8')); return REC.pick(tsh[f], tm, id, man); };
const bdir = path.join(ROOT, 'data/projects/bedroom'), bm = JSON.parse(fs.readFileSync(path.join(bdir, 'manifest.json'), 'utf8')), bsh = {};
fs.readdirSync(bdir).filter((f) => /^s.*\.json$/.test(f)).forEach((f) => { bsh[f] = JSON.parse(fs.readFileSync(path.join(bdir, f), 'utf8')); });
const bedOf = (id) => B.pick(bsh[P.shardName(P.shardOf(id, bm.shards)) + '.json'], bm, id, man);
const D = (o) => Object.assign({}, REC.DEFAULT, o);
const N = (rec, f) => REC.filter(rec.rows, f, rec.latest).length;
const fil = (rec, f) => REC.filtersHtml(rec, f);
const optState = (h, k) => { const s = new RegExp('<select data-gwr-f="' + k + '">([\\s\\S]*?)</select>').exec(h)[1]; return (s.match(/<option[^>]*>[^<]*<\/option>/g) || []).map((o) => ({ v: /value="([^"]*)"/.exec(o)[1], on: / selected/.test(o), off: / disabled/.test(o), t: txt(o) })); };

/* ---------- Part 1 ---------- */
{
  const K = txOf('kovan-melody'), C = REC.facetCounts(K.rows, D({ sale: '3' }), K.latest);
  ok(C.bed['2'] === 21 && C.bed['3'] === 53 && C.bed['4'] === 11 && C.bed.u === 31 && C.bin['1200'] === 51, 'T1 Kovan Melody resales: 2-bed 21, 3-bed 53, 4-bed 11, Type unknown 31; 1,200–1,299 sq ft 51', C);
  const o = optState(fil(K, D({ sale: '3', bed: '3' })), 'bin').filter((x) => x.v !== 'all'), en = o.filter((x) => !x.off);
  ok(en.length === 2 && en[0].t === '1,100–1,199 sq ft (3)' && en[1].t === '1,200–1,299 sq ft (50)' && o.filter((x) => x.off).length === 7, 'T2 Kovan Melody 3-bed: only 1,100–1,199 (3) and 1,200–1,299 (50) enabled, 7 bands disabled', o.map((x) => x.t + (x.off ? ' off' : '')));
}
{
  // T3: 200 random developments x random states, every option's N equals the list after choosing it (ranges included)
  const ids = Object.keys(tm.index || {}).length ? Object.keys(tm.index) : [].concat(...fs.readdirSync(tdir).filter((f) => /^s.*\.json$/.test(f)).map((f) => Object.keys(JSON.parse(fs.readFileSync(path.join(tdir, f), 'utf8')).projects)));
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648), pick = (a) => a[Math.floor(rnd() * a.length)];
  const bad = []; let states = 0;
  for (let i = 0; i < 200; i++) {
    const rec = txOf(pick(ids)); if (!rec) continue; const O = REC.options(rec.rows);
    const f = D({ bed: pick(['all'].concat(O.beds.map(String), O.unknown ? ['u'] : [])), sale: pick(['all'].concat(O.sales.map(String))), period: pick(['all', '24', '12']) });
    if (rnd() < 0.4) { const r = pick(rec.rows), z = Math.round(r[3] * REC.SQFT); f.size = [z - Math.floor(rnd() * 40), z + Math.floor(rnd() * 40)]; } else f.bin = pick(['all'].concat(O.bins.map(String)));
    const C = REC.facetCounts(rec.rows, f, rec.latest, O); states++;
    ['bed', 'sale', 'period'].forEach((k) => Object.keys(C[k]).forEach((v) => { if (C[k][v] !== N(rec, Object.assign({}, f, { [k]: v }))) bad.push([rec.id, k, v]); }));
    Object.keys(C.bin).forEach((v) => { const g = v === 'range' ? f : Object.assign({}, f, { bin: v, size: null }); if (C.bin[v] !== N(rec, g)) bad.push([rec.id, 'bin', v]); });
  }
  ok(!bad.length && states > 150, 'T3 property test: every option count equals the list after choosing it (' + states + ' states)', bad.slice(0, 3));
}
{
  // T4: the selected option is never disabled; a selection at 0 shows "No sales match these filters" and its reset
  const K = txOf('kovan-melody'), f = D({ sale: '3', bed: '4', bin: '1200' }), h = fil(K, f), sel = optState(h, 'bin').find((x) => x.on);
  ok(N(K, f) === 0 && sel && sel.v === '1200' && !sel.off, 'T4 a chosen size at 0 stays enabled', sel);
  ok(/No sales match these filters/.test(REC.listHtml(K, f, 15)) && /data-gwr-reset/.test(REC.listHtml(K, f, 15)), 'T4 ... and the list says so, with its reset');
}
{
  // T5, T6: a group's range (Bartley Ridge 2-bed group 1)
  const R = txOf('bartley-ridge'), m = bedOf('bartley-ridge').resale.matched.find((x) => x.g === '2'), q = m.groups[0], f = REC.grpState('2', q), h = fil(R, f);
  const bed = optState(h, 'bed'), bin = optState(h, 'bin');
  ok(bed.find((x) => x.v === '2').t === '2-bedroom (8)' && bed.filter((x) => x.v !== '2' && x.v !== 'all').every((x) => x.off && /\(0\)$/.test(x.t)), 'T5 Home type with the range kept: 2-bed 8, every other type 0 and disabled', bed.map((x) => x.t));
  ok(bin[0].v === 'range' && bin[0].on && bin[0].t === '≈ 721–764 sq ft (8)' && bin.find((x) => x.v === '700').t === '700–799 sq ft (8)' && bin.find((x) => x.v === '800').t === '800–899 sq ft (3)', 'T5 Size: the range 8 (first, chosen); without it 700–799 8 and 800–899 3', bin.map((x) => x.t));
  const f2 = Object.assign({}, f, { period: 'all' }), b2 = optState(fil(R, f2), 'bin');
  ok(b2[0].v === 'range' && b2[0].on && b2[0].t === '≈ 721–764 sq ft (' + N(R, f2) + ')' && N(R, f2) > 8, 'T6 Period "Since…" keeps the range and recounts it', b2[0].t);
  ok(optState(fil(R, Object.assign({}, f, { bed: 'all' })), 'bin')[0].v === 'range', 'T6 changing Home type keeps the range');
  ok(optState(fil(R, D({ sale: '3', bed: '2', bin: '700' })), 'bin').every((x) => x.v !== 'range'), 'T7 without a range there is no range option');
  // T8: Clear filters
  ok(/data-gwr-clear/.test(REC.listHtml(R, f, 15)) && /data-gwr-clear/.test(REC.listHtml(R, D({ size: [721, 764] }), 15)) && !/data-gwr-clear/.test(REC.listHtml(R, D({}), 15)) && REC.isDefault(D({})) && !REC.isDefault(D({ size: [1, 2] })), 'T8 Clear filters shows for any state but the default, including a size alone');
}
{
  const K = txOf('kovan-melody'), top = REC.filter(K.rows, D({ sale: '3', bed: '3', sort: 'psfHigh' }), K.latest)[0];
  ok(REC.ymLabel(top[0]) === 'Apr 2026' && Math.round(top[3] * REC.SQFT) === 1227 && top[4] === 2398000 && Math.round(REC.psfOf(top)) === 1954, 'T9 Kovan Melody 3-bed resales, highest psf first: Apr 2026, ≈ 1,227 sq ft, $2,398,000, $1,954 psf', top);
  const lo = REC.filter(K.rows, D({ sale: '3', bed: '3', sort: 'psfLow' }), K.latest), ps = lo.map(REC.psfOf);
  ok(ps.every((v, i) => !i || ps[i - 1] <= v), 'T9 lowest psf first is ascending');
  const all = REC.filter(K.rows, D({ sort: 'psfLow' }), K.latest), keyOrder = all.map((r) => K.rows.indexOf(r)), stable = all.every((r, i) => !i || REC.psfOf(all[i - 1]) !== REC.psfOf(r) || keyOrder[i - 1] < keyOrder[i]);
  ok(stable, 'T9 ties keep URA’s order');
}
{
  const ans = (rec, f, shown) => txt(/<p class="gwr-count"[\s\S]*?<\/p>/.exec(REC.listHtml(rec, f, shown))[0]);
  const PC = txOf('parc-clematis'), q = bedOf('parc-clematis').resale.matched.find((x) => x.g === '2'), qq = q && q.groups && q.groups.find((x) => x.sqft[0] === 689);
  if (qq) {
    const f = REC.grpState('2', qq), a15 = ans(PC, f, 15), first = REC.filter(PC.rows, f, PC.latest).slice(0, 15);
    ok(qq.n === 56 && /\$1,359,000 to \$1,730,000 · \$1,973 to \$2,365 psf/.test(a15) && Math.max.apply(null, first.map((r) => r[4])) === 1680000, 'T10 Parc Clematis 2-bed group: the answer line is from all 56 sales, not the 15 shown', a15);
    ok(ans(PC, f, 60) === a15 && ans(PC, Object.assign({}, f, { sort: 'low' }), 15) === a15 && ans(PC, Object.assign({}, f, { sort: 'psfHigh' }), 15) === a15, 'T10 ... unchanged by Show more and by the order');
  } else ok(false, 'T10 Parc Clematis 2-bed group ≈ 689–743 exists', q && q.groups);
  const K = txOf('kovan-melody'), S = txOf('simsville'), R = txOf('bartley-ridge');
  ok(/^53 past sales · .* · lowest to highest \$1,450,000 to \$2,515,000 · \$1,192 to \$1,954 psf$/.test(ans(K, D({ sale: '3', bed: '3' }), 15)), 'T11 Kovan Melody 3-bed resales', ans(K, D({ sale: '3', bed: '3' }), 15));
  ok(/\$2,100,000 to \$2,420,000 · \$1,374 to \$1,583 psf$/.test(ans(S, D({ sale: '3', bed: '4', period: '24' }), 15)), 'T11 Simsville 4-bed resales, last 2 years', ans(S, D({ sale: '3', bed: '4', period: '24' }), 15));
  ok(ans(R, D({ sale: '3', bed: '3' }), 15) === '41 past sales · Oct 2021 – Sep 2026 · lowest to highest $1,550,000 to $2,490,000 · $1,440 to $2,158 psf', 'T11 Bartley Ridge 3-bed resales', ans(R, D({ sale: '3', bed: '3' }), 15));
  const one = REC.filter(K.rows, D({ sale: '3' }), K.latest)[0], z = Math.round(one[3] * REC.SQFT), f1 = D({ sale: '3', size: [z, z], bed: one[5] == null ? 'u' : String(one[5]), period: '12' });
  const a1 = N(K, f1) === 1 ? ans(K, f1, 15) : '';
  ok(!a1 || (/^1 past sale · \w{3} \d{4} · \$[\d,]+ · \$[\d,]+ psf$/.test(a1) && a1.indexOf('lowest') < 0), 'T11 one sale: the price only', a1);
}
{
  // T12: wording over 500 random states of the list region
  const ids = ['kovan-melody', 'bartley-ridge', 'parc-clematis', 'simsville', 'hundred-palms-residences', 'jadescape', 'treasure-at-tampines'];
  let seed = 11; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648), pick = (a) => a[Math.floor(rnd() * a.length)];
  const BAD = /\b(median|average|typical price|range of prices|trend|valued?|worth|budget|afford\w*)\b/i, bad = [];
  for (let i = 0; i < 500; i++) {
    const rec = txOf(pick(ids)); if (!rec) continue; const O = REC.options(rec.rows);
    const f = D({ bed: pick(['all'].concat(O.beds.map(String), O.unknown ? ['u'] : [])), sale: pick(['all'].concat(O.sales.map(String))), period: pick(['all', '24', '12']), sort: pick(['new', 'old', 'high', 'low', 'psfHigh', 'psfLow']), bin: pick(['all'].concat(O.bins.map(String))) });
    const h = REC.listHtml(rec, f, 15), t = txt(h).replace('not a typical price or a valuation', ''), m = BAD.exec(t);
    if (m) bad.push([rec.id, m[0]]);
    if (/data-gwr-count="[1-9]/.test(h) !== /data-gwr-ansfine/.test(h)) bad.push([rec.id, 'fine line']);
  }
  ok(!bad.length, 'T12 500 states: no median, average, typical price, trend, value, budget wording; the fine line with every answer line', bad.slice(0, 3));
}
{
  const H = txOf('hundred-palms-residences'), C = REC.facetCounts(H.rows, D({ sale: '3', period: '24' }), H.latest);
  ok(C.bed.u === 8 && C.bed.u === bedOf('hundred-palms-residences').resale.unknown, 'T13 Hundred Palms Residences, resales, last 2 years: Type unknown (8), equal to R2’s unknown', C.bed);
  ok(/data-gwr-unote/.test(REC.listHtml(H, D({ sale: '3', period: '24', bed: 'u' }), 15)) && !/data-gwr-unote/.test(REC.listHtml(H, D({ sale: '3', period: '24', bed: '3' }), 15)), 'T13 the Type unknown note only with Type unknown chosen');
}
/* ---------- Part 2 ---------- */
{
  const bad = [], spots = {}; let groups = 0, pages = 0, unk = 0;
  Object.values(bsh).forEach((sh) => Object.keys(sh.projects).forEach((id) => ((sh.projects[id].resale || {}).matched || []).forEach((m) => (m.groups || []).forEach((q) => {
    groups++; const rec = txOf(id); if (!rec) { bad.push([id, m.g, 'no tx']); return; }
    const f = REC.grpState(m.g, q), rows = REC.filter(rec.rows, f, rec.latest);
    // the group's own computation: its lowest, highest and median price are exactly these rows'
    const pr = rows.map((r) => r[4]).sort((a, b) => a - b), med = REC.quantile(pr, 0.5);
    if (rows.length !== q.n || pr[0] !== q.lo || pr[pr.length - 1] !== q.hi || Math.abs(med - q.med) > 1) bad.push([id, m.g, q.sqft, rows.length, q.n]);
    if (!REC.groupLink(rec, m.g, q)) bad.push([id, m.g, 'no link']);
    if (q.n > 15) pages++;
    if (REC.filter(rec.rows, Object.assign({}, f, { bed: 'u' }), rec.latest).length) unk++;
    spots[id + ' ' + m.g + ' ' + q.sqft.join('-')] = [q.win, rows.length];
  }))));
  ok(groups === 194 && !bad.length, 'T14 all 194 R2 groups: the link lists exactly n sales, the group’s own (lowest, highest, median)', { groups, bad: bad.slice(0, 3) });
  ok(JSON.stringify([spots['bartley-ridge 2 721-764'], spots['bartley-ridge 2 829-850'], spots['kovan-melody 3 1216-1292'], spots['parc-clematis 2 689-743']]) === JSON.stringify([[12, 8], [24, 10], [12, 12], [12, 56]]), 'T14 spot checks: Bartley Ridge 8 and 10, Kovan Melody 12, Parc Clematis 56', spots['parc-clematis 2 689-743']);
  ok(pages === 10 && unk === 15, 'T14 10 groups exceed one page; 15 have Type unknown sales in their range and window', { pages, unk });
  const R = txOf('bartley-ridge'), q = bedOf('bartley-ridge').resale.matched.find((x) => x.g === '2').groups[0];
  let threw = false, l = 'x'; try { l = REC.groupLink(R, '2', Object.assign({}, q, { n: q.n + 1 })); } catch (e) { threw = true; }
  ok(!threw && l === '', 'T15 a group whose n disagrees with the rows renders no button and throws nothing');
  ok(REC.groupLink(R, '2', q) === '<button type="button" class="kpr-link gwr-grp" data-gwr-grp="2|721|764|12|8">See these 8 sales</button>', 'T15 the button', REC.groupLink(R, '2', q));
}
{
  // T16: R2 unchanged: the panel without the link is byte-identical to the live R2 renderer; matchedRows and the bedroom data unchanged
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gwr2-'));
  ['gw-bedroom.js', 'gw-records.js', 'gw-pulse.js'].forEach((f) => fs.writeFileSync(path.join(tmp, f), execSync('git show live-tiers:assets/js/' + f, { cwd: ROOT, maxBuffer: 1 << 26 })));
  let old = null; try { old = { B: require(path.join(tmp, 'gw-bedroom.js')), R: require(path.join(tmp, 'gw-records.js')) }; } catch (e) { old = null; }
  if (old) {
    const bad = []; let n = 0;
    ['bartley-ridge', 'kovan-melody', 'parc-clematis', 'simsville', 'hundred-palms-residences', 'waterbank-at-dakota'].forEach((id) => { const r = bedOf(id), T = txOf(id); (r.resale.matched || []).filter((m) => !m.figures).forEach((m) => {
      n++; const V = B.view(r, 'resale', m.g), rows = REC.matchedRowsHtml(REC.matchedRows(T, m.g, 5)), a = B.matchedHtml(V, { tx: true, rows }), b = old.B.matchedHtml(old.B.view(r, 'resale', m.g), { tx: true, rows: old.R.matchedRowsHtml(old.R.matchedRows(T, m.g, 5)) });
      const withLink = B.matchedHtml(V, { tx: true, rows, grp: (g, q) => REC.groupLink(T, g, q) }).replace(/<button type="button" class="kpr-link gwr-grp"[^>]*>[^<]*<\/button>/g, '');
      if (a !== b || withLink !== b) bad.push([id, m.g]);
      if (JSON.stringify(REC.matchedRows(T, m.g, 5)) !== JSON.stringify(old.R.matchedRows(T, m.g, 5))) bad.push([id, m.g, 'rows']);
    }); });
    ok(n > 10 && !bad.length, 'T16 R2 panels (minus the button) and matchedRows byte-identical to the live R2 (' + n + ' types)', bad.slice(0, 3));
  } else ok(false, 'T16 live R2 renderer loads');
  const changed = execSync('git diff --name-only live-tiers -- data/projects/bedroom data/projects/tx', { cwd: ROOT }).toString().trim();
  ok(changed === '', 'T16 bedroom and transaction data unchanged', changed);
}
{
  // T21: facetCounts for the largest development
  let big = null; Object.keys(tm.index || {}).forEach(() => {});
  fs.readdirSync(tdir).filter((f) => /^s.*\.json$/.test(f)).forEach((f) => { const sh = JSON.parse(fs.readFileSync(path.join(tdir, f), 'utf8')); Object.keys(sh.projects).forEach((id) => { if (!big || sh.projects[id].rows.length > big[1]) big = [id, sh.projects[id].rows.length]; }); });
  const rec = txOf(big[0]), t0 = process.hrtime.bigint(); for (let i = 0; i < 10; i++) REC.facetCounts(rec.rows, D({ sale: '3', bed: 'all' }), rec.latest); const ms = Number(process.hrtime.bigint() - t0) / 1e7;
  ok(big[1] === 1168 && ms < 5, 'T21 facetCounts for the largest development (' + big[0] + ', ' + big[1] + ' sales): ' + ms.toFixed(2) + ' ms here (budget 20 ms on a mid-range phone)', big);
}
console.log('records-filters tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
