#!/usr/bin/env node
/* ==========================================================================
   Layout rows from brochure PAGES with word positions: text PDFs (pdftotext -bbox) or scanned ones (tesseract TSV).
   Handles side-by-side floor plans, "Area: 484 sqft | 45 sqm", "45 sq m / 484 sq ft", "STRATA SFA : 43 sqm", "inclusive of 16 sq m PES"
   lines (never taken as the total), page headings that carry the bedroom count, and common OCR slips in type codes (AlP -> A1P).

     pdftotext -bbox brochure.pdf b.html
     node tools/market-data/extract-positioned.js --bbox b.html --project "URA NAME" --source <id>          > draft.csv
     node tools/market-data/extract-positioned.js --tsv <folder of tesseract p*.tsv> --project "URA NAME" --source <id> > draft.csv

   Each "Type X" label takes the nearest area BELOW it in the same column, and the nearest bedroom words at or above it in the same column
   (else the page's only bedroom heading). Nothing missing is guessed: a row without a bedroom count or an area says so and stays a draft.
   Rows come out with status "draft"; validate-layouts.js checks them against URA's recorded sizes before anyone promotes them.
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const X = require('./extract-layouts.js');
const WORDS = { studio: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

/* ---------- pages of words ---------- */
// pdftotext -bbox output -> [{w, h, words:[{x0,y0,x1,y1,t}]}]
function fromBbox(html) {
  const pages = [];
  String(html).split(/<page\b/).slice(1).forEach((chunk) => {
    const w = Number((/width="([\d.]+)"/.exec(chunk) || [])[1]) || 600, h = Number((/height="([\d.]+)"/.exec(chunk) || [])[1]) || 800, words = [];
    const re = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g; let m;
    while ((m = re.exec(chunk))) words.push({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], t: decode(m[5]) });
    pages.push({ w, h, words });
  });
  return pages;
}
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
// tesseract TSV (one file per page) -> same shape; low-confidence fragments are kept (codes are often low confidence) but empty ones dropped
function fromTsv(text) {
  const rows = String(text).split(/\r?\n/).slice(1).map((l) => l.split('\t')).filter((c) => c.length >= 12);
  const pg = rows.find((c) => c[0] === '1'), w = pg ? +pg[8] : 1240, h = pg ? +pg[9] : 1754;
  const words = rows.filter((c) => c[0] === '5' && c[11] && c[11].trim()).map((c) => ({ x0: +c[6], y0: +c[7], x1: +c[6] + +c[8], y1: +c[7] + +c[9], t: c[11].trim() }));
  return { w, h, words };
}

/* ---------- lines ---------- */
// Words -> lines: same baseline (vertical overlap) and a small horizontal gap. Columns stay apart because the gap between them is large.
function lines(page) {
  // 1. rows: words whose vertical extents overlap by at least a third of the smaller (a large numeral beside small capitals still joins)
  const ws = page.words.slice().sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1)), rows = [];
  ws.forEach((w) => {
    const h = w.y1 - w.y0, ov = (r) => (Math.min(r.y1, w.y1) - Math.max(r.y0, w.y0)) / Math.max(1, Math.min(r.y1 - r.y0, h));
    const r = rows.find((q) => ov(q) >= 0.33);
    if (r) { r.ws.push(w); r.y0 = Math.min(r.y0, w.y0); r.y1 = Math.max(r.y1, w.y1); } else rows.push({ y0: w.y0, y1: w.y1, ws: [w] });
  });
  // 2. within a row, left to right; a wide gap starts a new line (side-by-side plans stay apart)
  const out = [], gapMax = page.w * 0.03;
  rows.forEach((r) => {
    r.ws.sort((a, b) => a.x0 - b.x0); let cur = null;
    r.ws.forEach((w) => {
      const h = Math.max(w.y1 - w.y0, cur ? cur.y1 - cur.y0 : 0);
      if (cur && w.x0 - cur.x1 <= Math.max(gapMax, h * 1.6)) { cur.words.push(w); cur.x1 = Math.max(cur.x1, w.x1); cur.y0 = Math.min(cur.y0, w.y0); cur.y1 = Math.max(cur.y1, w.y1); }
      else { cur = { x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1, words: [w] }; out.push(cur); }
    });
  });
  out.forEach((l) => { l.text = l.words.map((w) => w.t).join(' '); l.xc = (l.x0 + l.x1) / 2; l.yc = (l.y0 + l.y1) / 2; });
  return out.sort((a, b) => a.yc - b.yc || a.x0 - b.x0);
}

