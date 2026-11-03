/* ==========================================================================
   GROUNDWORK — PRISM V1 (31 Oct 2026). "PRISM by Groundwork" inside Research.
   Reads ONLY the approved public export in data/prism/v1/ (manifest.json + reports/<id>.json, schema prism-public-v1),
   checks it before showing anything, and draws:
     - a preview card on a development's Research page, and
     - the PRISM investigation at research/#/prism/<id>: one conclusion with its numbers, Why, Watch out, then the full
       five layers on request,
   Research arrangement (Ken, 31 Oct 2026, final): Research keeps its two choices and ONE search. Inside "Research a property", a development
   with an approved PRISM assessment has two views, PRISM Analysis (#/prism/<id>) and Property Data (#/p/<id>, the existing report), with a
   switch between them; Research's own search leads with PRISM for it; every other link (global search, Map, Budget Search, shared #/p/ links)
   opens Property Data as before. The landing explains the five dimensions (landingHtml). Applies
   ONLY to a development whose report has an approved Reveal AND Verdict. A report
   with approved supporting measures but no approved assessment gets no public PRISM entry or page.
   Fails closed: a manifest that is not "approved", a report whose sha256 differs from the manifest, an unknown schema or a
   report that is not an approved release shows NO PRISM at all. It writes no finding of its own: every sentence of
   assessment is approved copy from the report; numbers are the approved metric values, formatted.
   Never shown: score100 (no validated scoring method), Ken's Take (not yet approved), unapproved metrics or copy, and the
   supply measures S3/S4 unless the release itself allows them (allowPublicS3/S4).
   V1.1 r2 (GW-PRISM-V1.1-2026-11-03-A2, after A1 and the decile amendment; Master Planning, 3 Nov 2026): data/prism/v1.1/ (schema
   prism-public-v1.1-r2) adds, inside the existing five dimension rows, the approved peer positions (Price position, Resale activity: band,
   exact period, peer counts, statement), the five-dimension evidence profile (each line's approved statement with its status: available,
   partial, settling, not available, not yet assessed), gross rental yield by size band and planning-area household income. Market is
   observational only: no rank, decile or label. A report entry that supplements V1 is read only when it pairs with the very V1 report on
   screen (by sha256); a V1.1-only entry (listed in the manifest's v11OnlyReports) or a V1 report without an approved Reveal + Verdict gets
   an evidence-profile page (the same page, without a verdict) only when its approved r2 report has profile lines. Read only when the
   manifest is the approved one (sha256 pinned below), each report's sha256 matches, every item carries the A2 approval, and the manifest's
   item counts equal the approved items found; otherwise the page is exactly V1 (and a development without an approved V1 assessment
   shows nothing). Never shown: a composite score, purchasing-power or affordability wording, a Market rank, unsold inventory (S3),
   pipeline counts (S4; known sites only), future transport without official LTA evidence.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GW_PRISM = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VERSION = 'prism-v1.1-r2-web-1';
  const SCHEMA = 'prism-public-v1';
  const DIR = 'data/prism/v1/';
  const MANIFEST_V = '831114f97c';
  // first 10 hex of manifest.json's sha256 (MANIFEST_V): a new release changes the address, so caches never mix releases
  // The nationwide release (GW-PRISM-V1.1-2026-11-03-NATIONWIDE-1, D5): index.json is the root, pinned by sha256; it pins 16 shards
  // (index/<k>.json, k = first hex digit of sha256(report id)), each pins its reports. The page loads the root, the one shard a development
  // needs and that development's report, nothing else (manifest.json is the release's integrity record; pages never load it). The V1 pairing
  // and the data periods are the approved release's own values (manifest.json supplements and dataPeriodsBySource), pinned here and checked
  // against it by the tests.
  // r3 (GW-PRISM-R3-SCHEMA-20261103-01, Registry v2): the same reports, re-issued; the root lists every Registry v2 id (2,509) with its
  // state, and each item carries its own approval reference, which must be one of CHAIN (no single release-wide approval any more)
  const V11 = { SCHEMA: 'prism-public-v1.1-r3', INDEX_SCHEMA: 'prism-public-v1.1-r3-index', SHARD_SCHEMA: 'prism-public-v1.1-r3-shard', DIR: 'data/prism/v1.1/',
    CHAIN: ['GW-PRISM-V1.1-2026-11-01-A1', 'GW-PRISM-V1.1-2026-11-03-DECILE', 'GW-PRISM-V1.1-2026-11-03-A2', 'GW-PRISM-V1.1-2026-11-03-NATIONWIDE-1'],
    RELEASE: 'prism-v1.1-r3-release-2026-11-03-a8b865345a70',
    INDEX: 'fbf04c39c8e61f50e1a9a45db2d4e99270caae9b6763b0dba526668a475552d2',      // index.json, byte for byte: any other is not read
    MANIFEST: '37fea25c57706a3a1d4b7deb873c8ab284318e7acc7df2ae5d5432abae3fec61',   // manifest.json, bound by the root (manifestSha256)
    STATES: ['full', 'partial', 'pending', 'unavailable', 'new_launch', 'redirect'], PAGE_STATES: ['full', 'partial'],
    SHARDS: '0123456789abcdef',
    V1PAIR: { release: 'prism-v1-release-2026-10-30-10911d7e2c92', approvalRef: 'GW-PRISM-V1-2026-10-31-A1',
      sha256: ['2d7266d31571169f2281a8aad3b31acb682de0229a6fd106cf47d2ff54ca1144', '330f8e9f874bbf0e9e282b75d9e94b19a5e8d723be1f3ccb20faabfa306fc78f', '56b6139e0f013ac17bf92ac18183e290cc46fdb617e7906dc2513ff14e948ce1'] },
    PERIODS: { URA_TRANSACTIONS: '2026-09', URA_RENTAL: '2026-09', URA_DWELLING_UNITS: 'URA states Q4 2022; file updated 2026-02-26', URA_MP2019: 'Master Plan 2019', GW_BEDROOM: '2026-09',
      SINGSTAT_GHS2025: 'GHS 2025', LTA_RAIL_EXITS: 'accessed 2026-10-20', MOE_SCHOOLS: 'accessed 2026-10-20', NEA_SUPERMARKETS: 'accessed 2026-10-20', NEA_HAWKERS: 'accessed 2026-10-20',
      NPARKS_PARKS: 'accessed 2026-10-20', ONEMAP: 'accessed 2026-10-20', GW_UPCOMING: '2026-10-21' },
    MIN_HOMES_ABOVE: 50 };   // D4: the "above most peers" Reveal needs 50 or more homes (the Resale position's sample.homes)
  const PANELS = { P: ['price.entry'], R: ['resale.sustained'], I: ['infrastructure.mrt', 'infrastructure.schools', 'infrastructure.amenities', 'infrastructure.futureTransport'],
    S: ['supply.competition', 'supply.unsoldInventory', 'supply.pipeline', 'supply.quietArea'], M: ['market.backdrop'] };
  const STATUS = ['available', 'partial', 'settling', 'not_available', 'not_yet_assessed'];
  const CLS = { condo: 'condo', ec: 'EC' }, CLASS_NAME = { condo: 'Condominium', ec: 'Executive condominium' };
  const PILLARS = [['P', 'Price Position'], ['R', 'Resale Potential'], ['I', 'Infrastructure & Catalysts'], ['S', 'Supply Pressure'], ['M', 'Market Demand']];
  const SUPPLY_GATE = { 'S.launchedUnsold2km': 'allowPublicS3', 'S.pipeline2km': 'allowPublicS4' };
  const SCOPE = { observed_resale_activity: 'Observed resale activity · project-wide', observed_neighbourhood_market: 'Surrounding resale market' };
  const KIND = { 'completed-condo': 'Condominium', 'awarded-site': 'Awarded site' };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const SOURCE_NAME = { URA_TRANSACTIONS: 'URA transactions', URA_RENTAL: 'URA rental contracts', URA_DEV_SALES: 'URA developer sales', URA_PIPELINE: 'URA pipeline', URA_DWELLING_UNITS: 'URA dwelling units', URA_SALE_SITES: 'URA Sale Sites', URA_MP2019: 'URA Master Plan 2019 subzones', SINGSTAT_GHS2025: 'SingStat General Household Survey 2025', HDB_PROPERTY: 'HDB property information', HDB_RESALE: 'HDB resale prices', SINGSTAT_RESIDENTS: 'SingStat residents', LTA_RAIL_EXITS: 'LTA station exits', MOE_SCHOOLS: 'MOE schools', NEA_SUPERMARKETS: 'NEA supermarkets', NEA_HAWKERS: 'NEA hawker centres', NPARKS_PARKS: 'NParks parks', ONEMAP: 'OneMap', GW_BEDROOM: 'Groundwork bedroom classification', GW_UPCOMING: 'Groundwork named sites', AMENITIES: 'Amenities (LTA, MOE, NEA, NParks, OneMap)' };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const num = (v, dp) => (isNum(v) ? v.toLocaleString('en-SG', { minimumFractionDigits: dp || 0, maximumFractionDigits: dp == null ? 1 : dp }) : '');
  const ord = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const plural = (n, one, many) => num(n, 0) + ' ' + (n === 1 ? one : (many || one + 's'));
  const ym = (s) => { const m = /^(\d{4})-(\d{2})$/.exec(String(s || '')); return m ? MON[+m[2] - 1] + ' ' + m[1] : null; };
  const day = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? +m[3] + ' ' + MON[+m[2] - 1] + ' ' + m[1] : null; };
  const metres = (m) => (isNum(m) ? (m >= 1000 ? num(m / 1000, 1).replace(/\.0$/, '') + ' km' : num(m, 0) + ' m') : '');
  const money = (v) => (isNum(v) ? '$' + num(v, 0) : '');
  function period(p) {
    if (!p) return '';
    const a = ym(p.start), b = ym(p.end);
    if (a && b) return a === b ? a : a + '–' + b;
    return b || a || '';
  }

  /* ---------------------------------------------------------------- the publication gate (pure; tested in node) */
  function checkManifest(m) {
    if (!m || m.schemaVersion !== SCHEMA) throw new Error('manifest: unknown schema');
    if (m.status !== 'approved' || typeof m.approvalRef !== 'string' || !m.approvalRef || /^TEST/i.test(m.approvalRef)) throw new Error('manifest: not an approved release');
    if (!Array.isArray(m.reports) || !m.reports.length) throw new Error('manifest: no reports');
    m.reports.forEach((r) => {
      if (!r || !/^[a-z0-9-]{1,80}$/.test(r.id) || r.path !== 'reports/' + r.id + '.json' || !/^[0-9a-f]{64}$/.test(r.sha256 || '') || r.approved !== true) throw new Error('manifest: bad report entry');
    });
    return m;
  }
  function checkReport(r, entry) {
    if (!r || r.schemaVersion !== SCHEMA) throw new Error('report: unknown schema');
    if (!entry || r.reportId !== entry.id || !r.subject || r.subject.id !== entry.id) throw new Error('report: id does not match the manifest');
    if (!r.release || r.release.status !== 'approved' || !Array.isArray(r.release.approvedMetrics)) throw new Error('report: not an approved release');
    if (!r.provenance || !r.provenance.approvalRef || /^TEST/i.test(r.provenance.approvalRef)) throw new Error('report: no approval reference');
    if (!r.pillars || typeof r.pillars !== 'object') throw new Error('report: no pillars');
    return r;
  }
  const approved = (x) => !!(x && x.status === 'approved' && x.approval && x.approval.state === 'approved');
  function shown(m, r) {
    if (!m || !m.approval || m.approval.state !== 'approved') return false;
    if (m.status !== 'verified' && m.status !== 'estimated') return false;
    if (m.value === null || m.value === undefined) return false;
    if (r.release.approvedMetrics.indexOf(m.id) < 0) return false;
    if (SUPPLY_GATE[m.id] && r.release[SUPPLY_GATE[m.id]] !== true) return false;   // S3/S4 stay withheld unless the release itself allows them
    return true;
  }

  /* ---------------------------------------------------------------- the view model: only what may be shown */
  function model(r, man) {
    const srcOf = {}; Object.keys(r.pillars).forEach((k) => (Array.isArray(r.pillars[k]) ? r.pillars[k] : []).forEach((m) => { if (m && m.id) srcOf[m.id] = m.sourceIds || []; }));
    const all = {}, pillars = PILLARS.map(([k, name]) => {
      const ms = Array.isArray(r.pillars[k]) ? r.pillars[k] : [];
      const on = ms.filter((m) => shown(m, r)), off = ms.filter((m) => !shown(m, r)).map((m) => m.label).filter(Boolean);
      on.forEach((m) => { all[m.id] = m; });
      return { key: k, name, metrics: on, unpublished: off };
    });
    const assess = approved(r.reveal) && approved(r.verdict) && !!r.reveal.headline && !!r.verdict.headline;
    const text = (a) => (Array.isArray(a) ? a.map((x) => x && x.text).filter((t) => typeof t === 'string' && t) : []);
    const s = r.subject;
    return {
      id: r.reportId, name: s.name, subject: s,
      meta: [s.district ? 'District ' + Number(s.district) : null, s.planningArea || null, KIND[s.kind] || null].filter(Boolean),
      assessment: assess ? {
        reveal: { headline: r.reveal.headline, caveat: r.reveal.caveat || '', uses: r.reveal.uses || [] },
        verdict: { headline: r.verdict.headline, scope: SCOPE[r.verdict.scope] || '', why: text(r.verdict.why), watchOut: text(r.verdict.watchOut), whyUses: (r.verdict.why || []).map((x) => (x.uses || [])[0]) }
      } : null,
      // An approved item that links measures from DIFFERENT datasets is a hidden connection; one resting on a single dataset is supporting
      // context (Ken, 31 Oct 2026). The item, its id and its wording are unchanged; only the heading it sits under follows this rule.
      hidden: (r.hiddenConnections || []).filter(approved).map((h) => {
        const kinds = new Set((h.uses || []).map((u) => (srcOf[u] || []).slice().sort().join('+')).filter(Boolean));
        return { id: h.id, text: h.text, caveat: h.caveat || '', tag: h.evidenceTag, kind: kinds.size >= 2 ? 'connection' : 'context' };
      }),
      question: approved(r.nextBuyerQuestion) && r.nextBuyerQuestion.text ? r.nextBuyerQuestion.text : null,
      pillars, metrics: all,
      count: Object.keys(all).length,
      sources: (r.sources || []).map((x) => ({ id: x.id, publisher: x.publisher, dataset: x.dataset, asAt: x.asAt, updated: x.updated, licence: x.licence ? { name: x.licence.name, url: x.licence.url } : null, attribution: x.attribution, url: x.url })),
      // the "no composite score" limit names an internal field (score100); the page states it in plain words ("There is no overall score")
      // two limits describe how the release is assembled (score100; "only approved metrics carry values"), not the evidence: the page says
      // both in plain words; every limit about the evidence itself is shown as written
      limitations: (r.limitations || []).filter((t) => typeof t === 'string' && !/score100/i.test(t) && !/^Only approved metrics/i.test(t)),
      asOf: r.provenance.sourceAsOf, approvedAt: r.provenance.approvedAt,
      periodsBySource: man && man.dataPeriodsBySource && typeof man.dataPeriodsBySource === 'object' ? man.dataPeriodsBySource : {}
      // never carried: score100, kenTake, unapproved copy or values
    };
  }

  /* ---------------------------------------------------------------- the V1.1 release, r3 format (pure; tested in node) */
  // Keys an r2 report may never carry (the release's own forbidden-field list, plus the V1 internal fields); compositeScore: null only
  const FORBID_KEYS = ['purchasingPower', 'grossIncomeForTdsr', 'surveyBasisIncome', 'householdsAtOrAbovePct', 'stressInstalment', 'affordability', 'overall', 'score100', 'score',
    'launchedUnsoldPer100Homes2km', 'pipelinePer100Homes2km', 'newSaleDevelopments2km', 'primarySchools1km', 'supermarkets1km', 'nearestRailM', 'forecast', 'lat', 'lon', 'll', 'notes', 'limitations', 'kenTake'];
  const FORBID = /score100|afford|purchasingPower|kenTake|forecast/i;
  const FORBID_TEXT = /score\s*\/\s*100|\/\s*100\b|purchasing power|affordab|ken.s take/i;   // wording no r2 text may contain
  // the root: the approved release, its chain, the manifest it binds, and 16 shards (one per hex digit) whose counts add up
  const ID = /^[a-z0-9-]{1,80}$/;
  function checkIndex(ix) {
    if (!ix || ix.schemaVersion !== V11.INDEX_SCHEMA || ix.status !== 'approved' || ix.releaseId !== V11.RELEASE) throw new Error('v1.1 index: not the approved release');
    if (!Array.isArray(ix.approvalChain) || ix.approvalChain.join('|') !== V11.CHAIN.join('|')) throw new Error('v1.1 index: not the approved chain');
    if (ix.manifestSha256 !== V11.MANIFEST) throw new Error('v1.1 index: binds another manifest');
    if (!/^[0-9a-f]{64}$/.test(ix.redirectsSha256 || '')) throw new Error('v1.1 index: no redirects pin');
    const c = ix.counts;
    if (!c || !Number.isInteger(c.reports) || !Number.isInteger(c.entries) || !c.states || typeof c.states !== 'object') throw new Error('v1.1 index: no counts');
    if (Object.keys(c.states).some((k) => V11.STATES.indexOf(k) < 0) || Object.keys(c.states).reduce((a, k) => a + c.states[k], 0) !== c.entries ||
      V11.PAGE_STATES.reduce((a, k) => a + (c.states[k] || 0), 0) !== c.reports) throw new Error('v1.1 index: state counts');
    if (!Array.isArray(ix.shards) || ix.shards.map((x) => x && x.key).join('') !== V11.SHARDS) throw new Error('v1.1 index: not the 16 shards');
    ix.shards.forEach((x) => { if (x.path !== 'index/' + x.key + '.json' || !/^[0-9a-f]{64}$/.test(x.sha256 || '') || !(Number.isInteger(x.entries) && x.entries > 0)) throw new Error('v1.1 index: bad shard entry'); });
    if (ix.shards.reduce((a, x) => a + x.entries, 0) !== c.entries) throw new Error('v1.1 index: shard counts');
    return ix;
  }
  // a shard: its own key, exactly the count the root lists, unique ids, each id in the shard its sha256 names (idKey). Every Registry v2 id is
  // listed with its state; only a full or partial entry with a report (path, sha256, item count) can have a page; a redirect names one other id.
  function checkShard(sh, entry, idKey) {
    if (!sh || sh.schemaVersion !== V11.SHARD_SCHEMA || sh.key !== entry.key || !Array.isArray(sh.entries) || sh.entries.length !== entry.entries) throw new Error('v1.1 shard: not the approved shard');
    const seen = {};
    sh.entries.forEach((r) => {
      if (!r || !ID.test(r.id) || V11.STATES.indexOf(r.state) < 0 || typeof r.name !== 'string' || !r.name || seen[r.id]) throw new Error('v1.1 shard: bad entry');
      if (V11.PAGE_STATES.indexOf(r.state) >= 0 && (r.path !== 'reports/' + r.id + '.json' || !/^[0-9a-f]{64}$/.test(r.sha256 || '') || !(Number.isInteger(r.items) && r.items > 0) || V11.CHAIN.indexOf(r.approvalRef) < 0)) throw new Error('v1.1 shard: bad report entry');
      if (V11.PAGE_STATES.indexOf(r.state) < 0 && (r.path != null || r.sha256 != null)) throw new Error('v1.1 shard: a report for an entry without a page');
      if (r.state === 'redirect' && (!ID.test(r.to || '') || r.to === r.id)) throw new Error('v1.1 shard: bad redirect');
      seen[r.id] = 1;
    });
    if (idKey) sh.entries.forEach((r) => { if (idKey(r.id) !== entry.key) throw new Error('v1.1 shard: an id in the wrong shard'); });
    return sh;
  }
  const hasReport = (f) => !!(f && V11.PAGE_STATES.indexOf(f.state) >= 0 && f.path);
  // curated: the reports approved before the nationwide batch carry "approved-existing" (r2: profile "approved")
  const isCurated = (f) => !!(f && Array.isArray(f.reasons) && f.reasons.indexOf('approved-existing') >= 0);
  // the V1 pairing: a V1.1 report that supplements a V1 report must pair with that exact approved V1 report (release and sha256)
  function checkPair(v1, e1) {
    if (!v1 || v1.datasetReleaseId !== V11.V1PAIR.release || v1.approvalRef !== V11.V1PAIR.approvalRef || !e1 || V11.V1PAIR.sha256.indexOf(e1.sha256) < 0) throw new Error('v1.1: pairs with a different V1 report');
    return true;
  }
  function keysOk(o, path) {
    if (!o || typeof o !== 'object') return;
    Object.keys(o).forEach((k) => {
      if ((FORBID.test(k) || FORBID_KEYS.indexOf(k) >= 0) && !(k === 'compositeScore' && o[k] === null)) throw new Error('v1.1 report: forbidden field ' + path + k);
      if (typeof o[k] === 'string' && FORBID_TEXT.test(o[k])) throw new Error('v1.1 report: forbidden wording at ' + path + k);
      keysOk(o[k], path + k + '.');
    });
  }
  const ok11 = (x) => !!(x && x.approval && x.approval.state === 'approved' && V11.CHAIN.indexOf(x.approval.approvalRef) >= 0);
  // every item in a report (anything carrying an approval): its id within the report, approved under a reference in CHAIN. One item that is
  // not (pending, another reference, a foreign id) rejects the whole report.
  function itemsOk(r) {
    const walk = (o) => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if ('approval' in o && (!ok11(o) || typeof o.itemId !== 'string' || o.itemId.indexOf(r.reportId + '/') !== 0)) throw new Error('v1.1 report: an item that is not approved');
      Object.keys(o).forEach((k) => walk(o[k]));
    };
    walk(r);
  }
  // only=true: a V1.1-only entry (supplementsV1Report: null). The safeguards are checked on the data itself, so a changed file cannot show them.
  function checkReport11(r, entry, only) {
    if (!r || r.schemaVersion !== V11.SCHEMA || r.reportId !== entry.id || typeof r.name !== 'string' || !r.name) throw new Error('v1.1 report: id or schema');
    if (r.supplementsV1Report !== (only ? null : entry.id)) throw new Error('v1.1 report: supplements the wrong report');
    if (r.compositeScore !== null) throw new Error('v1.1 report: a composite score');
    itemsOk(r);
    keysOk(r, '');
    const pos = r.peerComparison && Array.isArray(r.peerComparison.positions) ? r.peerComparison.positions : [];
    pos.forEach((x) => { if (['P', 'R'].indexOf(x.dimension) < 0) throw new Error('v1.1 report: a ' + x.dimension + ' position (Market ranks are withdrawn)'); });
    const lines = r.profile && Array.isArray(r.profile.lines) ? r.profile.lines : [];
    lines.forEach((l) => {
      if (!l || !PANELS[l.panel] || PANELS[l.panel].indexOf(l.measure) < 0 || STATUS.indexOf(l.status) < 0 || typeof l.statement !== 'string' || !l.statement) throw new Error('v1.1 report: a line outside the profile');
      if (l.measure === 'supply.unsoldInventory' && (l.status !== 'not_available' || l.data !== null)) throw new Error('v1.1 report: unsold inventory');
      if (l.measure === 'infrastructure.futureTransport' && (l.status !== 'not_yet_assessed' || l.data !== null)) throw new Error('v1.1 report: future transport');
      if (l.measure === 'market.backdrop' && l.data && ['rank', 'decile', 'percentile', 'band', 'bandLabel'].some((k) => k in l.data)) throw new Error('v1.1 report: a Market rank');
      if (l.status === 'settling' && l.data && l.data.value !== null) throw new Error('v1.1 report: a settling value');
      if ((l.status === 'not_available' || l.status === 'not_yet_assessed') && l.data !== null) throw new Error('v1.1 report: a value for a missing measure');
    });
    if (r.householdIncome && r.householdIncome.planningArea && !r.householdIncome.context) throw new Error('v1.1 report: income without its context');
    return r;
  }
  // only A2-approved items, as the report states them (no value, label or sentence is written here). The manifest's item count must equal
  // the approved items found: a dropped item means the file is not the approved one, so nothing of it is shown.
  function model11(r, entry) {
    const pc = r.peerComparison, pos = {};
    if (pc && Array.isArray(pc.positions)) pc.positions.filter(ok11).forEach((x) => { if (x.statement && x.bandLabel && x.periodLabel) pos[x.dimension] = x; });
    const ry = r.rentalYield && Array.isArray(r.rentalYield.bands) ? r.rentalYield : null, bands = ry ? ry.bands.filter(ok11).filter((b) => isNum(b.grossYieldPct)) : [];
    const inc = ok11(r.householdIncome) && Array.isArray(r.householdIncome.atOrAbove) ? r.householdIncome : null;
    const pf = r.profile && Array.isArray(r.profile.lines) ? r.profile : null, lines = {}; let nl = 0;
    PILLARS.forEach(([k]) => { lines[k] = pf ? PANELS[k].map((ms) => pf.lines.find((l) => l.panel === k && l.measure === ms)).filter(ok11) : []; nl += lines[k].length; });
    const items = Object.keys(pos).length + bands.length + (inc ? 1 : 0) + nl;
    if (!items || (entry && entry.items !== items)) return null;
    return { id: r.reportId, name: r.name, kind: r.kind, positions: pos, peerGroup: pc ? pc.peerGroup : null,
      yield: bands.length ? { period: ry.period, caption: ry.caption, rules: ry.rules || {}, bands: bands, sourceIds: ry.sourceIds || [] } : null, income: inc,
      profile: nl ? { rule: pf.rule, group: pf.comparisonGroup || null, surrounding: pf.surroundingMarket || '', lines: lines } : null, items: items,
      sources: (r.sources || []).map((x) => ({ id: x.id, publisher: x.publisher, dataset: x.dataset, asAt: x.asAt, updated: x.updated, accessed: x.accessed, licence: x.licence ? { name: x.licence.name, url: x.licence.url } : null, attribution: x.attribution, url: x.url })) };
  }

  /* ---------------------------------------------------------------- formatting an approved value */
  function value(m) {
    const v = m.value, d = m.detail || {};
    switch (m.unit) {
      case 'months': return m.denominator ? num(v, 0) + ' of ' + num(m.denominator, 0) + ' months' : plural(v, 'month');
      case 'rank': return isNum(d.of) ? ord(v) + ' of ' + num(d.of, 0) : ord(v);
      case 'contracts': return plural(v, 'contract');
      case 'transactions': return plural(v, m.id.indexOf('Resales') > -1 || m.id.indexOf('resales') > -1 || /resale/i.test(m.label) ? 'resale' : 'transaction');
      case 'transactions_minimum': return 'At least ' + num(v, 0);
      case 'resales_per_100_homes_per_year': return num(v, 1) + ' per 100 homes a year';
      case 'supermarkets_within_1km': return plural(v, 'supermarket') + ' within 1 km';
      case 'sites': return plural(v, 'site');
      case 'schools': return plural(v, 'school');
      case 'metres': return metres(v);
      case 'developments': return plural(v, 'development');
      case 'homes': return plural(v, 'home');
      case 'flats': return plural(v, 'flat');
      case 'residents': return plural(v, 'resident');
      case 'pct_change': return (v > 0 ? '+' : '') + num(v, 1) + '%';
      case 'pct_vs_peer_median_psf': return v === 0 ? 'At the peer median' : num(Math.abs(v), 1) + '% ' + (v > 0 ? 'above' : 'below') + ' the peer median';
      case 'SGD': return money(v);
      default: return num(v) + (m.unit ? ' ' + String(m.unit).replace(/_/g, ' ') : '');
    }
  }
  // One short line of the approved detail, for the measures that carry one (names and counts only; never coordinates)
  function detail(m) {
    const d = m.detail; if (!d || typeof d !== 'object') return '';
    const L = [];
    switch (m.id) {
      case 'R.peerRank24': if (isNum(d.peerMedian)) L.push('Peer median ' + num(d.peerMedian, 1)); if (Array.isArray(d.middleHalf) && d.middleHalf.length === 2) L.push('middle half ' + num(d.middleHalf[0], 1) + '–' + num(d.middleHalf[1], 1)); if (Array.isArray(d.nearestPeers) && d.nearestPeers.length) L.push('comparable group includes ' + d.nearestPeers.join(', ')); break;
      case 'R.turnover24': if (d.windows) L.push(['m12', 'm36'].filter((k) => isNum(d.windows[k])).map((k) => (k === 'm12' ? '12 months: ' : '36 months: ') + num(d.windows[k], 1)).join(' · ')); break;
      case 'R.resales12': if (isNum(d.prior12)) L.push(num(d.prior12, 0) + ' in the 12 months before'); break;
      case 'R.paEstablishedTurnover12': if (isNum(d.singapore)) L.push('Singapore: ' + num(d.singapore, 1)); if (isNum(d.developments)) L.push(plural(d.developments, 'development') + ' in the planning area'); break;
      case 'R.resaleAlternatives24_2km': if (isNum(d.developments)) L.push(plural(d.developments, 'development') + (d.scope ? ' (' + d.scope + ')' : '')); break;
      case 'R.threeBedResales24_2km_min': if (isNum(d.classifiedDevelopments) && isNum(d.developments)) L.push(num(d.classifiedDevelopments, 0) + ' of ' + num(d.developments, 0) + ' developments classified by bedroom'); if (isNum(d.resalesInClassifiedDevelopments) && isNum(d.allResales)) L.push(num(d.resalesInClassifiedDevelopments, 0) + ' of ' + num(d.allResales, 0) + ' resales covered'); break;
      case 'R.rentalContracts12': if (Array.isArray(d.byDeclaredBedrooms)) L.push(d.byDeclaredBedrooms.filter((x) => isNum(x.bedrooms) && isNum(x.contracts)).map((x) => x.bedrooms + '-bedroom ' + num(x.contracts, 0) + (isNum(x.medianRent) ? ' (median ' + money(x.medianRent) + ' a month)' : '')).join(' · ')); break;
      case 'I.railStations': if (Array.isArray(d.stations)) L.push(d.stations.map((s) => s.name + ' ' + metres(s.metres)).join(' · ')); break;
      case 'I.primarySchools1km': if (d.nearest && d.nearest.name) L.push('Nearest: ' + d.nearest.name + ' ' + metres(d.nearest.metres)); if (isNum(d.within2km)) L.push(num(d.within2km, 0) + ' within 2 km'); break;
      case 'I.everydayAmenities': if (isNum(d.nearestSupermarketMetres)) L.push('Nearest supermarket ' + metres(d.nearestSupermarketMetres)); if (d.nearestHawker && d.nearestHawker.name) L.push(d.nearestHawker.name + ' ' + metres(d.nearestHawker.metres)); if (d.nearestPark && d.nearestPark.name) L.push(d.nearestPark.name + ' ' + metres(d.nearestPark.metres)); break;
      case 'I.namedSites2km': if (Array.isArray(d.sites)) L.push(d.sites.map((s) => s.name + (s.label ? ' (' + s.label.toLowerCase() + ')' : '') + ' ' + metres(s.metres)).join(' · ')); break;
      case 'S.newSaleDevelopments2km': if (Array.isArray(d.developmentsList) && d.developmentsList.length) L.push(d.developmentsList.map((x) => x.name + (isNum(x.newSales12) ? ', ' + plural(x.newSales12, 'new sale') : '') + ' ' + metres(x.metres)).join(' · ')); break;
      case 'S.recordedDwellingUnits2km': if (isNum(d.developments)) L.push(plural(d.developments, 'development')); if (isNum(d.ecHomes) && d.ecHomes > 0) L.push('including ' + num(d.ecHomes, 0) + ' EC homes'); break;
      case 'M.marketPulse': if (d.sizeBand) L.push(d.sizeBand + (d.direction ? ' · ' + d.direction : '') + (d.strength ? ' · ' + d.strength + ' evidence' : '')); break;
      case 'M.paHdbResales12': if (isNum(d.latest4RoomPlus)) L.push(num(d.latest4RoomPlus, 0) + ' were 4-room or larger'); break;
      case 'M.paPrivateTransactions12': if (d.resales && isNum(d.resales.prior12)) L.push(num(d.resales.prior12, 0) + ' in the 12 months before'); if (d.newSales && isNum(d.newSales.latest12)) L.push(plural(d.newSales.latest12, 'new sale') + ' in the latest 12 months'); break;
      case 'N.hdbFlats2km': if (isNum(d.blocks)) L.push(plural(d.blocks, 'block')); if (isNum(d.rentalFlats)) L.push('including ' + num(d.rentalFlats, 0) + ' rental flats'); if (d.hdbDatasetUpdated) L.push('HDB data updated ' + day(d.hdbDatasetUpdated)); break;
      case 'N.paHdbStock': if (isNum(d.blocks)) L.push(plural(d.blocks, 'block')); break;
      case 'N.paResidents': case 'N.subzoneResidents': if (isNum(d.residents2021)) L.push('June 2021: ' + num(d.residents2021, 0) + (isNum(d.residentsChangePct) ? ' (' + (d.residentsChangePct > 0 ? '+' : '') + num(d.residentsChangePct, 1) + '%)' : '')); break;
      default:
        if (/^P\.peerPosition\./.test(m.id)) { if (isNum(d.subjectMedianPsf) && isNum(d.peerMedianPsf)) L.push(money(d.subjectMedianPsf) + ' psf vs peer median ' + money(d.peerMedianPsf) + ' psf'); if (isNum(d.rank) && isNum(d.of)) L.push(ord(d.rank) + ' of ' + num(d.of, 0) + ' by psf' + (d.tier ? ', ' + d.tier : '')); }
        else if (/^P\.resaleMedian\./.test(m.id)) { if (isNum(d.medianPsf)) L.push(money(d.medianPsf) + ' psf'); if (Array.isArray(d.typicalSqft) && d.typicalSqft.length === 2 && isNum(d.typicalSqft[0])) L.push(d.typicalSqft[0] === d.typicalSqft[1] ? 'about ' + num(d.typicalSqft[0], 0) + ' sq ft' : num(d.typicalSqft[0], 0) + '–' + num(d.typicalSqft[1], 0) + ' sq ft'); }
        else if (/^R\.bedroomResales24\./.test(m.id)) { if (isNum(d.latest12)) L.push(num(d.latest12, 0) + ' in the latest 12 months'); }
    }
    return L.filter(Boolean).join(' · ');
  }
  const srcLine = (m) => (m.sourceIds || []).map((id) => SOURCE_NAME[id] || id).join(', ');

  /* ---------------------------------------------------------------- the opening evidence graphic (V4: benchmark bars, or a two-value strip) */
  function evidence(md) {
    const A = md.assessment, M = md.metrics, t = M['R.turnover24'], pr = M['R.peerRank24'];
    const fig = (v, label, sub) => '<div class="gwp-fig"><b>' + v + '</b><span>' + esc(label) + '</span>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
    const head = '<p class="gwp-k">PRISM Reveal</p><p class="gwp-rv">' + esc(A.reveal.headline) + '</p>';
    if (t && pr && pr.detail && isNum(pr.detail.peerMedian) && A.reveal.uses.indexOf('R.turnover24') > -1) {
      const peer = pr.detail.peerMedian, top = Math.max(t.value, peer) * 1.12, w = (v) => Math.max(2, Math.round((v / top) * 1000) / 10);
      const bar = (cls, name, v) => '<div class="gwp-bar ' + cls + '"><span class="gwp-bn">' + esc(name) + '</span><span class="gwp-bt" aria-hidden="true"><i style="width:' + w(v) + '%"></i></span><b class="gwp-bv">' + num(v, 1) + '</b></div>';
      const rank = isNum(pr.value) && isNum(pr.detail.of) ? fig(esc(ord(pr.value)) + '<em> of ' + num(pr.detail.of, 0) + '</em>', 'Comparable developments', 'By resale turnover, ' + period(pr.period)) : '';
      return '<div class="gwp-ev" data-gwp-ev="bars">' + head + '<div class="gwp-figs">' + fig(num(t.value, 1), 'Resales per 100 homes a year', 'Annualised, ' + period(t.period)) + rank + '</div>' +
        '<p class="gwp-evk">Against the comparable group</p><div class="gwp-bars" role="img" aria-label="' + esc(md.name + ' ' + num(t.value, 1) + ' resales per 100 homes a year; peer median ' + num(peer, 1)) + '">' +
        bar('me', md.name, t.value) + bar('peer', 'Peer median', peer) + '</div>' +
        '<p class="gwp-evn">Resales per 100 homes a year · ' + esc(period(t.period)) + ' · project-wide · same zero baseline · ' + esc(srcLine(t)) + (A.reveal.caveat ? '. ' + esc(A.reveal.caveat) : '') + '</p></div>';
    }
    const ids = [A.reveal.uses[0], A.verdict.whyUses[0]].filter((id, i, a) => id && M[id] && a.indexOf(id) === i).slice(0, 2);
    if (!ids.length) return '<div class="gwp-ev">' + head + '</div>';
    // a short basis under each value: the qualification that matters (rental flats, the comparison group) and its date
    const sub = (m) => { const d = m.detail || {}; return [m.id === 'N.hdbFlats2km' && isNum(d.rentalFlats) ? 'Includes ' + num(d.rentalFlats, 0) + ' rental flats' : isNum(d.developments) ? plural(d.developments, 'comparable development') : '',
      m.id === 'N.hdbFlats2km' && d.hdbDatasetUpdated ? 'HDB data updated ' + day(d.hdbDatasetUpdated) : period(m.period)].filter(Boolean).join(' · '); };
    const short = (l) => String(l || '').replace(/\s*\([^)]*\)\s*$/, '');
    return '<div class="gwp-ev" data-gwp-ev="strip">' + head + '<div class="gwp-figs">' + ids.map((id) => { const m = M[id]; return fig(esc(m.unit === 'transactions_minimum' ? 'At least ' + num(m.value, 0) : num(m.value, 0)), short(m.label), sub(m)); }).join('') + '</div>' +
      (A.reveal.caveat ? '<p class="gwp-evn">' + esc(A.reveal.caveat) + '</p>' : '') + '</div>';
  }

  /* ---------------------------------------------------------------- the r2 Reveal (Standard Reveal; Master Planning, 3 Nov 2026) */
  // An evidence-profile page opens with a PRISM Reveal in the existing Reveal design: one finding, two approved figures with their periods,
  // and the qualification the finding needs. Only the approved headlines below are ever used; each has a fixed condition on the exported
  // band, counts and flags (no new threshold or calculation). The qualifications are sentences taken word for word from the approved
  // statements; when one cannot be found, that Reveal is not shown. With no approved headline that fits, the page shows a factual summary of
  // the approved position labels instead (never a verdict). Never: a prediction, a recommendation, a score, a Market rank.
  const REVEAL = {
    resaleSettling: 'High resale activity, but sustained activity is still settling',
    resaleAbove: 'Resale activity is above most peers',
    quiet: 'A relatively quiet surrounding resale market'
  };
  const sentenceOf = (s, start) => { const t = String(s || ''), i = t.indexOf(start); if (i < 0) return ''; const j = t.indexOf('. ', i); return j < 0 ? t.slice(i) : t.slice(i, j + 1); };
  const QUAL_PRICE = '(a position, not a measure of value)';
  // D3 evidence summary (GW-PRISM-V1.1-2026-11-03-NATIONWIDE-1): the approved texts, exactly
  const ES = { head: 'Available evidence: ', mrt: 'Nearest MRT or LRT station exit', market: 'Condo and EC resales within 2 km', measures: ['infrastructure.mrt', 'infrastructure.schools', 'infrastructure.amenities', 'market.backdrop'] };
  function reveal11(v) {
    if (!v || !v.profile) return null;
    const P = v.positions.P, R = v.positions.R, pc = P && (P.components || [])[0], rc = R && (R.components || [])[0];
    const rs = lineOf(v, 'R', 'resale.sustained'), q = lineOf(v, 'S', 'supply.quietArea'), mb = lineOf(v, 'M', 'market.backdrop');
    const n = v.peerGroup && isNum(v.peerGroup.developments) ? v.peerGroup.developments : null;   // "with a figure" when not every peer has one, as the statements say
    const of = (c, word) => (isNum(c.lower) && isNum(c.peersWithValue) ? word + ' ' + num(c.lower, 0) + ' of ' + num(c.peersWithValue, 0) + ' similar developments' + (n !== null && c.peersWithValue < n ? ' with a figure' : '') : '');
    const figR = rc && isNum(rc.value) ? { v: num(rc.value, 1), label: (rs && rs.status === 'settling' ? 'Observed resales' : 'Resales') + ' per 100 homes a year', sub: [R.periodLabel, of(rc, 'higher than')].filter(Boolean).join(' · ') } : null;
    const figP = pc && isNum(pc.value) && P.statement.indexOf(QUAL_PRICE) >= 0 ? { v: signed(pc.value) + '%', label: 'Price against its local comparables ' + QUAL_PRICE, sub: P.bandLabel + ' · ' + priceWhen(P) } : null;
    // 1 resale activity above its peers (more than half of them lower)
    if (R && R.band === 'above' && figR && rc.lower * 2 > rc.peersWithValue) {
      if (rs && rs.status === 'settling') {
        const a = sentenceOf(rs.statement, 'Settling: '), b = sentenceOf(R.statement, 'The wave start is based on ');
        if (a && b) return { kind: 'reveal', id: 'resaleSettling', head: REVEAL.resaleSettling, figs: [figR, figP].filter(Boolean), notes: [a, b] };
      } else if (rs && rs.status === 'available') {
        // D4: the "above most peers" Reveal needs 50 or more homes; a smaller development keeps its measurements, with the factual summary
        const homes = R.sample && R.sample.homes;
        if (isNum(homes) && homes >= V11.MIN_HOMES_ABOVE) return { kind: 'reveal', id: 'resaleAbove', head: REVEAL.resaleAbove, figs: [figR, figP].filter(Boolean), notes: [] };
        return summary11(P, R, rs, figR, figP, 'summaryD4');
      }
    }
    // 2 a quiet surrounding resale market (the exported flag), with its own qualification and the observed change
    if (q && q.status === 'available' && q.data && q.data.flag === true && isNum(q.data.resales2km)) {
      const a = sentenceOf(q.statement, 'Quiet area: '), d = mb && mb.data;
      if (a) return { kind: 'reveal', id: 'quiet', head: REVEAL.quiet,
        figs: [{ v: num(q.data.resales2km, 0), label: 'Condo and EC resales within 2 km', sub: [period(q.period), of(q.data, 'more than')].filter(Boolean).join(' · ') },
          d && isNum(d.changePct) && mb.period && mb.period.prior ? { v: signed(d.changePct) + '%', label: 'Against the previous 12 months', sub: period(mb.period.latest) + ' against ' + period(mb.period.prior) } : null].filter(Boolean),
        notes: [a, mb && mb.statement.indexOf('Observed transactions, not a prediction.') >= 0 ? 'Observed transactions, not a prediction.' : ''].filter(Boolean) };
    }
    // 3 no approved headline fits: a factual summary of the approved position labels (never a verdict)
    if (P || R) return summary11(P, R, rs, figR, figP, 'summary');
    // 4 D3: neither a Price nor a Resale position: a controlled factual evidence summary of the available measures only (their labels in panel
    //   order; the nearest station and the surrounding resales as figures; the report's own Price and Resale missing-evidence statements)
    const av = ES.measures.map((ms) => lineOf(v, ms === 'market.backdrop' ? 'M' : 'I', ms)).filter((l) => l && l.status === 'available');
    if (!av.length) return null;
    const mrt = av.find((l) => l.measure === 'infrastructure.mrt'), mk = av.find((l) => l.measure === 'market.backdrop'), figs = [];
    const st = mrt && mrt.data && Array.isArray(mrt.data.stations) ? mrt.data.stations[0] : null;
    if (st && isNum(st.distanceM)) { const c = /closer than [\d,]+ of [\d,]+ similar developments( with a figure)?/.exec(mrt.statement); figs.push({ v: metres(st.distanceM), label: ES.mrt, sub: [st.name, c ? c[0] : ''].filter(Boolean).join(' · ') }); }
    if (mk && mk.data && isNum(mk.data.latest) && mk.period && mk.period.latest && mk.period.prior) figs.push({ v: num(mk.data.latest, 0), label: ES.market, sub: period(mk.period.latest) + (isNum(mk.data.changePct) ? ' · ' + signed(mk.data.changePct) + '% against ' + period(mk.period.prior) : '') });
    const miss = [lineOf(v, 'P', 'price.entry'), lineOf(v, 'R', 'resale.sustained')].filter((l) => l && l.status === 'not_available').map((l) => l.statement);
    return { kind: 'summary', id: 'evidence', head: ES.head + av.map((l) => l.label).join(', '), figs: figs, notes: miss };
  }
  function summary11(P, R, rs, figR, figP, id) {
    const settle = rs && rs.status === 'settling' ? sentenceOf(rs.statement, 'Settling: ') : '';
    if (rs && rs.status === 'settling' && !settle) return null;
    return { kind: 'summary', id: id, head: [P ? 'Price: ' + P.bandLabel : '', R ? 'Resale activity: ' + R.bandLabel : ''].filter(Boolean).join(' · '), figs: [figR, figP].filter(Boolean), notes: settle ? [settle] : [] };
  }
  /* ---------------------------------------------------------------- the buyer explanation (Master Planning, 3 Nov 2026: V2)
     On an evidence-profile page, above the five dimensions (unchanged): what stands out -> why it matters -> what to check next.
     A headline of fixed clauses chosen by the exported bands; four cards (Price, Resale, MRT, nearby Market; a missing measure is
     omitted, never replaced), each with a meaning-first figure ("2% below comparable prices", "16.8% fewer nearby resales"), its approved
     peer comparison, a one-line reading by its approved band and a limitation only where one matters; then "What stands out", "What
     deserves attention" (weaker positions, missing evidence, the surrounding market apart from the development) and one question chosen by
     the evidence. Every sentence is a fixed template (XT); every figure is an approved value (the signed figures stay in the dimensions).
     Rules: market wording describes resale volume only (slowed / picked up at -10% / +10%), never prices or demand; a price position is never
     a price change or a valuation; MRT within 500 m is a proximity observation; D4 (no "more than most" resale finding under 50 homes); no
     sign-based colour, school wording, score, forecast, rating, recommendation or automatic Ken's Take. An approved opening (a Reveal, the
     D3 summary) stays on top word for word and is not repeated below. */
  const XT = {
    head: { price: { around: 'Priced in line with comparable {cls}s', below: 'Priced below most comparable {cls}s', above: 'Priced above most comparable {cls}s' },
      resale: { steady: 'with steady resales', around: 'with resale activity typical of similar developments', above: 'with more resale activity than most similar developments', below: 'with less resale activity than most similar developments', settling: 'with resale activity still settling after its first wave' },
      market: { down: 'while nearby resale activity has slowed', up: 'while nearby resale activity has picked up', flat: 'while nearby resale activity is broadly unchanged' },
      marketOnly: { down: 'Nearby resale activity has slowed.', up: 'Nearby resale activity has picked up.', flat: 'Nearby resale activity is broadly unchanged.' } },
    card: {
      P: { name: 'Price position', below: '{x}% below', above: '{x}% above', zero: 'In line', unit: 'comparable prices', cmp: '{lower} of {n} similar developments{wf} have a lower relative price',
        why: { around: 'Close to the price level of comparable {cls}s nearby.', below: 'Lower than most comparable {cls}s nearby.', above: 'Higher than most comparable {cls}s nearby.' },
        limit: 'A position against comparables, not a valuation or a price change.' },
      R: { name: 'Resale activity', unit: 'resales per 100 homes annually', cmp: 'Higher than {lower} of {n} similar developments{wf}', cmp0: 'Lower than all {n} similar developments{wf}',
        why: { above: 'Homes here change hands more often than at most similar developments.', small: 'Measured on fewer than 50 homes, so a few sales move this figure.',
          steady: 'Typical of similar developments.', around: 'Typical of similar developments.',
          below: 'Homes here change hands less often than at most similar developments.', settling: 'Most resales so far came in the first resale wave after completion.' },
        limit: { settling: 'The long-run resale rate is not yet known.', below: 'Fewer observed resales, not necessarily weaker demand.', above: 'Past resales do not guarantee a future sale.' } },
      I: { name: 'Nearest MRT or LRT', unit: 'to {station}', closer: 'Closer than {x} of {n} similar developments{wf}',
        why: { above: 'Closer to a station than most similar developments.', around: 'A typical station distance for similar developments.', below: 'Farther from a station than most similar developments.' },
        limit: 'Straight-line distance, not walking time.' },
      M: { name: 'Nearby resales', fewer: '{x}% fewer', more: '{x}% more', zero: 'No change in', unit: 'nearby resales', cmp: '{prior} → {latest} condo and EC resales within 2 km', rank: 'More nearby resales than {lower} of {n} similar developments{wf}', rank0: 'Fewer nearby resales than all {n} similar developments{wf}',
        why: { down: 'Fewer homes changed hands within 2 km than a year earlier.', up: 'More homes changed hands within 2 km than a year earlier.', flat: 'Within 10% of a year earlier, so broadly unchanged.', quiet: 'A relatively quiet surrounding resale market.' },
        limit: 'Counts transactions, not prices or demand.' }
    },
    scope: { project: 'This development', location: 'Location', market: 'Neighbourhood · 2 km' },
    good: { resaleAbove: 'More resale activity than most similar developments.', steady: 'Homes here have resold in every month of the last two years.',
      mrt: '{name} is about {m} from {station} (straight line).', mrtCloser: 'Closer to an MRT or LRT station than most similar developments.',
      priceAround: 'Priced in line with comparable {cls}s.', priceBelow: 'Priced below most comparable {cls}s (a position, not a sign of value).',
      competition: 'No other {cls} was selling new homes within 2 km in the latest year.' },
    watch: { settling: 'Most recent resales came in the first resale wave, so the long-run resale rate is not yet known.', resaleBelow: 'Less resale activity than most similar developments.',
      priceAbove: 'Priced above most comparable {cls}s.', mrtFar: 'Farther from an MRT or LRT station than most similar developments.',
      marketDown: 'The surrounding market slowed ({x}% fewer resales within 2 km){apart}.', marketUp: 'The surrounding market picked up ({x}% more resales within 2 km){apart}.',
      apart: ', separate from this development\'s own resale record',
      noPrice: 'No price comparison: {why}', noResale: 'No resale rate: {why}', small: 'Fewer than 50 homes, so a few sales move the resale rate.',
      competition: '{devs} sold new homes within 2 km in the latest year.' },
    ask: { priceAbove: 'What does the premium over comparable {cls}s pay for: unit size, floor, facing, age or facilities?',
      priceBelow: 'What explains the lower price position against comparable {cls}s: age, tenure, unit mix or location?',
      resale: 'How many units are listed for resale here now, and how quickly have recent ones sold?',
      mrt: 'How long is the actual walk or ride to the station you would use?',
      market: 'How do recent transacted prices for similar units nearby compare with a year earlier?',
      price: 'How does the asking price for the unit you are considering compare with recent resales of similar units here and at comparable {cls}s nearby?' },
    sec: { good: 'What stands out', watch: 'What deserves attention', ask: 'What to check next' },
    askNote: 'A question to check, not a prediction.', askNoteMarket: 'PRISM counts resales; it does not track prices.',
    foot: 'The original figures, periods, comparison groups and sources are in the five dimensions below.'
  };
  const fill = (t, o) => t.replace(/\{(\w+)\}/g, (_, k) => (o[k] == null ? '' : o[k]));
  // op: the page's approved opening (reveal11), shown on top; its notes (Settling, D3's missing-evidence statements) are not repeated below
  function explain11(v, name, op) {
    if (!v || !v.profile) return null;
    const P = v.positions.P, R = v.positions.R, pc = P && (P.components || [])[0], rc = R && (R.components || [])[0], g = v.profile.group || v.peerGroup || {}, cls = CLS[g.propertyClass] || 'development';
    const L = (k, ms) => { const l = lineOf(v, k, ms); return l && l.status === 'available' ? l : null; };
    const mrt = L('I', 'infrastructure.mrt'), mk = L('M', 'market.backdrop'), comp = L('S', 'supply.competition'), q = L('S', 'supply.quietArea'), rs = lineOf(v, 'R', 'resale.sustained');
    const st = mrt && mrt.data && Array.isArray(mrt.data.stations) ? mrt.data.stations[0] : null, rank = mrt && mrt.data && mrt.data.rank;
    const steady = !!(R && (R.context || []).some((c) => c.id === 'activeMonthShare24' && c.value === 100)), settling = !!(rs && rs.status === 'settling');
    const homes = R && R.sample && R.sample.homes, small = !(isNum(homes) && homes >= V11.MIN_HOMES_ABOVE);
    const chg = mk && mk.data && isNum(mk.data.changePct) ? mk.data.changePct : null, mkey = chg === null ? '' : chg <= -10 ? 'down' : chg >= 10 ? 'up' : 'flat';
    const quiet = !!(q && q.data && q.data.flag === true && isNum(q.data.resales2km));
    const notes = (op && op.notes) || [], shown = (t) => notes.some((n) => n.indexOf(t) >= 0);
    const ab = (x) => num(Math.abs(x));
    // a peer count, as the statements give it; none lower and none equal: "than all N"
    // "with a figure" when not every peer has one, as the statements say
    const N = isNum(g.developments) ? g.developments : null, wf = (c) => (N !== null && isNum(c.peersWithValue) && c.peersWithValue < N ? ' with a figure' : '');
    const rk = (c, t, t0) => (isNum(c.lower) && isNum(c.peersWithValue) ? fill(c.lower === 0 && c.equal === 0 && t0 ? t0 : t, { lower: num(c.lower, 0), n: num(c.peersWithValue, 0), wf: wf(c) }) : '');
    // the headline: price clause, resale clause (D4: no "more than most" under 50 homes), market clause
    const hp = P && XT.head.price[P.band] ? fill(XT.head.price[P.band], { cls }) : '';
    const rkey = !R ? '' : settling ? 'settling' : R.band === 'around' ? (steady ? 'steady' : 'around') : R.band === 'above' && small ? '' : R.band;
    const hr0 = rkey && XT.head.resale[rkey] ? XT.head.resale[rkey] : '', hr = hp || !hr0 ? hr0 : hr0.charAt(5).toUpperCase() + hr0.slice(6);   // without a price clause the resale clause opens the sentence
    const head = hp || hr ? [hp, hr].filter(Boolean).join(', ') + (mkey ? ', ' + XT.head.market[mkey] : '') + '.' : (mkey ? XT.head.marketOnly[mkey] : '');
    if (!head) return null;
    // the four cards
    const C = XT.card, cards = [];
    if (P && pc && isNum(pc.value) && C.P.why[P.band]) cards.push({ dim: 'P', scope: XT.scope.project, name: C.P.name, v: fill(pc.value < 0 ? C.P.below : pc.value > 0 ? C.P.above : C.P.zero, { x: ab(pc.value) }), unit: C.P.unit,
      cmp: rk(pc, C.P.cmp), why: fill(C.P.why[P.band], { cls }), limit: C.P.limit, key: true, when: priceWhen(P) });   // key: a limitation kept on the phone too
    if (R && rc && isNum(rc.value)) { const k = settling ? 'settling' : R.band === 'above' ? (small ? 'small' : 'above') : R.band === 'around' ? (steady ? 'steady' : 'around') : R.band;
      if (C.R.why[k]) cards.push({ dim: 'R', scope: XT.scope.project, name: C.R.name, v: num(rc.value, 1), unit: C.R.unit, cmp: rk(rc, C.R.cmp, C.R.cmp0),
        why: C.R.why[k], limit: k === 'settling' && shown('Settling: ') ? '' : C.R.limit[k] || '', key: k === 'below', when: (settling ? 'Observed, ' : '') + R.periodLabel }); }
    if (st && isNum(st.distanceM)) cards.push({ dim: 'I', scope: XT.scope.location, name: C.I.name, v: metres(st.distanceM), unit: fill(C.I.unit, { station: st.name }),
      cmp: rank && isNum(rank.peersWithValue) ? fill(C.I.closer, { x: num(rank.higher, 0), n: num(rank.peersWithValue, 0), wf: wf(rank) })   /* the approved statement's own count, in every band */ : '',
      why: rank && C.I.why[rank.band] ? C.I.why[rank.band] : '', limit: C.I.limit, when: '' });
    if (chg !== null && mk.period && mk.period.latest) cards.push({ dim: 'M', scope: XT.scope.market, name: C.M.name, v: fill(chg < 0 ? C.M.fewer : chg > 0 ? C.M.more : C.M.zero, { x: ab(chg) }), unit: C.M.unit,
      cmp: fill(C.M.cmp, { prior: num(mk.data.prior, 0), latest: num(mk.data.latest, 0) }) + (q && q.data && q.data.resales2km === mk.data.latest && rk(q.data, C.M.rank, C.M.rank0) ? '. ' + rk(q.data, C.M.rank, C.M.rank0) : ''),
      why: C.M.why[mkey], limit: mkey === 'flat' ? '' : C.M.limit, when: period(mk.period.latest) + ' against the year before' });
    else if (quiet) cards.push({ dim: 'S', scope: XT.scope.market, name: C.M.name, v: num(q.data.resales2km, 0), unit: C.M.unit,   // no year-on-year change: the quiet-area count, in its own dimension
      cmp: rk(q.data, C.M.rank, C.M.rank0), why: C.M.why.quiet, limit: '', when: period(q.period) });
    // what stands out / what deserves attention (at most two each, in a fixed order of strength)
    const good = [], watch = [], ns = comp && comp.data && Array.isArray(comp.data.sameClassSelling) ? comp.data.sameClassSelling.length : null;
    if (R && R.band === 'above' && !small && !settling) good.push(XT.good.resaleAbove);
    if (steady && !settling) good.push(XT.good.steady);
    if (st && isNum(st.distanceM) && st.distanceM <= 500 && !(rank && rank.band === 'below')) good.push(fill(XT.good.mrt, { name, m: metres(st.distanceM), station: st.name }));
    else if (rank && rank.band === 'above') good.push(XT.good.mrtCloser);
    if (P && P.band === 'around') good.push(fill(XT.good.priceAround, { cls }));
    if (P && P.band === 'below') good.push(fill(XT.good.priceBelow, { cls }));
    if (ns === 0 && !quiet) good.push(fill(XT.good.competition, { cls }));   // in a quiet area, little competition reflects a thin market, not an advantage
    if (settling && !shown('Settling: ')) watch.push(XT.watch.settling);
    if (R && R.band === 'below' && !settling) watch.push(XT.watch.resaleBelow);
    if (P && P.band === 'above') watch.push(fill(XT.watch.priceAbove, { cls }));
    if (rank && rank.band === 'below') watch.push(XT.watch.mrtFar);
    if (mkey === 'down' || mkey === 'up') watch.push(fill(mkey === 'down' ? XT.watch.marketDown : XT.watch.marketUp, { x: ab(chg), apart: R ? XT.watch.apart : '' }));
    const miss = (k, ms, t) => { const l = lineOf(v, k, ms); if (l && l.status === 'not_available' && l.statement.indexOf('Not available: ') === 0 && !shown(l.statement)) watch.push(fill(t, { why: l.statement.slice(15) })); };
    if (!P) miss('P', 'price.entry', XT.watch.noPrice);
    if (!R) miss('R', 'resale.sustained', XT.watch.noResale);
    if (R && R.band === 'above' && small) watch.push(XT.watch.small);
    if (ns > 0) watch.push(fill(XT.watch.competition, { devs: plural(ns, 'other ' + cls + ' development') }));
    // one question, chosen by the evidence
    const ask = P && P.band === 'above' ? XT.ask.priceAbove : P && P.band === 'below' ? XT.ask.priceBelow : settling || (R && R.band === 'below') ? XT.ask.resale :
      rank && rank.band === 'below' ? XT.ask.mrt : mkey === 'down' || mkey === 'up' ? XT.ask.market : XT.ask.price;
    const fresh = (t) => t !== head;   // never the headline again, word for word
    return { head, lead: !!(hp || hr), cards, good: good.filter(fresh).slice(0, 2), watch: watch.filter(fresh).slice(0, 2), ask: fill(ask, { cls }), askNote: ask === XT.ask.market ? XT.askNoteMarket : XT.askNote, foot: XT.foot };
  }
  function explainHtml(x, op, id) {
    if (!x) return '';
    const card = (f) => '<a class="gwp-xf" href="#/prism/' + esc(id || '') + '/' + f.dim.toLowerCase() + '" data-gwp-xjump="' + f.dim + '"><span class="gwp-xs">' + esc(f.scope) + ' · ' + esc(f.name) + '</span>' +
      '<span class="gwp-xv"><b>' + esc(f.v) + '</b> <span class="gwp-xl">' + esc(f.unit) + '</span></span>' + (f.cmp ? '<small class="gwp-xd">' + esc(f.cmp) + '</small>' : '') +
      (f.why ? '<span class="gwp-xy">' + esc(f.why) + '</span>' : '') + (f.limit ? '<small class="gwp-xw' + (f.key ? ' gwp-xw--k' : '') + '">' + esc(f.limit) + '</small>' : '') + (f.when ? '<small class="gwp-xt">' + esc(f.when) + '</small>' : '') + '<span class="gwp-xm">Details ›</span></a>';
    const notes = op && op.notes.length ? '<p class="gwp-xrn">' + op.notes.map(esc).join(' ') + '</p>' : '';
    const top = op && op.kind === 'reveal' ? '<p class="gwp-k">PRISM Reveal</p><p class="gwp-xh">' + esc(op.head) + '</p>' + notes + '<p class="gwp-xlead">' + esc(x.head) + '</p>' :
      !x.lead && op ? '<p class="gwp-k">PRISM summary</p><p class="gwp-xh">' + esc(op.head) + '</p>' + notes + '<p class="gwp-xlead">' + esc(x.head) + '</p>' :
      '<p class="gwp-k">What the numbers reveal</p><p class="gwp-xh">' + esc(x.head) + '</p>' + notes;
    const list = (h, a) => (a.length ? '<div class="gwp-xt3"><h3>' + esc(h) + '</h3><ul>' + a.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul></div>' : '');
    return '<section class="gwp-xp" data-gwp-explain="' + esc(op ? op.id : 'explain') + '"' + (op ? ' data-gwp-reveal="' + esc(op.id) + '"' : '') + ' aria-label="What the numbers reveal">' + top +
      (x.cards.length ? '<div class="gwp-xfs gwp-xfs--' + x.cards.length + '">' + x.cards.map(card).join('') + '</div>' : '') +
      '<div class="gwp-xb">' + list(XT.sec.good, x.good) + list(XT.sec.watch, x.watch) +
      '<div class="gwp-xq"><h3>' + esc(XT.sec.ask) + '</h3><p>' + esc(x.ask) + '</p><small>' + esc(x.askNote) + '</small></div></div>' +
      '<p class="gwp-xfoot">' + esc(x.foot) + '</p></section>';
  }
  function revealHtml(x) {
    if (!x) return '';
    const fig = (f) => '<div class="gwp-fig"><b>' + esc(f.v) + '</b><span>' + esc(f.label) + '</span>' + (f.sub ? '<small>' + esc(f.sub) + '</small>' : '') + '</div>';
    return '<section class="gwp-rv11" data-gwp-reveal="' + esc(x.id) + '" aria-label="' + (x.kind === 'reveal' ? 'PRISM Reveal' : 'PRISM summary') + '"><div class="gwp-ev" data-gwp-ev="' + (x.kind === 'reveal' ? 'reveal11' : 'summary11') + '">' +
      '<p class="gwp-k">' + (x.kind === 'reveal' ? 'PRISM Reveal' : 'PRISM summary') + '</p><p class="gwp-rv">' + esc(x.head) + '</p>' +
      (x.figs.length ? '<div class="gwp-figs">' + x.figs.map(fig).join('') + '</div>' : '') +
      (x.notes.length ? '<p class="gwp-evn">' + x.notes.map(esc).join(' ') + '</p>' : '') + '</div></section>';
  }

  /* ---------------------------------------------------------------- HTML */
  const mark = (root, size) => '<img class="gwp-mark" src="' + esc(root) + 'assets/img/prism/prism-mark.png" width="' + size + '" height="' + size + '" alt="PRISM">';
  const brand = (root) => '<div class="gwp-brand">' + mark(root, 52) + '<div><p class="gwp-bname">PRISM <span>by Groundwork</span></p><p class="gwp-bline">Five dimensions. One clearer property decision.</p></div></div>';
  const SHORT = { P: 'Price', R: 'Resale', I: 'Infrastructure', S: 'Supply', M: 'Demand' };
  // Where each measure's evidence lives in the development's Property Data (its own section there), and back. Only measures that are
  // read from that development's own records point there (Ken, 31 Oct 2026: relevant and specific links only).
  const EVIDENCE = [
    [/^R\.(resales12|turnover12|turnover24|activeMonths24|peerRank24)$|^R\.bedroomResales24\./, 'lgTx', 'Sales history'],
    [/^R\.rentalContracts12$/, 'lgRent', 'Rents'],
    [/^P\.(resaleMedian|peerPosition)\./, 'lgTypes', 'Prices by size'],
    [/^M\.marketPulse$/, 'numbers', 'How the price has moved'],
    [/^I\.(railStations|primarySchools1km|everydayAmenities)$/, 'lgLoc', 'Location & amenities']
  ];
  const evidenceOf = (id) => { const e = EVIDENCE.find((x) => x[0].test(id)); return e ? { sec: e[1], label: e[2] } : null; };
  // the development has its own resales, so its Property Data has these sections (an evidence-profile page: a completed development)
  const hasRecords = (md) => !!md.metrics['R.resales12'] || (md.mode === 'profile' && !!md.v11 && md.v11.kind === 'completed');
  // PRISM Analysis | Property Data, directly under the development's name on both views (links: each view keeps its address and Back/Forward)
  function switchHtml(md, active, root) {
    const tab = (k, href, label, icon) => '<a class="gwp-tab" href="' + href + '" data-gwp-view="' + k + '"' + (k === active ? ' aria-current="page"' : '') + '>' + icon + '<span>' + label + '</span></a>';
    return '<nav class="gwp-tabs" aria-label="' + esc(md.name) + ': views" data-gwp-switch="' + esc(md.id) + '">' + tab('prism', '#/prism/' + esc(md.id), 'PRISM Analysis', mark(root || '../', 20)) +
      tab('data', '#/p/' + esc(md.id), 'Property Data', '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 20V12m5 8V7m5 13v-6m5 6V4"/></svg>') + '</nav>';
  }
  // On Property Data: one compact verdict line (replaces the large banner)
  function previewHtml(md, root) {
    if (!md || !md.assessment) return '';   // no approved Reveal + Verdict: no PRISM entry at all
    const A = md.assessment;
    return '<section class="gwp-band" data-gwp-preview="' + esc(md.id) + '"><div class="lg-wrap"><a class="gwp-vl" href="#/prism/' + esc(md.id) + '" data-gwp-open>' + mark(root, 28) +
      '<span class="gwp-vlt"><b>PRISM verdict:</b> ' + esc(A.verdict.headline) + ' <span class="gwp-vlr">· ' + esc(A.reveal.headline) + '</span></span><span class="gwp-vlgo">Open PRISM Analysis ›</span></a></div></section>';
  }
  function metricRow(m, md) {
    const dt = detail(m), p = period(m.period) || (m.sourceIds || []).map((id) => md.periodsBySource[id]).filter(Boolean).join('; '), ev = hasRecords(md) && evidenceOf(m.id);
    return '<div class="gwp-m" data-gwp-metric="' + esc(m.id) + '"><dt>' + esc(m.label) + (m.status === 'estimated' ? ' <span class="gwp-tag">Estimate</span>' : '') + '</dt><dd><b>' + esc(value(m)) + '</b>' +
      (dt ? '<span class="gwp-md">' + esc(dt) + '</span>' : '') + '<span class="gwp-ms">' + esc([p, srcLine(m)].filter(Boolean).join(' · ')) + '</span>' + (m.note && !/\([a-z]+-v\d+\)/i.test(m.note) ? '<span class="gwp-mn">' + esc(m.note) + '</span>' : '') +
      (ev ? '<a class="gwp-evl" href="#/p/' + esc(md.id) + '" data-gwp-evidence="' + ev.sec + '">Evidence: ' + esc(ev.label) + ' <span aria-hidden="true">›</span></a>' : '') + '</dd></div>';
  }
  // Each dimension's headline: its most telling verified figures (approved values, formatted; never a score or a judgement), with a
  // short qualifier. Priority per dimension; a dimension with nothing assessed says so.
  const LEAD = {
    P: ['P.peerPosition.2br', 'P.peerPosition.3br', 'P.peerPosition.1br', 'P.resaleMedian.2br', 'P.resaleMedian.3br', 'P.resaleMedian.1br'],
    R: ['R.peerRank24', 'R.activeMonths24', 'R.resaleAlternatives24_2km', 'R.paEstablishedTurnover12', 'R.turnover24', 'R.resales12', 'R.turnover12'],
    I: ['I.railStations', 'I.everydayAmenities', 'I.primarySchools1km', 'I.namedSites2km'],
    S: ['S.recordedDwellingUnits2km', 'S.newSaleDevelopments2km'],
    M: ['M.marketPulse', 'N.hdbFlats2km', 'M.paPrivateTransactions12', 'M.paHdbResales12', 'N.paResidents']
  };
  function phrase(m) {
    const d = m.detail || {}, v = m.value;
    switch (m.id) {
      case 'R.peerRank24': return value(m) + ' comparable developments';
      case 'R.activeMonths24': return 'A resale in ' + value(m);
      case 'R.resaleAlternatives24_2km': return num(v, 0) + ' condo resales within 2 km';
      case 'R.paEstablishedTurnover12': return num(v, 1) + ' resales per 100 homes in the area';
      case 'I.railStations': return Array.isArray(d.stations) && d.stations[0] ? d.stations[0].name + ' ' + metres(d.stations[0].metres) : value(m);
      case 'S.recordedDwellingUnits2km': return num(v, 0) + ' private homes within 2 km';
      case 'S.newSaleDevelopments2km': return v === 0 ? 'No other development with new sales within 2 km' : plural(v, 'development') + ' with new sales within 2 km';
      case 'M.marketPulse': return (v > 0 ? '+' : '') + num(v, 1) + '% same-size resale prices';
      case 'N.hdbFlats2km': return num(v, 0) + ' HDB flats within 2 km';
      case 'M.paPrivateTransactions12': return num(v, 0) + ' private resales in the planning area';
      case 'M.paHdbResales12': return num(v, 0) + ' HDB resales in the planning area';
      default: return /^P\.peerPosition\.(\d)br$/.test(m.id) ? value(m) + ' (' + m.id.slice(-3, -2) + '-bedroom)' : value(m);
    }
  }
  function qualifier(m) {
    const d = m.detail || {};
    switch (m.id) {
      case 'R.peerRank24': return 'By resale turnover, project-wide · ' + period(m.period);
      case 'I.railStations': case 'I.everydayAmenities': return 'Straight-line distances';
      case 'S.recordedDwellingUnits2km': return 'Homes already recorded, not upcoming supply';
      case 'M.marketPulse': return (d.sizeBand ? d.sizeBand + ' · ' : '') + 'latest 12 months against the 12 before';
      case 'N.hdbFlats2km': return 'A count of flats, not of buyers';
      default: return period(m.period);
    }
  }
  function headline(p) {
    if (!p.metrics.length) return { main: 'Not assessed in this report', sub: '' };
    const by = {}; p.metrics.forEach((m) => { by[m.id] = m; });
    const pick = (LEAD[p.key] || []).map((id) => by[id]).filter(Boolean).concat(p.metrics).filter((m, i, a) => a.indexOf(m) === i);
    const a = phrase(pick[0]), b = pick[1] ? phrase(pick[1]) : '';
    return { main: b && (a + ' · ' + b).length <= 66 ? a + ' · ' + b : a, sub: qualifier(pick[0]) };
  }
  // ---- V1.1 (A1): each approved item as the report states it; the labels around them are the page's own (Size, Typical rent...).
  // The price window line restates the export's own windows: this development's exact period, and its peers' 12 to 36 months (peerWindowMonths).
  const srcNames = (ids) => (ids || []).map((id) => SOURCE_NAME[id] || id).join(', ');
  function pricePhrase(x) { const c = (x.components || [])[0]; if (!c || !isNum(c.value)) return x.bandLabel; return num(Math.abs(c.value), 1) + '% ' + (c.value < 0 ? 'below' : c.value > 0 ? 'above' : 'level with') + ' its local comparables'; }
  function posHtml(x, pg) {
    const P = x.dimension === 'P', w = P && x.period && Array.isArray(x.period.peerWindowMonths) ? x.period.peerWindowMonths : null, b = x.basis || {};
    return '<div class="gwp-v11" data-gwp-v11="' + x.dimension + '"><p class="gwp-k">Compared with peers</p>' +
      '<p class="gwp-pos"><b>' + esc(x.bandLabel) + '</b><span data-gwp-period>' + esc(x.periodLabel) + '</span></p><p class="gwp-md" data-gwp-statement>' + esc(x.statement) + '</p>' +
      (w ? '<p class="gwp-ms" data-gwp-window>This development: ' + esc(x.periodLabel) + '. Comparison developments were measured over their own latest ' + num(w[0], 0) + ' to ' + num(w[1], 0) + ' months.</p>' : '') +
      (P && isNum(b.localComparables) ? '<p class="gwp-ms">Local comparables: ' + num(b.localComparables, 0) + (isNum(b.radiusKm) ? ' within ' + num(b.radiusKm, 0) + ' km' : '') + '</p>' : '') +
      (pg ? '<p class="gwp-ms">Peer group: ' + esc(pg.rule) + (isNum(pg.developments) ? ' · ' + num(pg.developments, 0) + ' developments' : '') + (x.sample && isNum(x.sample.homes) ? ' · this development ' + num(x.sample.homes, 0) + ' homes' : '') + ' · ' + esc(srcNames(x.sourceIds)) + '</p>' : '') + '</div>';
  }
  const pct2 = (v) => (isNum(v) ? v.toLocaleString('en-SG', { maximumFractionDigits: 2 }) : '');   // a percentage exactly as the export gives it (4.3, 4.37)
  function yieldHtml(y) {
    const r = y.rules || {};
    return '<div class="gwp-v11" data-gwp-yield><p class="gwp-k">Gross rental yield by size · ' + esc(period(y.period)) + '</p><div class="gwp-tw"><table class="gwp-yt gwp-yt--stack"><thead><tr><th scope="col">Size</th><th scope="col" class="n">Typical rent</th><th scope="col" class="n">Typical resale price</th><th scope="col" class="n">Gross yield</th><th scope="col">Comparable developments</th></tr></thead><tbody>' +
      y.bands.map((b) => '<tr data-gwp-band="' + esc(b.band) + '"><th scope="row">' + esc(b.band.replace('-', '–')) + '</th><td class="n" data-l="Typical rent">' + money(b.typicalRent) + '<small>a month · ' + plural(b.rentalContracts, 'contract') + '</small></td><td class="n" data-l="Typical resale price">' + money(b.typicalResalePrice) + '<small>' + plural(b.resales, 'resale') + '</small></td>' +
        '<td class="n" data-l="Gross yield"><b>' + pct2(b.grossYieldPct) + '%</b>' + (Array.isArray(b.rangePct) ? '<small>range ' + pct2(b.rangePct[0]) + '–' + pct2(b.rangePct[1]) + '%</small>' : '') + '</td>' +
        '<td data-l="Comparable developments">' + (b.peerGroup ? 'Median ' + pct2(b.peerGroup.medianPct) + '% of ' + num(b.peerGroup.developments, 0) + (Array.isArray(b.peerGroup.middleHalfPct) ? ' (middle half ' + pct2(b.peerGroup.middleHalfPct[0]) + '–' + pct2(b.peerGroup.middleHalfPct[1]) + '%)' : '') : '') + (b.positionText ? '<small>' + esc(b.positionText) + '</small>' : '') + '</td></tr>').join('') +
      '</tbody></table></div><p class="gwp-md" data-gwp-yield-caption>' + esc(y.caption) + '</p>' +
      '<ul class="gwp-fine gwp-v11l">' + [r.range ? 'Range: ' + r.range + '.' : '', r.peers ? 'Comparable developments: ' + r.peers + '.' : '', r.shortLease || ''].filter(Boolean).map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>' +
      '<p class="gwp-ms">' + esc(srcNames(y.sourceIds)) + ' · ' + esc(period(y.period)) + '</p></div>';
  }
  function incomeHtml(h) {
    return '<div class="gwp-v11" data-gwp-income><p class="gwp-k">Household income · ' + esc(h.planningArea) + ' planning area · GHS ' + esc(h.surveyYear) + '</p>' +
      '<p class="gwp-md" data-gwp-income-context><b>' + esc(h.context) + '</b> ' + esc(h.geographyNote) + '</p><div class="gwp-tw"><table class="gwp-yt gwp-it"><thead><tr><th scope="col">Monthly household employment income</th><th scope="col" class="n">Households</th><th scope="col" class="n">Share</th></tr></thead><tbody>' +
      h.atOrAbove.map((x) => '<tr><th scope="row">' + money(x.monthlyIncomeAtLeast) + ' or more</th><td class="n">' + num(x.households, 0) + '</td><td class="n"><b>' + pct2(x.pct) + '%</b></td></tr>').join('') +
      '</tbody></table></div><p class="gwp-ms">Of ' + num(h.households, 0) + ' resident households. ' + esc(h.incomeDefinition) + '</p>' +
      '<ul class="gwp-fine gwp-v11l">' + (h.conditions || []).map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul><p class="gwp-ms" data-gwp-income-attr>' + esc(h.attribution) + '</p></div>';
  }
  // r2 evidence profile: each line is its approved label and statement; beneath it, its period (when the statement does not already say it)
  // and its sources with their data periods. A missing measure is shown, never hidden: its statement says why (not available, not yet assessed).
  const signed = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(v));   // as the statements write it: −7.5%, −15%
  function srcPeriod(s) {
    const t = String(s || '');
    if (/^\d{4}-\d{2}$/.test(t)) return 'to ' + ym(t);
    return t.replace(/\d{4}-\d{2}-\d{2}/g, (d) => day(d) || d);
  }
  // sources with the same data period share it: "NEA supermarkets, NParks parks, OneMap (accessed 20 Oct 2026)"
  function srcWith(ids, periods) {
    const groups = [];
    (ids || []).forEach((id) => { const p = periods && periods[id] ? srcPeriod(periods[id]) : '', g = groups.find((x) => x.p === p); if (g) g.n.push(SOURCE_NAME[id] || id); else groups.push({ p, n: [SOURCE_NAME[id] || id] }); });
    return groups.map((g) => g.n.join(', ') + (g.p ? ' (' + g.p + ')' : '')).join(', ');
  }
  // the line's period, unless its statement already states it (both periods, for a latest-against-prior comparison)
  function linePeriod(l) {
    const p = l.period; if (!p) return '';
    const parts = p.latest && p.prior ? [period(p.latest), period(p.prior)] : [period(p)];
    return parts.every((x) => l.statement.indexOf(x) >= 0) ? '' : parts.join(' against ');
  }
  // one approved statement; an entry price for several bedroom types reads one type per line (the same words, in order)
  function statementHtml(l) {
    const parts = l.measure === 'price.entry' && l.data && Array.isArray(l.data.types) && l.data.types.length > 1 ? l.statement.split(/ (?=\d-bedroom: |The entry-price difference is illustrative)/) : [l.statement];
    return parts.length > 1 ? '<span class="gwp-md gwp-pst" data-gwp-statement>' + parts.map((t, i) => '<span>' + esc(t) + (i < parts.length - 1 ? ' ' : '') + '</span>').join('') + '</span>' :
      '<span class="gwp-md" data-gwp-statement>' + esc(l.statement) + '</span>';
  }
  function lineHtml(l, periods) {
    const meta = [linePeriod(l), srcWith(l.sourceIds, periods)].filter(Boolean).join(' · '), gap = l.status === 'not_available' || l.status === 'not_yet_assessed';
    return '<div class="gwp-m gwp-pfl' + (gap ? ' gwp-pfl--gap' : '') + '" data-gwp-line="' + esc(l.measure) + '" data-gwp-status="' + esc(l.status) + '"><dt>' + esc(l.label) + '</dt><dd>' + statementHtml(l) +
      (meta ? '<span class="gwp-ms">' + esc(meta) + '</span>' : '') + '</dd></div>';
  }
  function v11Html(md, k) {
    const v = md.v11; if (!v) return '';
    const x = v.positions[k], ls = v.profile ? v.profile.lines[k] : [];
    return (x ? posHtml(x, v.peerGroup) : '') +
      (ls.length ? '<div class="gwp-v11" data-gwp-profile="' + k + '"><p class="gwp-k">Evidence profile</p><dl class="gwp-ml gwp-pf' + (ls.length === 1 ? ' gwp-pf--one' : '') + '">' + ls.map((l) => lineHtml(l, v.periods)).join('') + '</dl>' +
        ((k === 'S' || k === 'M') && v.profile.surrounding ? '<p class="gwp-ms" data-gwp-surrounding>' + esc(v.profile.surrounding) + '</p>' : '') + '</div>' : '') +
      (k === 'M' && v.yield ? yieldHtml(v.yield) : '') + (k === 'M' && v.income ? incomeHtml(v.income) : '');
  }
  // A dimension's headline from the r2 data alone (a page without V1 measures): its approved figures, formatted, with a short qualifier.
  // Price: the approved position; Resale: the observed rate (settling named); Infrastructure: MRT and supermarkets; Supply: recorded
  // new-launch competition (a quiet area named); Market: the observed change in surrounding resales. Never a rank, score or judgement.
  const lineOf = (v, k, ms) => (v.profile ? v.profile.lines[k].find((l) => l.measure === ms) : null) || null;
  const priceWhen = (x) => (x.period && Array.isArray(x.period.subject) && x.period.subject.length > 1 ? '12-month periods by bedroom type' : x.periodLabel);
  function headline11(v, k) {
    const x = v.positions[k];
    if (k === 'P' && x) return { main: pricePhrase(x), sub: x.bandLabel + ' · ' + priceWhen(x) };
    if (k === 'R' && x) {
      const c = (x.components || [])[0], l = lineOf(v, 'R', 'resale.sustained'), settling = !!(l && l.status === 'settling');
      if (c && isNum(c.value)) return { main: num(c.value, 1) + ' resales per 100 homes a year', sub: (settling ? 'Initial resale wave; sustained activity settling' : x.bandLabel) + ' · ' + x.periodLabel };
    }
    if (k === 'I') {
      const mrt = lineOf(v, 'I', 'infrastructure.mrt'), am = lineOf(v, 'I', 'infrastructure.amenities');
      const s = mrt && mrt.data && Array.isArray(mrt.data.stations) ? mrt.data.stations[0] : null;
      const a = s && s.name && isNum(s.distanceM) ? s.name + ' ' + metres(s.distanceM) : '', b = am && am.data && isNum(am.data.supermarketsWithin1km) ? plural(am.data.supermarketsWithin1km, 'supermarket') + ' within 1 km' : '';
      if (a || b) return { main: a && b && (a + ' · ' + b).length <= 66 ? a + ' · ' + b : a || b, sub: 'Straight-line distances' };
    }
    if (k === 'S') {
      const c = lineOf(v, 'S', 'supply.competition'), q = lineOf(v, 'S', 'supply.quietArea'), d = c && c.data;
      if (d && Array.isArray(d.sameClassSelling) && CLS[d.sameClass]) {
        const n = d.sameClassSelling.length, cls = CLS[d.sameClass];
        return { main: (n === 0 ? 'No other ' + cls + ' development' : plural(n, 'other ' + cls + ' development')) + ' sold new homes within 2 km',
          sub: period(c.period) + (q && q.data && q.data.flag === true ? ' · Quiet area' : '') };
      }
    }
    if (k === 'M') {
      const b = lineOf(v, 'M', 'market.backdrop'), d = b && b.data;
      if (d && isNum(d.changePct) && b.period && b.period.latest && b.period.prior) return { main: signed(d.changePct) + '% condo and EC resales within 2 km', sub: period(b.period.latest) + ' against ' + period(b.period.prior) };
    }
    // a dimension whose evidence is all missing (partial reports): its approved missing state, with the approved reason beneath it (the line's
    // own statement, "Not available: {reason}.", split as it is written)
    const ls = v.profile ? v.profile.lines[k] : [], gap = ls.length && ls.every((l) => l.status === 'not_available' || l.status === 'not_yet_assessed') ? ls[0] : null;
    if (gap) { const m = /^(Not available|Not yet assessed): (.+?)\.?$/.exec(gap.statement); if (m) return { main: m[1], sub: m[2] }; }
    return null;
  }
  // The five dimensions: one row each with its headline; each opens in place, directly beneath its own row (several may stay open);
  // closed on a first visit. Opened, a dimension shows ALL its approved measures, what it does not assess, and the evidence links.
  function dimsHtml(md) {
    return md.pillars.map((p) => {
      const add = v11Html(md, p.key), none = !p.metrics.length && !add, toPrices = !p.metrics.length && p.key === 'P' && hasRecords(md);
      // V1.1: a dimension without V1 measures (Price Position on a V1 page; every dimension on an evidence-profile page) takes its headline
      // from the approved r2 data; a dimension with V1 measures keeps its V1 headline
      const h = (!p.metrics.length && md.v11 && headline11(md.v11, p.key)) || headline(p);
      return '<section class="gwp-dim' + (none ? ' gwp-dim--none' : '') + '" id="gwp-' + p.key + '" data-gwp-pillar="' + p.key + '">' +
        '<h3 class="gwp-dimh"><button type="button" class="gwp-dimb" aria-expanded="false" aria-controls="gwpDim' + p.key + '" data-gwp-toggle="' + p.key + '">' +
        '<span class="gwp-pl" aria-hidden="true">' + p.key + '</span><span class="gwp-dn"><b>' + esc(p.name) + '</b><small>' + esc(QUESTION[p.key]) + '</small></span>' +
        '<span class="gwp-hl" data-gwp-headline><b>' + esc(h.main) + '</b>' + (h.sub ? '<small>' + esc(h.sub) + '</small>' : '') + '</span><i class="gwp-chev" aria-hidden="true"></i></button></h3>' +
        '<div class="gwp-dimp" id="gwpDim' + p.key + '" role="region" aria-labelledby="gwpDimL' + p.key + '" hidden><span class="gwp-sr" id="gwpDimL' + p.key + '">' + esc(p.name) + ' in detail</span>' +
        (none ? '<p class="gwp-fine">Not assessed in this report.' + (toPrices ? ' <a class="gwp-evl" href="#/p/' + esc(md.id) + '" data-gwp-evidence="lgTypes">See prices by size in Property Data <span aria-hidden="true">›</span></a>' : '') + '</p>' :
          (p.metrics.length ? '<dl class="gwp-ml">' + p.metrics.map((m) => metricRow(m, md)).join('') + '</dl>' : '') + add +
          (!p.metrics.length && toPrices ? '<p class="gwp-fine"><a class="gwp-evl" href="#/p/' + esc(md.id) + '" data-gwp-evidence="lgTypes">See prices by size in Property Data <span aria-hidden="true">›</span></a></p>' : '')) +
        (p.unpublished.length ? '<p class="gwp-fine gwp-un"><b>Not assessed in this report:</b> ' + esc(p.unpublished.join('; ')) + '.</p>' : '') + '</div></section>';
    }).join('');
  }
  function layersHtml(md) {
    const list = (kind, title, attr) => { const xs = md.hidden.filter((h) => h.kind === kind); return xs.length ? '<section class="gwp-sec gwp-box" ' + attr + '><p class="gwp-k">' + title + '</p><ul class="gwp-hc">' + xs.map((h) => '<li><p>' + esc(h.text) + '</p>' + (h.caveat ? '<small>' + esc(h.caveat) + '</small>' : '') + '</li>').join('') + '</ul></section>' : ''; };
    const H = list('connection', 'Hidden connections', 'data-gwp-hidden'), C = list('context', 'Supporting context', 'data-gwp-context');
    // "Explore sales by size": the development's own Property Data, at its sizes section (only where it has resales to show)
    const sizes = hasRecords(md) ? '<a class="gwp-sizes" href="#/p/' + esc(md.id) + '" data-gwp-evidence="lgTypes" data-gwp-sizes>Explore sales by size <span aria-hidden="true">›</span></a>' : '';
    const Q = md.question ? '<section class="gwp-sec gwp-box gwp-q" data-gwp-question><p class="gwp-k">Next buyer question</p><p>' + esc(md.question) + '</p>' + sizes + '</section>' : '';
    // with an r2 evidence profile: its approved rule (which states there is no overall score) and its comparison group, under the heading
    const pf = md.v11 && md.v11.profile, g = pf && pf.group;
    const intro = pf ? '<p class="gwp-fine">Each shows a key finding. Open any for its measures, dates and sources.</p><p class="gwp-fine" data-gwp-rule>' + esc(pf.rule) + '</p>' +
      (g && g.rule ? '<p class="gwp-fine" data-gwp-group>Comparison group: ' + esc(g.rule) + (isNum(g.developments) ? ' · ' + num(g.developments, 0) + ' developments' : '') + '.</p>' : '') :
      '<p class="gwp-fine">Each shows a key finding. Open any for its measures, dates and sources. PRISM gives no overall score.</p>';
    return (H || C || Q ? '<div class="gwp-two">' + H + C + Q + '</div>' : '') +
      '<section class="gwp-sec gwp-dims" aria-labelledby="gwpDimsH"><div class="gwp-sech"><div><h2 id="gwpDimsH">The five PRISM dimensions</h2>' + intro + '</div>' +
      '<p class="gwp-all"><button type="button" data-gwp-all="open">Expand all</button><span aria-hidden="true">/</span><button type="button" data-gwp-all="close">Collapse all</button></p></div><div class="gwp-ds">' + dimsHtml(md) + '</div></section>' + sourcesHtml(md);
  }
  function sourcesHtml(md) {
    const used = {}; Object.keys(md.metrics).forEach((k) => (md.metrics[k].sourceIds || []).forEach((s) => { used[s] = 1; }));
    const v = md.v11, u11 = {}, add = (ids) => (ids || []).forEach((s) => { u11[s] = 1; });
    if (v) {
      Object.keys(v.positions).forEach((k) => add(v.positions[k].sourceIds)); if (v.yield) add(v.yield.sourceIds); if (v.income) add(v.income.sourceIds);
      if (v.profile) Object.keys(v.profile.lines).forEach((k) => v.profile.lines[k].forEach((l) => add(l.sourceIds)));
    }
    const S = md.sources.filter((s) => used[s.id] || u11[s.id]).concat(v ? v.sources.filter((s) => u11[s.id] && !md.sources.some((x) => x.id === s.id)) : []);
    // what the V1.1 part adds, as it is present (a page may carry only some of it)
    const parts = v ? [Object.keys(v.positions).length ? 'peer positions' : '', v.profile ? 'evidence profile' : '', v.yield ? 'gross rental yield' : '', v.income ? 'household income' : ''].filter(Boolean) : [];
    const ura = v ? ym(v.periods.URA_TRANSACTIONS) || v.periods.URA_TRANSACTIONS || '' : '';
    return '<details class="gwp-d gwp-src" id="gwp-src" data-gwp-sources><summary><span class="gwp-pn">Sources, data periods and limits</span></summary><div class="gwp-din">' +
      '<ul class="gwp-sl">' + S.map((s) => '<li><b>' + esc(s.publisher) + '</b> · ' + esc(s.dataset) + (s.asAt ? ' · as at ' + esc(ym(s.asAt) || day(s.asAt) || s.asAt) : s.updated ? ' · updated ' + esc(day(s.updated) || s.updated) : s.accessed ? ' · accessed ' + esc(day(s.accessed) || s.accessed) : '') +
        (s.licence && s.licence.url ? ' · <a href="' + esc(s.licence.url) + '" target="_blank" rel="noopener">' + esc(s.licence.name) + '</a>' : s.licence ? ' · ' + esc(s.licence.name) : '') + (s.attribution ? '<small>' + esc(s.attribution) + '</small>' : '') + '</li>').join('') + '</ul>' +
      (md.limitations.length ? '<p class="gwp-fine"><b>Limits of this evidence</b></p><ul class="gwp-lim">' + md.limitations.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>' : '') +
      (md.mode === 'profile' ? '<p class="gwp-fine" data-gwp-v11-src>PRISM V1.1 · ' + esc(parts.join(', ')) + (ura ? ' · URA records to ' + esc(ura) : '') + '. Analysis and derived statistics by Groundwork; not endorsed by the data publishers.</p>' :
        '<p class="gwp-fine">PRISM V1 · records to ' + esc(ym(md.asOf) || md.asOf) + (md.approvedAt ? ' · published ' + esc(day(md.approvedAt)) : '') + '. Analysis and derived statistics by Groundwork; not endorsed by the data publishers.</p>' +
        (v ? '<p class="gwp-fine" data-gwp-v11-src>PRISM V1.1 additions (' + esc(parts.join(', ')) + ')' + (v.positions.P || v.positions.R || v.profile || v.yield ? ' · URA records to ' + esc(ura) : '') + (v.income ? ' · ' + esc(v.periods.SINGSTAT_GHS2025 || '') : '') + '.</p>' : '')) + '</div></details>';
  }
  // The PRISM Analysis view. o.site: the launch's own site { url } (a launch has no resale report); o.compare: offer Compare.
  function pageHtml(md, o) {
    const root = o.root || '../', A = md.assessment, back = o.backHref || '#/p/' + md.id, prof = md.mode === 'profile' && !A && !!(md.v11 && md.v11.profile);
    if (!A && !prof) return '';
    const calc = '<a class="lg-btn" href="' + esc(root) + 'tools/payment-planner/" data-gwp-calc>Calculate my purchase</a>';   // a clean start in the existing calculator: nothing is passed to it
    const acts = (o.site && o.site.url ? '<a class="lg-btn" href="' + esc(o.site.url) + '" target="_blank" rel="noopener" data-gwp-site>Open its site ↗</a>' : '') +
      (o.compare ? '<a class="lg-btn" href="#/compare/' + esc(md.id) + '" data-gwp-compare>Compare</a>' : '') + calc;
    const head = '<header class="gwp-head"><nav class="gwp-crumb" aria-label="Breadcrumb"><a href="#/">Research</a><span aria-hidden="true">›</span><span aria-current="page">' + esc(md.name) + '</span></nav>' +
      '<div class="gwp-ttl"><div class="gwp-ht"><h1 class="gwp-h1">' + esc(md.name) + '</h1>' + (md.meta.length ? '<p class="gwp-meta">' + esc(md.meta.join(' · ')) + '</p>' : '') + '</div><div class="gwp-acts">' + acts + '</div></div>' +
      switchHtml(md, 'prism', root) + '<img class="gwp-hero" src="' + esc(root) + 'assets/img/prism/prism-hero.svg" width="600" height="420" alt="" aria-hidden="true"></header>';
    const bar = '<nav class="gwp-bar2" aria-label="On this page" data-gwp-bar><div class="gwp-bar2-in"><button type="button" data-gwp-jump="sum" aria-current="true">Summary</button>' +
      md.pillars.map((p) => '<button type="button" data-gwp-jump="' + p.key + '"' + (p.metrics.length || v11Html(md, p.key) ? '' : ' class="dim"') + '><b>' + p.key + '</b> ' + SHORT[p.key] + '</button>').join('') + '<button type="button" data-gwp-jump="src">Sources</button></div></nav>';
    const next = '<section class="gwp-next" aria-label="Where next"><a class="gwp-nx" href="' + esc(back) + '" data-gwp-back><b>Property Data</b><span>' + (hasRecords(md) ? 'Prices, sales and rents for ' + esc(md.name) : 'Explore the numbers') + '</span></a>' +
      '<a class="gwp-nx" href="' + esc(root) + 'tools/payment-planner/" data-gwp-calc2><b>Calculate my purchase</b><span>Cash, CPF and the monthly instalment</span></a></section>';
    // An evidence-profile page (no approved verdict): the same page, with the five dimensions as its summary; nothing is written in a verdict's place
    const card = A ? '<article class="gwp-card gwp-open"><div class="gwp-v"><p class="gwp-vk">PRISM Verdict' + (A.verdict.scope ? ' · ' + esc(A.verdict.scope) : '') + '</p><h2 class="gwp-vh">' + esc(A.verdict.headline) + '</h2></div>' +
      '<div class="gwp-why"><h3>Why?</h3><ul>' + A.verdict.why.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul></div>' +
      (A.verdict.watchOut.length ? '<div class="gwp-wo"><span class="gwp-wi" aria-hidden="true">!</span><div><h3>What should I watch out for?</h3><ul>' + A.verdict.watchOut.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul></div></div>' : '') +
      '<div class="gwp-rvl">' + evidence(md) + '</div></article>' : (() => { const r = reveal11(md.v11), x = explain11(md.v11, md.name, r); return x ? explainHtml(x, r, md.id) : revealHtml(r); })();   // the buyer explanation (with the approved opening kept), or the opening alone   // a profile page: its r2 Reveal (or factual summary), never a verdict
    return '<div class="gwp-page' + (prof ? ' gwp-page--profile' : '') + '" data-gwp-page="' + esc(md.id) + '" data-gwp-mode="' + (prof ? 'profile' : 'assessment') + '"><div class="gwp-wrap">' + head + '</div>' + bar + '<div class="gwp-wrap">' +
      '<div id="gwp-sum" class="gwp-sumh"><div class="gwp-brand gwp-brand--sm">' + mark(root, 28) + '<p><b>PRISM</b> by Groundwork <span>· Five dimensions. One clearer property decision.</span></p></div></div>' +
      card + layersHtml(md) +
      '<p class="gwp-foot">From official records to ' + esc(ym(md.asOf) || md.asOf) + '. PRISM describes what the records show; it is not a valuation or a purchase recommendation.</p>' + next + '</div></div>';
  }

  /* ---------------------------------------------------------------- browser: load, verify, mount */
  const cache = { manifest: null, reports: {} };
  function hex(buf) { return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join(''); }
  function sha256(text) {
    const C = typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null;
    if (!C || typeof TextEncoder === 'undefined') return Promise.reject(new Error('no digest'));   // fail closed: never shown unverified
    return C.digest('SHA-256', new TextEncoder().encode(text)).then(hex);
  }
  function manifest(root) {
    if (!cache.manifest) {
      cache.manifest = fetch(root + DIR + 'manifest.json?v=' + MANIFEST_V).then((r) => { if (!r.ok) throw new Error('manifest ' + r.status); return r.json(); }).then(checkManifest);
      cache.manifest.catch(() => { cache.manifest = null; });
    }
    return cache.manifest;
  }
  // The model for one development, or null (not in either release, or anything failed a check). A V1 report with an approved Reveal +
  // Verdict is its assessment page (with its r2 supplement when that passes); otherwise an approved r2 evidence profile is the page.
  function load(root, id) {
    if (!/^[a-z0-9-]{1,80}$/.test(String(id || ''))) return Promise.resolve(null);
    if (cache.reports[id]) return cache.reports[id];
    const p = manifest(root).then((m) => {
      const e = m.reports.find((x) => x.id === id);
      const v1 = e ? fetch(root + DIR + e.path + '?v=' + e.sha256.slice(0, 10)).then((r) => { if (!r.ok) throw new Error('report ' + r.status); return r.text(); })
        .then((t) => sha256(t).then((h) => { if (h !== e.sha256) throw new Error('report: sha256 does not match the manifest'); return model(checkReport(JSON.parse(t), e), m); })) : Promise.resolve(null);
      return v1.then((md) => load11(root, id, e, m).then((v) => compose(md, v)));
    }).catch(() => null);
    cache.reports[id] = p; p.then((x) => { if (x === null) delete cache.reports[id]; });
    return p;
  }
  // V1 model + r2 model -> the page model. page: true when there is a PRISM page to show (mode 'assessment' or 'profile').
  function compose(md, v) {
    if (md && md.assessment) { md.v11 = v; md.page = true; md.mode = 'assessment'; return md; }
    if (v && v.profile && hasEvidence(v)) {
      const g = v.profile.group || v.peerGroup || {};
      return { id: v.id, name: v.name, subject: md ? md.subject : null, meta: md && md.meta.length ? md.meta : [g.marketSegment, CLASS_NAME[g.propertyClass]].filter(Boolean),
        assessment: null, hidden: [], question: null, pillars: PILLARS.map(([key, name]) => ({ key, name, metrics: [], unpublished: [] })), metrics: {}, count: 0,
        sources: [], limitations: [], asOf: v.periods.URA_TRANSACTIONS, approvedAt: null, periodsBySource: v.periods, v11: v, page: true, mode: 'profile' };
    }
    if (md) { md.v11 = null; md.page = false; }   // a V1 report without an assessment and without an approved profile: no page, as in V1
    return md;
  }
  const hasPage = (md) => !!(md && md.page);
  // a profile page needs evidence to show: an approved peer position, or a profile line that is available, partial or settling (a report whose
  // every line is "not available" / "not yet assessed" gets no page; its Property Data is unchanged)
  function hasEvidence(v) {
    if (Object.keys(v.positions || {}).length) return true;
    return PILLARS.some(([k]) => (v.profile.lines[k] || []).some((l) => l.status === 'available' || l.status === 'partial' || l.status === 'settling'));
  }
  // D5 loading: the root index (pinned by sha256), then only the shard this development needs (the first hex digit of sha256(its id), pinned by
  // the root; every id in it re-checked against its key), then only its report (pinned by the shard). Each is fetched once per visit. A V1.1
  // report that supplements a V1 report pairs with that exact approved V1 report; a V1.1-only report must not be a V1 development.
  const getText = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.text(); });
  const idKey = (id) => sha256(id).then((h) => h.charAt(0));
  let idx11 = null; const shards11 = {};
  function index11(root) {
    if (!idx11) { idx11 = getText(root + V11.DIR + 'index.json?v=' + V11.INDEX.slice(0, 10)).then((t) => sha256(t).then((h) => { if (h !== V11.INDEX) throw new Error('v1.1 index: not the approved file'); return checkIndex(JSON.parse(t)); }));
      idx11.catch(() => { idx11 = null; }); }
    return idx11;
  }
  function shard11(root, ix, key) {
    if (!shards11[key]) {
      const e = ix.shards.find((x) => x.key === key);
      shards11[key] = getText(root + V11.DIR + e.path + '?v=' + e.sha256.slice(0, 10)).then((t) => sha256(t).then((h) => {
        if (h !== e.sha256) throw new Error('v1.1 shard: sha256');
        const sh = checkShard(JSON.parse(t), e);
        return Promise.all(sh.entries.map((r) => idKey(r.id))).then((ks) => { if (ks.some((k) => k !== key)) throw new Error('v1.1 shard: an id in the wrong shard'); return sh; });
      }));
      shards11[key].catch(() => { delete shards11[key]; });
    }
    return shards11[key];
  }
  const entry11 = (root, id) => index11(root).then((ix) => idKey(id).then((k) => shard11(root, ix, k))).then((sh) => sh.entries.find((x) => x.id === id) || null);
  function load11(root, id, e1, v1) {
    return entry11(root, id).then((f) => {
      if (!hasReport(f)) return null;   // pending, unavailable, new launch, redirect: as an id without a report
      return getText(root + V11.DIR + f.path + '?v=' + f.sha256.slice(0, 10)).then((t) => sha256(t).then((h) => {
        if (h !== f.sha256) throw new Error('v1.1 report: sha256');
        const r = JSON.parse(t), only = r.supplementsV1Report === null;
        if (only ? !!e1 : !e1) throw new Error('v1.1 report: V1 pairing');
        if (!only) checkPair(v1, e1);
        const v = model11(checkReport11(r, f, only), f); if (v) { v.periods = V11.PERIODS; v.curated = isCurated(f); } return v;
      }));
    }).catch(() => null);
  }
  // a redirect entry: the id it names, only when that id has a page of its own (one hop: a redirect to a redirect has no page, so it is not
  // followed); anything else, or any failure: null
  function redirect11(root, id) {
    if (!ID.test(String(id || ''))) return Promise.resolve(null);
    return entry11(root, id).then((f) => (f && f.state === 'redirect' ? load(root, f.to).then((md) => (hasPage(md) ? f.to : null)) : null)).catch(() => null);
  }
  const settled = {};   // id -> model (or null) once loaded, so a page redraw can place the PRISM parts without waiting
  const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* private mode */ } }, del: (k) => { try { sessionStorage.removeItem(k); } catch (e) { /* */ } } };
  const offsetTo = (el, extra) => { const y = el.getBoundingClientRect().top + window.scrollY - extra; window.scrollTo(0, Math.max(0, y)); };
  // Property Data (the existing report or launch page): the tabs under the name, one compact verdict line, and on each section whose
  // evidence a published PRISM dimension reads, a link back to that dimension
  function mountPreview(app, id, o) {
    const root = o.root || '../';
    const place = (md) => {
      if (!hasPage(md) || (o.still && !o.still())) return;
      app.querySelectorAll('[data-gwp-preview], [data-gwp-switch], [data-gwp-back2]').forEach((x) => x.remove());
      const hero = app.querySelector(o.after || 'header.lg-hero'); if (!hero) return;
      if (md.assessment) hero.insertAdjacentHTML('afterend', previewHtml(md, root));   // an evidence-profile page has no verdict line: its tab is the way in
      const nameAt = hero.querySelector('.lg-id') || hero.querySelector('h1');
      if (nameAt) nameAt.insertAdjacentHTML('afterend', switchHtml(md, 'data', root));
      // back-links: only to dimensions with published measures read from that section
      const secs = {}; Object.keys(md.metrics).forEach((mid) => { const e = evidenceOf(mid); if (e) { const k = mid.charAt(0) === 'N' ? 'M' : mid.charAt(0); secs[e.sec] = secs[e.sec] || k; } });
      if (hasRecords(md)) Object.keys(secs).forEach((sec) => {
        const head = app.querySelector('#' + sec + ' .gwr-head, #' + sec + ' .lg-head'); if (!head) return;
        const k = secs[sec], name = (PILLARS.find((x) => x[0] === k) || [])[1];
        head.insertAdjacentHTML('beforeend', '<a class="gwp-back2" href="#/prism/' + esc(md.id) + '/' + k.toLowerCase() + '" data-gwp-back2="' + k + '">' + mark(root, 18) + '<span>PRISM · ' + esc(name) + ' ›</span></a>');
      });
      app.querySelectorAll('[data-gwp-open], [data-gwp-back2], [data-gwp-switch] [data-gwp-view="prism"]').forEach((a) => a.addEventListener('click', () => { ss.set('gw.prism.from', id); }));
      const goto = ss.get('gw.prism.goto');
      if (goto && goto.indexOf(id + ':sec:') === 0) { ss.del('gw.prism.goto'); const el = app.querySelector('#' + goto.slice((id + ':sec:').length)); if (el) { el.scrollIntoView({ block: 'start' }); return; } }
      if (ss.get('gw.prism.from') === id && o.returning) { const s = app.querySelector('[data-gwp-preview]'); if (s) s.scrollIntoView({ block: 'center' }); ss.del('gw.prism.from'); }
    };
    if (id in settled) { place(settled[id]); return Promise.resolve(settled[id]); }
    return load(root, id).then((md) => { settled[id] = md; place(md); return md; });
  }
  function show(app, id, o) {
    return load(o.root || '../', id).then((md) => {
      if (o.still && !o.still()) return md;
      if (!hasPage(md)) {
        // a Registry v2 redirect: #/prism/<id> becomes #/prism/<to> (replacing the address, not adding to the history) when <to> has a page
        return redirect11(o.root || '../', id).then((to) => { if (o.still && !o.still()) return null; if (to) location.replace('#/prism/' + to); else if (o.fallback) o.fallback(); return null; });
      }
      settled[id] = md;
      document.title = 'PRISM · ' + md.name + ' — Research — Groundwork';
      app.innerHTML = pageHtml(md, o);
      // evidence links: the development's Property Data, at the section that holds the evidence
      app.querySelectorAll('[data-gwp-evidence]').forEach((a) => a.addEventListener('click', () => ss.set('gw.prism.goto', id + ':sec:' + a.dataset.gwpEvidence)));
      // the dimensions: each opens and closes on its own; the open ones are remembered for this visit (Back/Forward and Property Data
      // round trips return to the same state); a first visit opens none
      const key = 'gw.prism.open:' + id, rows = Array.from(app.querySelectorAll('[data-gwp-toggle]'));
      let full = false;
      const setOpen = (k, on) => { const b = app.querySelector('[data-gwp-toggle="' + k + '"]'), p = b && app.querySelector('#' + b.getAttribute('aria-controls')); if (!p) return; p.hidden = !on; b.setAttribute('aria-expanded', String(on)); b.closest('.gwp-dim').classList.toggle('open', on); };
      const save = () => ss.set(key, rows.filter((b) => b.getAttribute('aria-expanded') === 'true').map((b) => b.dataset.gwpToggle).join(','));
      const opened = () => { if (!full && o.track) { full = true; o.track('full'); } };
      rows.forEach((b) => b.addEventListener('click', () => { const on = b.getAttribute('aria-expanded') !== 'true'; setOpen(b.dataset.gwpToggle, on); save(); if (on) opened(); }));
      app.querySelectorAll('[data-gwp-all]').forEach((b) => b.addEventListener('click', () => { const on = b.dataset.gwpAll === 'open'; rows.forEach((r) => setOpen(r.dataset.gwpToggle, on)); save(); if (on) opened(); }));
      (ss.get(key) || '').split(',').filter((k) => /^[PRISM]$/.test(k)).forEach((k) => setOpen(k, true));
      const src = app.querySelector('[data-gwp-sources]'); if (src) src.addEventListener('toggle', () => { if (src.open) opened(); });
      // print: every dimension in full (the page's printed copy is the whole report)
      const beforePrint = () => rows.forEach((r) => { const p = app.querySelector('#' + r.getAttribute('aria-controls')); if (p) p.setAttribute('data-gwp-print', p.hidden ? '1' : ''); });
      window.addEventListener('beforeprint', beforePrint);
      // the section bar: Summary and Sources move within the page; P/R/I/S/M open that dimension and move to it (the address is not changed)
      const bar = app.querySelector('[data-gwp-bar]'), navH = () => (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gw-navh')) || 58) + (bar ? bar.offsetHeight : 0) + 10;
      const target = (k) => app.querySelector(k === 'sum' ? '#gwp-sum' : k === 'src' ? '#gwp-src' : '#gwp-' + k);
      const go = (k) => { const t = target(k); if (!t) return; if (k === 'src' && !t.open) t.open = true; if (/^[PRISM]$/.test(k)) { setOpen(k, true); save(); opened(); } offsetTo(t, navH()); };
      app.querySelectorAll('[data-gwp-xjump]').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); go(a.dataset.gwpXjump); }));   // explanation figures: open that dimension, in place
      if (bar) {
        bar.querySelectorAll('[data-gwp-jump]').forEach((b) => b.addEventListener('click', () => go(b.dataset.gwpJump)));
        const mark2 = () => { let cur = 'sum'; ['sum', 'P', 'R', 'I', 'S', 'M', 'src'].forEach((k) => { const t = target(k); if (t && t.getBoundingClientRect().top - navH() < 40) cur = k; });
          bar.querySelectorAll('[data-gwp-jump]').forEach((b) => { const on = b.dataset.gwpJump === cur; if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); if (on && bar.scrollWidth > bar.clientWidth) { const r = b.getBoundingClientRect(), br = bar.getBoundingClientRect(); if (r.left < br.left || r.right > br.right) bar.querySelector('.gwp-bar2-in').scrollLeft += r.left - br.left - 16; } }); };
        let raf = 0; const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(mark2); };
        window.addEventListener('scroll', onScroll, { passive: true });
        const stop = () => { if (!app.contains(bar)) { window.removeEventListener('scroll', onScroll); window.removeEventListener('hashchange', stop); window.removeEventListener('beforeprint', beforePrint); } }; window.addEventListener('hashchange', stop);
      }
      // a link to one dimension (#/prism/<id>/<p|r|i|s|m>, e.g. from Property Data): that dimension, opened
      if (o.dim && /^[PRISM]$/.test(o.dim)) requestAnimationFrame(() => go(o.dim));
      // Back to Property Data: the browser's own Back when the visitor came from it (it keeps its place), otherwise its address
      app.querySelectorAll('[data-gwp-back]').forEach((a) => a.addEventListener('click', (ev) => {
        if (ss.get('gw.prism.from') === id && o.cameFromReport && o.cameFromReport()) { ev.preventDefault(); history.back(); }
      }));
      if (o.track) o.track('open');
      return md;
    });
  }

  /* ---------------------------------------------------------------- Research's own search leads with PRISM (never the global search) */
  // A launch with its own site in the search results ("Has its own site"): its PRISM Analysis leads, before "Open its site"
  function leadSites(box, o) {
    box.querySelectorAll('.v2-site a[data-kpt-ms]').forEach((a) => {
      const id = a.getAttribute('data-kpt-ms'), card = a.closest('.v2-site');
      if (!card || card.querySelector('[data-gwp-sitelead]')) return;
      load(o.root || '../', id).then((md) => {
        if (!md || !md.assessment || !card.isConnected || card.querySelector('[data-gwp-sitelead]')) return;
        a.insertAdjacentHTML('beforebegin', '<a class="v2-btn pri gwp-sitego" href="#/prism/' + esc(md.id) + '" data-gwp-sitelead>PRISM Analysis ›</a>');
        a.classList.remove('pri');
        card.insertAdjacentHTML('beforeend', '<p class="gwp-sitev"><span class="gwp-k">PRISM Reveal</span> ' + esc(md.assessment.verdict.headline) + '</p>');
      });
    });
  }

  /* ---------------------------------------------------------------- the Research landing: what PRISM is, compactly */
  const ICON = {
    P: '<path d="M5 20V14M10 20V9M15 20V12M20 20V5"/>', R: '<path d="M4 17l5-5 4 3 7-8"/><path d="M15 7h5v5"/>',
    I: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>', S: '<path d="M12 4l9 4.5-9 4.5-9-4.5z"/><path d="M3 13l9 4.5 9-4.5"/>',
    M: '<circle cx="8" cy="9" r="3"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M3 20c.6-3.3 2.6-5 5-5s4.4 1.7 5 5M13.5 17c.5-1.6 1.6-2.6 3-2.6 1.9 0 3.2 1.4 3.5 4"/>'
  };
  const QUESTION = {   // Ken's wording, 31 Oct 2026
    P: 'Am I paying a reasonable price compared with relevant alternatives?', R: 'What evidence suggests future buyers could find this property attractive?',
    I: 'What nearby amenities and upcoming changes matter?', S: 'How much competition could this property face?', M: 'What does actual transaction activity tell us about market demand?'
  };
  const ico = (k) => '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + ICON[k] + '</svg>';
  // The landing (Ken, 31 Oct 2026): the one search is the action; PRISM is explained beside it (education, not navigation); the developments
  // with a PRISM report are offered as plain links under the search, read from the release.
  function landingHtml(root) {
    return '<section class="gwp-land" data-gwp-land aria-labelledby="gwpLandH"><div class="gwp-intro"><img class="gwp-imotif" src="' + esc(root) + 'assets/img/prism/prism-hero.svg" width="600" height="420" alt="" aria-hidden="true">' + brand(root) +
      '<p class="gwp-ilead"><b>The bigger picture behind the numbers.</b> Five dimensions help you understand price, resale, location, supply and demand, with the evidence to explain why.</p>' +
      '<h3 id="gwpLandH">Five questions every property buyer should consider</h3><ul class="gwp-qs">' +
      PILLARS.map(([k, n]) => '<li><span class="gwp-qi">' + ico(k) + '</span><span><b>' + esc(n) + '</b><span>' + esc(QUESTION[k]) + '</span></span></li>').join('') + '</ul></div></section>';
  }
  const PICKS_MAX = 5;
  // the curated V1.1 reports approved before the nationwide batch (A1/A2), after the V1 release's own: shown only when their shard marks them
  // curated (profile "approved"). Every other development is found through the search.
  const CURATED = ['hundred-palms-residences', 'the-quinn'];
  function mountLanding(home, o) {
    const root = o.root || '../';
    if (!home.querySelector('[data-gwp-land]')) { const at = home.querySelector(o.after); if (at) at.insertAdjacentHTML('afterend', landingHtml(root)); }
    { const sb0 = home.querySelector('#sb'), hint = home.querySelector('#lgCount'); if (sb0 && hint && sb0.nextElementSibling !== hint) sb0.insertAdjacentElement('afterend', hint); }   // "If several match…" belongs to the box
    if (!home.querySelector('[data-gwp-picks]')) {
      const sb = home.querySelector(o.picksAfter || '#lgCount'); if (!sb) return;
      sb.insertAdjacentHTML('afterend', '<div class="gwp-picks" data-gwp-picks hidden><p class="gwp-pk">' + mark(root, 22) + '<span>Explore a PRISM report</span></p><div class="gwp-pl2" data-gwp-picklist></div></div>');
      const box = home.querySelector('[data-gwp-picks]');
      // the developments with a PRISM page, in release order (the V1 release's, then the V1.1-only entries), at most PICKS_MAX: the landing
      // never loads the whole release (nationwide: thousands of reports); every other development is found through the search
      manifest(root).then((m) => Promise.all(m.reports.map((r) => r.id).concat(CURATED).filter((id, i, a) => a.indexOf(id) === i).slice(0, PICKS_MAX).map((id) => load(root, id)))).then((ms) => {
        const ok = ms.filter((x) => hasPage(x) && (x.mode === 'assessment' || (x.v11 && x.v11.curated))); if (!ok.length) return;
        box.querySelector('[data-gwp-picklist]').innerHTML = ok.map((x) => '<a class="gwp-chip" href="#/prism/' + esc(x.id) + '" data-gwp-open-id="' + esc(x.id) + '">' + esc(x.name) + ' <span aria-hidden="true">›</span></a>').join('');
        box.hidden = false;
      }).catch(() => {});
    }
  }

  return { itemsOk, redirect11, hasReport, isCurated, explain11, explainHtml, XT, PICKS_MAX, CURATED, hasEvidence, REVEAL, ES, reveal11, revealHtml, V11, PANELS, checkIndex, checkShard, checkPair, checkReport11, model11, compose, hasPage, headline11, lineHtml, posHtml, yieldHtml, incomeHtml, v11Html, VERSION, switchHtml, leadSites, layersHtml, dimsHtml, evidenceOf, headline, landingHtml, mountLanding, QUESTION, SCHEMA, DIR, MANIFEST_V, PILLARS, checkManifest, checkReport, approved, shown, model, value, detail, period, evidence, previewHtml, pageHtml, load, mountPreview, show, _cache: cache, _settled: settled };
});
