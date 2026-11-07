/* PRISM V1.1: later approved data-only deltas, taken off, so the tests of earlier releases keep checking exactly what was approved then.
     const SITE = require('./prism-delta-view.js')(path.resolve(__dirname, '../..'));
   Returns the site folder itself when no later delta is on it. Otherwise returns a folder in the OS temp dir that mirrors the site file for
   file (links for everything unchanged) with the delta taken off: its reports lose the yield block (and the URA rental source the delta
   added), and the shards, manifest, index, transit data, the gw-prism.js / gw-transit.js constants and the page's script versions go back.
   The undo is exact: prism-y2-tests.js proves it gives the previous live release byte for byte.
   Deltas handled: Y2 (research/tests/fixtures/prism-y2-delta.json, written by the Y2 build). */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex'), j1 = (o) => JSON.stringify(o, null, 1) + '\n';
const D = 'data/prism/v1.1/';

function undoY2(site, F) {
  const rd = (p) => fs.readFileSync(path.join(site, p), 'utf8'), out = {};
  const ix = JSON.parse(rd(D + 'index.json')), shards = {}, repSha = {};
  ix.shards.forEach((s) => { shards[s.key] = JSON.parse(rd(D + 'index/' + s.key + '.json')); });
  Object.keys(F.reports).forEach((id) => { const p = D + 'reports/' + id + '.json', r = JSON.parse(rd(p));
    r.rentalYield = null; if (F.reports[id].addedUraRental) r.sources = r.sources.filter((s) => s.id !== 'URA_RENTAL');
    const t = j1(r); out[p] = t; repSha[id] = sha(t);
    const e = shards[sha(id).charAt(0)].entries.find((q) => q.id === id); e.sha256 = repSha[id]; e.items -= F.reports[id].bands; });
  const changed = [...new Set(Object.keys(F.reports).map((id) => sha(id).charAt(0)))], shSha = {};
  changed.forEach((k) => { const t = j1(shards[k]); out[D + 'index/' + k + '.json'] = t; shSha[k] = sha(t); });
  const m = JSON.parse(rd(D + 'manifest.json'));
  m.files.forEach((f) => { const r = /^reports\/(.+)\.json$/.exec(f.path), k = /^index\/(.)\.json$/.exec(f.path);
    if (r && repSha[r[1]]) f.sha256 = repSha[r[1]]; if (k && shSha[k[1]]) f.sha256 = shSha[k[1]]; });
  m.counts.items -= F.bands; m.approvalChain = m.approvalChain.filter((x) => x !== F.ref);
  m.releaseId = F.pre.release; m.generatedAt = F.pre.generatedAt; m.deltaApproval = F.pre.deltaApproval; m.previous = F.pre.previous;
  const mt = j1(m); out[D + 'manifest.json'] = mt;
  ix.releaseId = F.pre.release; ix.approvalChain = ix.approvalChain.filter((x) => x !== F.ref); ix.manifestSha256 = sha(mt);
  changed.forEach((k) => { ix.shards.find((s) => s.key === k).sha256 = shSha[k]; });
  const it = j1(ix); out[D + 'index.json'] = it;
  let g = rd('assets/js/gw-prism.js');
  // X1 (decision X1 under the Y2 approval): one exact display-only hunk. It must appear exactly once; it is put back before every other check,
  // so the byte-for-byte comparison with the live file still rejects any other change to gw-prism.js.
  if (F.x1) { if (g.split(F.x1.post).length !== 2) throw new Error('prism-delta-view: the approved X1 hunk is missing, altered or repeated'); g = g.replace(F.x1.post, F.x1.pre); }
  g = g.replace(F.chainLink.post, F.chainLink.pre).replace(/RELEASE: '[^']+',/, "RELEASE: '" + F.pre.release + "',")
    .replace(/INDEX: '[0-9a-f]{64}'/, "INDEX: '" + sha(it) + "'").replace(/MANIFEST: '[0-9a-f]{64}'/, "MANIFEST: '" + sha(mt) + "'");
  out['assets/js/gw-prism.js'] = g;
  // transit: provenance back to the previous release; its index pin follows
  const tix = JSON.parse(rd('data/transport/v1/index.json'));
  tix.files.forEach((f) => { const o = JSON.parse(rd('data/transport/v1/' + f.path)); o.derivedFrom.prismRelease = F.pre.release; const t = j1(o); out['data/transport/v1/' + f.path] = t; f.sha256 = sha(t); });
  tix.prismRelease = F.pre.release; const tt = j1(tix); out['data/transport/v1/index.json'] = tt;
  const gt = rd('assets/js/gw-transit.js').replace(/INDEX: '[0-9a-f]{64}' \};/, "INDEX: '" + sha(tt) + "' };"); out['assets/js/gw-transit.js'] = gt;
  out['research/index.html'] = rd('research/index.html').replace(/gw-prism\.js\?v=[0-9a-f]{10}/, 'gw-prism.js?v=' + sha(g).slice(0, 10)).replace(/gw-transit\.js\?v=[0-9a-f]{10}/, 'gw-transit.js?v=' + sha(gt).slice(0, 10));
  return out;
}

function mirror(site, files) {
  const view = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-pre-y2-')), rels = Object.keys(files);
  const walk = (rel) => fs.readdirSync(path.join(site, rel)).forEach((name) => { const r = rel ? rel + '/' + name : name, to = path.join(view, r);
    if (files[r] !== undefined) fs.writeFileSync(to, files[r]);
    else if (rels.some((x) => x.startsWith(r + '/'))) { fs.mkdirSync(to); walk(r); }
    else fs.symlinkSync(path.join(site, r), to); });
  walk(''); process.on('exit', () => { try { fs.rmSync(view, { recursive: true, force: true }); } catch (x) { /* temp folder */ } });
  return view;
}

function view(site, opts) {
  const fx = path.join(site, 'research/tests/fixtures/prism-y2-delta.json');
  if (!fs.existsSync(fx)) return site;
  const F = JSON.parse(fs.readFileSync(fx, 'utf8')), man = JSON.parse(fs.readFileSync(path.join(site, D, 'manifest.json'), 'utf8'));
  if (man.approvalChain.indexOf(F.ref) < 0) return site;
  if (man.deltaApproval !== F.ref) throw new Error('prism-delta-view: a delta after Y2 is not handled yet: ' + man.deltaApproval);
  const files = undoY2(site, F);
  return opts && opts.filesOnly ? files : mirror(site, files);
}
module.exports = view; module.exports.undoY2 = undoY2;