/* ---------- what a line says ---------- */
// OCR slips inside a code: a lower-case l or upper-case I/O between letters and digits.
function fixCode(c) {
  let s = c.replace(/[^A-Za-z0-9()\-\/]/g, '');
  s = s.replace(/^([A-Z]{1,2})[lI|]/, '$11').replace(/^([A-Z]{1,2})O(?=\d|$)/, '$10');
  s = s.replace(/(\d)[lI|]/g, '$11').replace(/(\d)O/g, '$10');
  return s;
}
const RE = {
  type: /\b(?:TYPE|Type)\s*[:\-]?\s*([A-Z][A-Za-z0-9()\-\/|]{0,9})/g,
  sqm: /(\d{2,4}(?:[.,]\d+)?)\s*(?:sq\.?\s?m(?:etres?)?\b|sqm\b|m2\b|m²)/ig,
  sqft: /(\d{1,2},\d{3}|\d{3,5}(?:\.\d+)?)\s*(?:sq\.?\s?ft\b|sqft\b|ft2\b|ft²|sf\b)/ig,
  incl: /\b(incl|inclusive|includ)/i,
  beds: /\b(\d|one|two|three|four|five|six)\s*[- ]?\s*(?:bedroom|bed|br|bdr)s?\b/i,
};
function findings(page) {
  const L = lines(page), types = [], areas = [], beds = [];
  L.forEach((l) => {
    let m; RE.type.lastIndex = 0;
    while ((m = RE.type.exec(l.text))) {
      // one plan can carry several codes ("A1/A2", "B1a/B1b/B1p"): each becomes its own row with the same area
      const frac = m.index / Math.max(1, l.text.length), x = l.x0 + frac * (l.x1 - l.x0);
      fixCode(m[1]).split('/').filter(Boolean).forEach((code) => { if (!/^[A-Z]{1,3}\d/.test(code) && !/^[A-Z]{1,3}$/.test(code)) return; types.push({ code, raw: m[1], x, y: l.yc, line: l }); });
    }
    if (RE.incl.test(l.text)) return;   // "inclusive of 16 sq m PES": a part, never the total
    const sqm = []; RE.sqm.lastIndex = 0; while ((m = RE.sqm.exec(l.text))) sqm.push(m[1].replace(',', '.'));
    const sqft = []; RE.sqft.lastIndex = 0; while ((m = RE.sqft.exec(l.text))) sqft.push(m[1].replace(',', ''));
    if (sqm.length || sqft.length) {
      // one line can hold two layouts' areas side by side: split by position when there are two of each
      const n = Math.max(sqm.length, sqft.length);
      for (let i = 0; i < n; i++) areas.push({ sqm: sqm[i] || '', sqft: sqft[i] || '', x: l.x0 + ((i + 0.5) / n) * (l.x1 - l.x0), y: l.yc, line: l });
    }
    const b = RE.beds.exec(l.text);
    if (b || /\bstudio\b/i.test(l.text)) beds.push({ bedrooms: b ? (/^\d$/.test(b[1]) ? +b[1] : WORDS[b[1].toLowerCase()]) : 0, variant: X.variantOf(l.text), x: l.xc, y: l.yc, text: l.text });
  });
  return { types, areas, beds };
}

