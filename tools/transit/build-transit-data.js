#!/usr/bin/env node
/* Groundwork transit data: MRT today and future MRT for one development, taken ONLY from its approved PRISM V1.1 lines.
   (Claude C, 6 Nov 2026, for Claude B's later integration. Data only: no website code.)
     node build-transit-data.js --site <Groundwork folder> --id <development id> [--out <folder>] [--dry]
   Reads the live, pinned PRISM V1.1 report: "MRT today" (infrastructure.mrt) and "Future transport" (infrastructure.futureTransport).
   Both must be approved and available, and the future line must be in the approved Phase 1 form (stations from the pinned register
   FT.STATIONS in assets/js/gw-prism.js, under construction, LTA target). Nothing is re-measured, added or reworded: names, distances,
   lines, codes, statuses, LTA targets, the basis sentences, the note and the source records are copied from approved data.
   Never a rank, comparison, price or appreciation wording. Refuses (exit 1) when anything is not approved or not in that form. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : null; };
const site = arg('site'), id = arg('id'), out = arg('out'), dry = process.argv.indexOf('--dry') > -1;
const die = (m) => { const e = new Error(m); e.refused = true; throw e; };
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const j1 = (o) => JSON.stringify(o, null, 1) + '\n';

function build(site, id) {
  const rd = (p) => fs.readFileSync(path.join(site, p), 'utf8');
  const G = require(path.resolve(site, 'assets/js/gw-prism.js'));
  const ixt = rd('data/prism/v1.1/index.json'), ix = JSON.parse(ixt);
  if (sha(ixt) !== G.V11.INDEX || ix.releaseId !== G.V11.RELEASE) die('the PRISM V1.1 index is not the pinned live one');
  const sh = JSON.parse(rd('data/prism/v1.1/index/' + sha(id).charAt(0) + '.json')), e = sh.entries.find((x) => x.id === id);
  if (!e || !e.path) die(id + ': no PRISM V1.1 report');
  const rt = rd('data/prism/v1.1/' + e.path); if (sha(rt) !== e.sha256) die(id + ': the report does not match its pinned sha256');
  const r = JSON.parse(rt);
  if (!G.checkReport11(r, e, r.supplementsV1Report === null)) die(id + ': the report fails the page\'s own checks');
  const L = (m) => (r.profile.lines || []).find((l) => l.measure === m);
  const now = L('infrastructure.mrt'), fut = L('infrastructure.futureTransport');
  if (!now || now.status !== 'available' || now.approval.state !== 'approved' || G.V11.CHAIN.indexOf(now.approval.approvalRef) < 0) die(id + ': MRT today is not an approved, available line');
  if (!fut || fut.status !== 'available' || fut.approval.state !== 'approved') die(id + ': Future transport is not an approved, available line');
  if (!G.futureOk(fut, r)) die(id + ': Future transport is not in the approved Phase 1 form');
  // the approved statements end with their basis sentence; the station part is not reworded or reused
  const nowBasis = / Straight-line distances\.$/.test(now.statement) ? 'Straight-line distances.' : die(id + ': MRT today basis');
  const futBasis = (fut.statement.match(/ (Straight-line distances? to the planned station sites?; entrances are not yet published\.)$/) || [])[1] || die(id + ': future basis');
  const inService = now.data.stations.map((s) => {
    if (Object.keys(s).join('|') !== 'name|type|distanceM' || !/ (MRT|LRT)$/.test(s.name) || !Number.isInteger(s.distanceM)) die(id + ': MRT today station form');
    return { name: s.name, type: s.type, status: 'operational', distanceM: s.distanceM, measuredTo: 'station_exit', sourceIds: now.sourceIds.slice() };
  });
  const upcoming = fut.data.stations.map((s) => ({ name: s.name, type: 'MRT', status: s.status, line: s.line, code: s.code, ltaTarget: s.target, distanceM: s.distanceM, measuredTo: s.measuredTo, stationKey: s.stationKey, sourceIds: fut.sourceIds.slice() }));
  const clash = upcoming.filter((u) => inService.some((s) => s.name === u.name)); if (clash.length) die(id + ': a station is both in service and upcoming: ' + clash.map((x) => x.name));
  const used = [...new Set(now.sourceIds.concat(fut.sourceIds))];
  const sources = used.map((s) => r.sources.find((x) => x.id === s) || die(id + ': source record ' + s + ' missing'));
  const o = {
    schema: 'gw-transit-v1',
    id, name: r.name || die(id + ': name'),
    about: 'Built only from approved PRISM data; nothing re-measured or reworded. Not a forecast; no price or value wording. Not for display.',
    inService: { label: now.label, basis: nowBasis, stations: inService },
    upcoming: { label: fut.label, basis: futBasis, note: G.FT.NOTE, stations: upcoming },
    sources,
    derivedFrom: { prismRelease: ix.releaseId, report: 'data/prism/v1.1/' + e.path, reportSha256: e.sha256,
      items: [now, fut].map((l) => ({ itemId: l.itemId, approvalRef: l.approval.approvalRef, recordItem: l.approval.recordItem })),
      futureRegister: fut.data.register }
  };
  return o;
}
module.exports = { build };

if (require.main === module) {
  if (!site || !id) { console.error('usage: --site <folder> --id <id> [--out <folder>] [--dry]'); process.exit(2); }
  try {
    const o = build(site, id), t = j1(o);
    if (!dry) { const d = out || path.join(site, 'data/transport/v1'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, id + '.json'), t); }
    console.log(id + ': ' + o.inService.stations.length + ' in service, ' + o.upcoming.stations.length + ' upcoming; sha256 ' + sha(t));
  } catch (e) { console.error('REFUSED: ' + e.message); process.exit(1); }
}
