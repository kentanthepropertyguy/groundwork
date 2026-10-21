#!/usr/bin/env node
/* ==========================================================================
   Build-time "Compare with…" suggestions for the Research page: for each development with enough recent evidence, the developments whose comparison would
   rest on the strongest shared evidence. Same engine and same evidence rules as the page (kpt-research.js, kpt-evidence.js), over the public project data only.
   Candidates are in the SAME DISTRICT and the SAME CLASS (condo with condo, EC with EC, cluster with cluster): prices of different classes are never compared.
   Output: data/research/suggest.json  { v, rule, asOf, pairsChecked, p: { id: [[id, name, 's'|'l', nA, nB, band label], ...] } }

   Usage: node tools/market-data/build-suggest.js [--projects data/projects] [--out data/research/suggest.json] [--cap 5]
   ========================================================================== */
const fs = require('fs'), path = require('path');

function build(projectDir, o) {
  o = o || {};
  const J = path.join(__dirname, '..', '..', 'assets', 'js');
  const P = require(path.join(J, 'kpt-project.js')), R = require(path.join(J, 'kpt-research.js')), E = require(path.join(J, 'kpt-evidence.js'));
  const m = JSON.parse(fs.readFileSync(path.join(projectDir, 'manifest.json'), 'utf8')), ix = JSON.parse(fs.readFileSync(path.join(projectDir, 'index.json'), 'utf8'));
  const F = P.fieldMap(ix.fields), shards = {};
  const proj = (id, row) => { const n = P.shardName(row[F.shard]); if (!shards[n]) shards[n] = JSON.parse(fs.readFileSync(path.join(projectDir, 'detail', n + '.json'), 'utf8')); return shards[n].projects[id]; };
  const clsOf = (r) => (F.cls !== undefined && r[F.cls]) || 'condo';
  const rows = ix.rows, byDC = {}; rows.forEach((r) => { const k = clsOf(r) + '|' + r[F.district]; (byDC[k] = byDC[k] || []).push(r); });
  const P_ = {}, exp = {};
  rows.forEach((r) => { const p = proj(r[F.id], r); P_[r[F.id]] = p; exp[r[F.id]] = E.projectExperience(p, m).experience; });
  const out = {}, cap = o.cap || 5; let pairs = 0;
  rows.forEach((r) => {
    const a = r[F.id]; if (exp[a] !== 'analysis') return;
    const cand = [];
    (byDC[clsOf(r) + '|' + r[F.district]] || []).forEach((q) => {
      const b = q[F.id]; if (b === a || exp[b] === 'directory') return;
      pairs++;
      const base0 = R.analyseComparison(P_[a], P_[b], m, {});
      if (!base0.sale || !base0.sale.selected) return;
      const an = (i) => R.analyseComparison(P_[a], P_[b], m, { sale: base0.sale.selected, window: i });
      const dw = E.defaultWindow(an, m.windows.length); if (!dw) return;
      const ev = dw.state; if (ev.state === 'insufficient' || !ev.band) return;
      cand.push({ id: b, name: R.displayName(q[F.name]), s: ev.state === 'stronger' ? 's' : 'l', a: ev.band.a.n, b: ev.band.b.n, label: ev.band.label });
    });
    cand.sort((x, y) => (y.s === 's') - (x.s === 's') || Math.min(y.a, y.b) - Math.min(x.a, x.b) || (y.a + y.b) - (x.a + x.b) || (x.name < y.name ? -1 : 1));
    if (cand.length) out[a] = cand.slice(0, cap).map((c) => [c.id, c.name, c.s, c.a, c.b, c.label]);
  });
  return { v: 1, rule: E.CONFIG.version, asOf: m.latestMonth, pairsChecked: pairs, p: out };
}
module.exports = { build };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  const root = path.join(__dirname, '..', '..'), pd = arg('projects', path.join(root, 'data/projects')), outFile = arg('out', path.join(root, 'data/research/suggest.json'));
  const res = build(pd, { cap: +arg('cap', 5) });
  fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, JSON.stringify(res));
  console.log('suggestions for ' + Object.keys(res.p).length + ' developments; ' + res.pairsChecked + ' pairs checked -> ' + outFile);
}
