// node tools/market-data/tests/rental-window-tests.js : the 12-quarter rental window is enforced whatever the folder holds, other windows
// only in comparison runs (never public), and the fetch keeps the URA folder at exactly the window with older quarters archived apart.
// Synthetic data only; no network.
'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const RW = require('../rental-window.js'), BB = require('../build-bedroom.js'), H = require('../bedroom-hybrid.js'), FR = require('../fetch-ura-rental.js');
let pass = 0, fail = 0;
const T = [], t = (name, fn) => T.push([name, fn]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-rw-'));
const quarters = (from, n) => RW.quartersEnding(from, n);
const rentalJson = (q, n) => JSON.stringify({ Status: 'Success', Result: [{ project: 'Q' + q, rental: Array.from({ length: n || 2 }, () => ({ areaSqm: '60-70', areaSqft: '600-700', noOfBedRoom: '2', leaseDate: '0326', rent: 3000 })) }] });

t('12 quarters ending at the newest file; never more, whatever else the folder holds', () => {
  const names = quarters('26q3', 30).map((q) => 'rental-' + q + '.json').concat(['rental-26q3 (1).json', 'rental-26q3.json.bak', 'rental-2026q3.json', 'batch-1.json', 'notes.txt']);
  const s = RW.select(names);
  assert.strictEqual(s.files.length, 12); assert.strictEqual(s.from, '23q4'); assert.strictEqual(s.to, '26q3'); assert.strictEqual(s.complete, true);
  assert.strictEqual(s.archived.length, 18);
  for (let n = 0; n < 40; n++) assert.ok(RW.select(quarters('26q3', n).map((q) => 'rental-' + q + '.json')).files.length <= 12);
});
t('a gap inside the window is reported and read as fewer quarters, never filled from older ones', () => {
  const names = quarters('26q3', 16).filter((q) => q !== '25q2').map((q) => 'rental-' + q + '.json'), s = RW.select(names);
  assert.strictEqual(s.files.length, 11); assert.deepStrictEqual(s.missing, ['25q2']); assert.strictEqual(s.from, '23q4'); assert.strictEqual(s.complete, false);
});
t('the window follows the newest quarter: a new quarter moves it on, it does not widen it', () => {
  const a = RW.select(quarters('26q3', 12).map((q) => 'rental-' + q + '.json')), b = RW.select(quarters('26q4', 13).map((q) => 'rental-' + q + '.json'));
  assert.strictEqual(a.from, '23q4'); assert.strictEqual(b.from, '24q1'); assert.strictEqual(b.files.length, 12); assert.deepStrictEqual(b.archived, ['23q4']);
});
t('any other size is refused unless the run is a comparison', () => {
  assert.strictEqual(RW.windowSize(), 12); assert.strictEqual(RW.windowSize({ rentalQuarters: 12 }), 12);
  assert.throws(() => RW.windowSize({ rentalQuarters: 20 }), /only in a comparison run/); assert.throws(() => RW.windowSize({ rentalQuarters: 4 }), /only in a comparison run/);
  assert.strictEqual(RW.windowSize({ rentalQuarters: 20, comparison: true }), 20); assert.throws(() => RW.windowSize({ rentalQuarters: 'x', comparison: true }), /not a number/);
});
t('the last completed quarter and the lag behind the sales data', () => {
  assert.strictEqual(RW.lastCompleted(new Date(Date.UTC(2026, 9, 24))), '26q3'); assert.strictEqual(RW.lastCompleted(new Date(Date.UTC(2027, 0, 5))), '26q4');
  assert.strictEqual(RW.lag({ to: '26q3' }, 2026 * 12 + 8), 0); assert.strictEqual(RW.lag({ to: '26q1' }, 2026 * 12 + 8), 2);
});

t('readRaw reads only the 12 newest quarter files of a folder holding 20', () => {
  const d = path.join(tmp, 'raw'); fs.mkdirSync(d);
  fs.writeFileSync(path.join(d, 'batch-1.json'), JSON.stringify({ Result: [] }));
  quarters('26q3', 20).forEach((q) => fs.writeFileSync(path.join(d, 'rental-' + q + '.json'), rentalJson(q)));
  const r = BB.readRaw(d);
  assert.strictEqual(r.rentalFiles, 12); assert.strictEqual(r.rent.size, 12); assert.ok(r.rent.has('Q26q3') && r.rent.has('Q23q4') && !r.rent.has('Q23q3'));
  assert.throws(() => BB.readRaw(d, { rentalQuarters: 20 }), /only in a comparison run/);
  assert.strictEqual(BB.readRaw(d, { rentalQuarters: 20, comparison: true }).rent.size, 20);
});
t('a comparison report can never become public output', () => {
  const rep = { asOf: 'x', latestMonth: '2026-09', comparison: true, rentalWindow: { standard: false }, developments: [] };
  assert.throws(() => H.publicView(rep), /standard rental window/);
  assert.throws(() => H.publicView({ asOf: 'x', latestMonth: '2026-09', rentalWindow: { standard: false }, developments: [] }), /standard rental window/);
  assert.deepStrictEqual(H.publicView({ asOf: 'x', latestMonth: '2026-09', rentalWindow: { standard: true }, developments: [] }).developments, {});
});

// a fake URA: quarters from 21q4 up to `published` have contracts; later ones are empty
const fakeUra = (published, calls) => async (url) => {
  calls.push(url);
  if (/insertNewToken/.test(url)) return { status: 200, text: async () => JSON.stringify({ Status: 'Success', Result: 'TKN' }) };
  const q = /refPeriod=(\d{2}q[1-4])/.exec(url)[1], i = RW.index(Number(q.slice(0, 2)), Number(q[3]));
  const has = i >= RW.index(21, 4) && i <= RW.index(Number(published.slice(0, 2)), Number(published[3]));
  return { status: 200, text: async () => (has ? rentalJson(q, 3) : JSON.stringify({ Status: 'Success', Result: [] })) };
};
const rentalsIn = (d) => fs.readdirSync(d).map(RW.parse).filter(Boolean).map((x) => x.yyqq).sort((a, b) => RW.index(+a.slice(0, 2), +a[3]) - RW.index(+b.slice(0, 2), +b[3]));
t('first run: the folder gets exactly the 12 quarters, nothing is archived', async () => {
  const out = path.join(tmp, 'ura', 'current'), calls = [];
  const r = await FR.fetchWindow({ fetch: fakeUra('26q3', calls), accessKey: 'SECRET-KEY', out, now: new Date(Date.UTC(2026, 9, 24)), pauseMs: 0 });
  assert.deepStrictEqual(rentalsIn(out), quarters('26q3', 12)); assert.strictEqual(r.window.complete, true); assert.strictEqual(r.archive, path.join(tmp, 'ura', 'rental-archive'));
  assert.deepStrictEqual(rentalsIn(r.archive), []);
});
t('next quarter: the oldest quarter moves to the archive, the newest two are fetched again, still 12', async () => {
  const out = path.join(tmp, 'ura', 'current'), calls = [];
  const r = await FR.fetchWindow({ fetch: fakeUra('26q4', calls), accessKey: 'SECRET-KEY', out, now: new Date(Date.UTC(2027, 0, 20)), pauseMs: 0 });
  assert.deepStrictEqual(rentalsIn(out), quarters('26q4', 12)); assert.deepStrictEqual(rentalsIn(r.archive), ['23q4']);
  assert.deepStrictEqual(r.fetched.map((x) => x.quarter).sort(), ['26q3', '26q4']);
  assert.strictEqual(calls.filter((u) => /refPeriod/.test(u)).length, 2);   // 26q4 once (it is also the newest-quarter check), 26q3 again
});
t('a quarter URA has not published yet: the window ends a quarter earlier and keeps its size', async () => {
  const out = path.join(tmp, 'ura', 'current'), r = await FR.fetchWindow({ fetch: fakeUra('26q4', []), accessKey: 'SECRET-KEY', out, now: new Date(Date.UTC(2027, 3, 2)), pauseMs: 0 });
  assert.strictEqual(r.window.to, '26q4'); assert.strictEqual(r.window.files.length, 12);
});
t('older files copied into the folder by hand are moved to the archive; archived quarters the window needs come back; nothing is deleted', () => {
  const out = path.join(tmp, 'ura', 'current'), archive = path.join(tmp, 'ura', 'rental-archive');
  ['21q4', '22q1'].forEach((q) => fs.writeFileSync(path.join(out, 'rental-' + q + '.json'), rentalJson(q)));
  fs.renameSync(path.join(out, 'rental-25q1.json'), path.join(archive, 'rental-25q1.json'));
  const before = rentalsIn(out).length + rentalsIn(archive).length, m = FR.organise(out, archive, FR.windowFromFiles(out, archive));
  assert.deepStrictEqual(m.restored, ['25q1']); assert.deepStrictEqual(m.archived.sort(), ['21q4', '22q1']);
  assert.deepStrictEqual(rentalsIn(out), quarters('26q4', 12)); assert.strictEqual(rentalsIn(out).length + rentalsIn(archive).length, before);
});
t('the access key is never written to disk', () => {
  const walk = (d) => fs.readdirSync(d).forEach((f) => { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else assert.ok(!/SECRET-KEY/.test(fs.readFileSync(p, 'utf8')), p); });
  walk(path.join(tmp, 'ura'));
});

(async () => {
  for (const [name, fn] of T) { try { await fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