/* ---------- pairing ---------- */
function pairPage(page) {
  const F = findings(page), W = page.w, H = page.h, used = new Set(), out = [];
  const pairs = [];
  F.types.forEach((t, ti) => F.areas.forEach((a, ai) => {
    const dy = a.y - t.y, dx = Math.abs(a.x - t.x);
    if (dy < -H * 0.01 || dy > H * 0.3 || dx > W * 0.28) return;   // below the label (or on its line), in its column
    pairs.push({ ti, ai, cost: Math.max(dy, 0) + 2 * dx });
  }));
  pairs.sort((p, q) => p.cost - q.cost);
  // codes printed on one label ("A1/A2") share one area: pair the label once, then give its area to every code on it
  const labelOf = (t) => t.line.x0 + ':' + t.line.y0 + ':' + t.raw, tUsed = new Set(), lUsed = new Set();
  pairs.forEach((p) => { const t = F.types[p.ti], k = labelOf(t); if (tUsed.has(p.ti) || lUsed.has(k) || used.has(p.ai)) return; lUsed.add(k); used.add(p.ai); F.types.forEach((u, ui) => { if (labelOf(u) === k) { tUsed.add(ui); u.area = F.areas[p.ai]; } }); });
  F.types.forEach((t) => {
    // bedroom words: nearest at or above the label in its column; else the page's only bedroom heading
    let best = null;
    F.beds.forEach((b) => { const dy = t.y - b.y, dx = Math.abs(b.x - t.x); if (dy < -H * 0.02 || dx > W * 0.35) return; const c = Math.abs(dy) + 2 * dx; if (!best || c < best.c) best = { c, b }; });
    const uniq = Array.from(new Set(F.beds.map((b) => b.bedrooms)));
    const bd = best ? best.b : uniq.length === 1 ? F.beds[0] : null;
    const variant = X.variantOf(t.line.text + ' ' + (bd ? bd.text : '')) || (/-?P$|PH/.test(t.code) && /penthouse/i.test(bd ? bd.text : '') ? 'penthouse' : '');
    const notes = []; if (!t.area) notes.push('area not found'); if (!bd) notes.push('bedrooms not found'); if (t.raw !== t.code) notes.push('code read as "' + t.raw + '"');
    out.push({ code: t.code, bedrooms: bd ? bd.bedrooms : null, variant, sqm: t.area ? t.area.sqm : '', sqft: t.area ? t.area.sqft : '', note: notes.join('; ') });
  });
  return out;
}
// All pages -> one row per code (first complete reading wins; conflicting complete readings are both reported).
function extractPages(pages) {
  const seen = new Map(), out = [];
  pages.forEach((p, i) => pairPage(p).forEach((r) => {
    r.page = i + 1;
    const prev = seen.get(r.code);
    if (!prev) { seen.set(r.code, r); out.push(r); return; }
    const complete = (x) => x.bedrooms != null && (x.sqm || x.sqft);
    if (!complete(prev) && complete(r)) { Object.assign(prev, r); return; }
    if (complete(prev) && complete(r) && (prev.sqm !== r.sqm || prev.bedrooms !== r.bedrooms) && !(prev.note || '').includes('differs')) prev.note = (prev.note ? prev.note + '; ' : '') + 'differs on page ' + r.page + ' (' + r.bedrooms + ' bedrooms, ' + (r.sqm || r.sqft) + ')';
  }));
  return out;
}
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function toCsv(rows, project, source, status) {
  return rows.map((r) => [project, r.code, r.bedrooms == null ? '' : r.bedrooms, r.variant, r.sqm, r.sqft, source, status || 'draft', (r.note ? 'CHECK: ' + r.note + '; ' : '') + 'auto-extracted, page ' + r.page].map(csvCell).join(',')).join('\n');
}
function loadPages(o) {
  if (o.bbox) return fromBbox(fs.readFileSync(o.bbox, 'utf8'));
  if (o.tsv) return fs.readdirSync(o.tsv).filter((f) => /^p\d+\.tsv$/.test(f)).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1))).map((f) => fromTsv(fs.readFileSync(path.join(o.tsv, f), 'utf8')));
  return [];
}

