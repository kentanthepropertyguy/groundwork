#!/usr/bin/env node
/* ==========================================================================
   GROUNDWORK — URA private residential rental contracts (PMI_Resi_Rental) for the bedroom classification window: the latest 12 quarters.

     URA_ACCESS_KEY=xxxx node tools/market-data/fetch-ura-rental.js --out <private URA folder> [--archive <private folder>] [--refresh 2]
     node tools/market-data/fetch-ura-rental.js --out <private URA folder> [--archive <private folder>] --organise-only     (no network)

   After every run the URA folder holds ONLY the window's quarters (rental-<yyqq>.json) next to the transaction batches, and every older
   quarter sits in the archive folder (default: <URA folder>/../rental-archive). Nothing is ever deleted.
     1. Quarters the window needs that are in the archive are moved back (no download).
     2. The window ends at the last COMPLETED quarter (or --last). If URA has nothing for it yet, it ends a quarter earlier.
     3. Missing quarters are fetched; the latest --refresh quarters (default 2) are fetched again, because contracts reach URA after the
        lease starts and recent quarters keep growing.
     4. Quarters outside the window are moved to the archive.
   The classification enforces the window by itself as well (rental-window.js): even a folder holding more files is read as 12 quarters.
   The key comes from the environment only and is never written anywhere. Raw files stay private, never in the repository.
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const RW = require('./rental-window.js');
const BASE = 'https://eservice.ura.gov.sg/uraDataService/';

const defaultArchive = (out) => path.join(path.dirname(path.resolve(out)), 'rental-archive');
const move = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); try { fs.renameSync(from, to); } catch (e) { fs.copyFileSync(from, to); fs.unlinkSync(from); } };

// Make the folder hold exactly the window `want` (yyqq list): bring archived quarters back, move the others out. Returns what moved.
function organise(out, archive, want) {
  fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(archive, { recursive: true });
  const wanted = new Set(want), restored = [], archived = [];
  fs.readdirSync(archive).map(RW.parse).filter(Boolean).forEach((x) => { if (wanted.has(x.yyqq) && !fs.existsSync(path.join(out, x.name))) { move(path.join(archive, x.name), path.join(out, x.name)); restored.push(x.yyqq); } });
  fs.readdirSync(out).map(RW.parse).filter(Boolean).forEach((x) => { if (!wanted.has(x.yyqq)) { move(path.join(out, x.name), path.join(archive, x.name)); archived.push(x.yyqq); } });
  return { restored, archived };
}
// the window a folder should hold when no download is made: the latest WINDOW_QUARTERS ending at the newest quarter in the folder or archive
function windowFromFiles(out, archive) {
  const names = [].concat(fs.existsSync(out) ? fs.readdirSync(out) : [], fs.existsSync(archive) ? fs.readdirSync(archive) : []);
  const sel = RW.select(names, RW.WINDOW_QUARTERS); return sel.to ? RW.quartersEnding(sel.to, RW.WINDOW_QUARTERS) : [];
}

// o: { fetch, accessKey, out, archive, refresh, last, now, pauseMs, log }
async function fetchWindow(o) {
  o = Object.assign({ refresh: 2, pauseMs: 1000, log: () => {} }, o);
  if (!o.accessKey) throw new Error('URA_ACCESS_KEY is not set.');
  const archive = o.archive || defaultArchive(o.out), n = RW.WINDOW_QUARTERS;   // the window size is not an option here: refreshes use the standard
  const UA = { 'User-Agent': 'Mozilla/5.0 (KPT market-data fetch)' };
  const get = async (label, url, h) => {
    const r = await o.fetch(url, { headers: Object.assign({}, UA, h) });
    const txt = typeof r.text === 'function' ? await r.text() : JSON.stringify(await r.json());
    try { return JSON.parse(txt); } catch (e) { throw new Error(label + ': URA did not return JSON (HTTP ' + r.status + ').'); }
  };
  const tk = await get('Token request', BASE + 'insertNewToken/v1', { AccessKey: o.accessKey });
  if (tk.Status !== 'Success') throw new Error('Token request failed: ' + (tk.Message || tk.Status));
  const quarter = async (q) => {
    const j = await get('Rental ' + q, BASE + 'invokeUraDS/v1?service=PMI_Resi_Rental&refPeriod=' + q, { AccessKey: o.accessKey, Token: tk.Result });
    if (j.Status !== 'Success') throw new Error('Rental ' + q + ' failed: ' + (j.Message || j.Status));
    if (o.pauseMs) await new Promise((ok) => setTimeout(ok, o.pauseMs));
    return j;
  };
  const contracts = (j) => (j.Result || []).reduce((s, p) => s + (p.rental || []).length, 0), file = (q) => path.join(o.out, 'rental-' + q + '.json');
  let last = o.last || RW.lastCompleted(o.now || new Date()), lastJson = await quarter(last);
  if (!contracts(lastJson)) { o.log(last + ': nothing published yet; the window ends a quarter earlier'); const m = /^(\d{2})q([1-4])$/.exec(last); last = RW.label(RW.index(Number(m[1]), Number(m[2])) - 1); lastJson = null; }
  const want = RW.quartersEnding(last, n), moved = organise(o.out, archive, want), done = [];
  for (let k = want.length - 1; k >= 0; k--) {
    const q = want[k], fresh = k >= want.length - o.refresh;
    if (fs.existsSync(file(q)) && !fresh) continue;
    const j = k === want.length - 1 && lastJson ? lastJson : await quarter(q), c = contracts(j);
    if (!c) { o.log(q + ': URA returned no contracts (outside its 5-year service?)'); continue; }
    fs.writeFileSync(file(q), JSON.stringify(j)); done.push({ quarter: q, contracts: c, refreshed: fresh });
    o.log(q + ': ' + c + ' contracts' + (fresh ? ' (recent quarters are fetched again each refresh)' : ''));
  }
  const after = organise(o.out, archive, want);
  return { fetched: done, restored: moved.restored, archived: moved.archived.concat(after.archived), archive, window: RW.select(fs.readdirSync(o.out), n) };
}
module.exports = { fetchWindow, organise, windowFromFiles, defaultArchive };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  const out = arg('out'), archive = arg('archive') || (out && defaultArchive(out));
  if (!out) { console.error('Usage: URA_ACCESS_KEY=xxxx node tools/market-data/fetch-ura-rental.js --out <private URA folder> [--archive <folder>] [--refresh 2] [--last yyqq] | --organise-only'); process.exit(2); }
  const say = (W, r) => console.log('URA folder now holds ' + W.quarters.length + ' of ' + W.wanted + ' quarters (' + W.from + '–' + W.to + ')' + (W.complete ? '' : '; MISSING ' + W.missing.join(', ')) + '. Archive ' + archive + (r.archived.length ? ': moved ' + r.archived.join(', ') + ' there' : '') + (r.restored.length ? '; brought back ' + r.restored.join(', ') : '') + '.');
  if (process.argv.indexOf('--organise-only') > -1) {
    const r = organise(out, archive, windowFromFiles(out, archive)); say(RW.select(fs.readdirSync(out), RW.WINDOW_QUARTERS), r);
  } else {
    fetchWindow({ fetch: globalThis.fetch, accessKey: process.env.URA_ACCESS_KEY, out, archive, refresh: Number(arg('refresh', 2)), last: arg('last'), log: (s) => console.log(s) })
      .then((r) => say(r.window, r)).catch((e) => { console.error(e.message); process.exit(1); });
  }
}