/* ---------- unit distribution charts (stack charts): a row of type codes with a row of areas beneath ---------- */
// Returns Map(code -> {sqm: most frequent value, values: {value: count}}). Areas in a chart are sqm unless the chart says sq ft.
const CODE_TOKEN = /^[A-Z]{1,3}\d{0,2}[a-zA-Z]{0,3}$/, NUM_TOKEN = /^\d{2,4}(?:\.\d)?$/;
function stackChart(pages) {
  const out = new Map();
  pages.forEach((page) => {
    const L = lines(page).map((l) => ({ l, codes: l.words.filter((w) => CODE_TOKEN.test(w.t) && /\d|^[A-Z]{1,3}$|^[A-Z]{1,2}[a-z]$/.test(w.t)), nums: l.words.filter((w) => NUM_TOKEN.test(w.t) && +w.t >= 20 && +w.t <= 2000) }));
    // a row is a whole visual row: merge lines on the same baseline (a chart spans the page width)
    const rows = []; L.forEach((x) => { const r = rows.find((q) => Math.abs(q.yc - x.l.yc) < (x.l.y1 - x.l.y0) * 0.6); if (r) { r.codes = r.codes.concat(x.codes); r.nums = r.nums.concat(x.nums); r.other += x.l.words.length - x.codes.length - x.nums.length; } else rows.push({ yc: x.l.yc, h: x.l.y1 - x.l.y0, codes: x.codes.slice(), nums: x.nums.slice(), other: x.l.words.length - x.codes.length - x.nums.length }); });
    rows.sort((a, b) => a.yc - b.yc);
    rows.forEach((r, i) => {
      if (r.codes.length < 3 || r.codes.length < r.other) return;
      // a cell can hold its code and its area on one line ("B1P 99 C4P 147"): then the area is in the same row; otherwise in the row beneath
      const inRow = r.nums.length >= Math.min(3, r.codes.length) && Math.abs(r.nums.length - r.codes.length) <= Math.max(1, r.codes.length * 0.2);
      const below = inRow ? r : rows.slice(i + 1, i + 3).find((q) => q.nums.length >= Math.min(3, r.codes.length) && q.yc - r.yc < r.h * 4);
      if (!below) return;
      r.codes.forEach((c) => {
        const cx = (c.x0 + c.x1) / 2, n = below.nums.slice().sort((a, b) => Math.abs((a.x0 + a.x1) / 2 - cx) - Math.abs((b.x0 + b.x1) / 2 - cx))[0];
        if (!n || Math.abs((n.x0 + n.x1) / 2 - cx) > Math.max(c.x1 - c.x0, n.x1 - n.x0) * 1.5) return;
        const code = fixCode(c.t), e = out.get(code) || out.set(code, { values: {} }).get(code); e.values[n.t] = (e.values[n.t] || 0) + 1;
      });
    });
  });
  out.forEach((e) => { e.sqm = Object.keys(e.values).sort((a, b) => e.values[b] - e.values[a])[0]; e.consistent = Object.keys(e.values).length === 1; });
  return out;
}

/* ---------- bedroom counts from floor-plan titles ("Thomson Three 2 Bedroom Type B1a/B1b/B1p Floor Plan") ---------- */
function titleBedrooms(text) {
  const out = new Map(), W = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  String(text).replace(/<[^>]+>/g, ' ').split(/(?=\b(?:\d|one|two|three|four|five|six)[\s-]*bed(?:room)?s?\b)/i).forEach((seg) => {
    const m = /^(\d|one|two|three|four|five|six)[\s-]*bed(?:room)?s?\b([^]{0,80}?)\btype\s+([A-Za-z0-9 ,\/&()\-]+?)(?=\s*(?:floor\s*plan|floorplan|\d[\s-]*bed|$|[.;"<]))/i.exec(seg.trim());
    if (!m) return;
    const beds = /^\d$/.test(m[1]) ? +m[1] : W[m[1].toLowerCase()], variant = X.variantOf(m[2] + ' ' + m[3]);
    m[3].split(/\s*(?:,|\/|&|\band\b)\s*/).map((c) => c.trim()).filter((c) => /^[A-Z]{1,3}\d{0,2}[A-Za-z]{0,3}(?:-[A-Z]\d?|\(P\))?$/.test(c)).forEach((c) => { if (!out.has(c)) out.set(c, { bedrooms: beds, variant }); });
  });
  return out;
}

module.exports = { stackChart, titleBedrooms, fromBbox, fromTsv, lines, findings, pairPage, extractPages, toCsv, fixCode, loadPages };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  const project = arg('project'), source = arg('source', ''), pages = loadPages({ bbox: arg('bbox'), tsv: arg('tsv') });
  if (!project || !pages.length) { console.error('Usage: node tools/market-data/extract-positioned.js (--bbox file.html | --tsv folder) --project "URA NAME" [--source id]'); process.exit(2); }
  const rows = extractPages(pages);
  process.stdout.write(toCsv(rows, project, source) + (rows.length ? '\n' : ''));
  console.error(rows.length + ' draft rows from ' + pages.length + ' pages (' + rows.filter((r) => r.note && /not found/.test(r.note)).length + ' incomplete).');
}
