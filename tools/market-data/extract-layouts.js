#!/usr/bin/env node
/* ==========================================================================
   Draft layout rows from brochure or floor-plan text, for Ken's review. NEVER final: every row comes out with status "draft",
   which the classifier ignores until a person checks it against the brochure and changes it to secondary/developer/approved.

     pdftotext -layout brochure.pdf brochure.txt
     node tools/market-data/extract-layouts.js --text brochure.txt --project "URA PROJECT NAME" --source <source id> >> layouts.csv

   It finds each layout code ("Type C2P", or a code that starts a line holding an area), then the first sqm and sqft figures and the
   bedroom words in that layout's text. A missing bedroom count or area is left blank and named in the note: it is never guessed.
   ========================================================================== */
'use strict';
const fs = require('fs');

const WORDS = { studio: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const RE = {
  typed: /\b[Tt][Yy][Pp][Ee]\s+([A-Z]{1,3}[0-9]{0,2}[A-Za-z0-9()\-]{0,6})\b/g,
  lead: /^\s*([A-Z]{1,3}[0-9]{1,2}[A-Za-z]{0,4})\b(?=\s*[|:\-–,]|\s+\d|\s+[A-Za-z])/,
  sqm: /(\d{2,4}(?:\.\d+)?)\s*(?:sq\.?\s?m\b|sqm\b|m2\b|m²)/i,
  sqft: /(\d{1,2},\d{3}|\d{3,5})\s*(?:sq\.?\s?ft\b|sqft\b|ft2\b|ft²|sf\b)/i,
  beds: /\b(\d|one|two|three|four|five|six)\s*[- ]?\s*(?:bedroom|bed|br)s?\b/i,
  studio: /\bstudio\b/i,
};
function variantOf(s) {
  if (/penthouse|\bPH\b/i.test(s)) return 'penthouse';
  if (/dual[\s-]?key/i.test(s)) return 'dual-key';
  if (/\+\s*s(?:tudy)?\b|\bstudy\b/i.test(s)) return 'study';
  if (/\bflexi\b/i.test(s)) return 'flexi';
  if (/\bpremium\b/i.test(s)) return 'premium';
  if (/\bPES\b/.test(s)) return 'pes';
  if (/\bloft\b/i.test(s)) return 'loft';
  return '';
}
// Returns [{code, bedrooms, variant, sqm, sqft, note}] in order of first appearance; a code seen twice keeps its first complete reading.
function extract(text) {
  const lines = String(text).split(/\r?\n/), segs = [];
  // 1. "Type X" anywhere: segment = from the code to the next "Type" (or 400 characters)
  const flat = lines.join('\n'); let m; const typed = [];
  RE.typed.lastIndex = 0; while ((m = RE.typed.exec(flat))) typed.push({ code: m[1], at: m.index + m[0].length });
  typed.forEach((x, i) => segs.push({ code: x.code, text: flat.slice(x.at, Math.min(i + 1 < typed.length ? typed[i + 1].at - 5 - typed[i + 1].code.length : flat.length, x.at + 400)) }));
  // 2. without "Type": a line that starts with a code and holds an area (unit charts, schedules)
  if (!typed.length) lines.forEach((l) => { const c = RE.lead.exec(l); if (c && (RE.sqm.test(l) || RE.sqft.test(l))) segs.push({ code: c[1], text: l.slice(c.index + c[0].length) }); });
  const out = [], seen = new Map();
  segs.forEach((sg) => {
    const sqm = RE.sqm.exec(sg.text), sqft = RE.sqft.exec(sg.text), b = RE.beds.exec(sg.text);
    let bedrooms = null;
    if (b) bedrooms = /^\d$/.test(b[1]) ? Number(b[1]) : WORDS[b[1].toLowerCase()];
    else if (RE.studio.test(sg.text)) bedrooms = 0;
    const row = { code: sg.code, bedrooms, variant: variantOf(sg.text), sqm: sqm ? sqm[1] : '', sqft: sqft ? sqft[1].replace(',', '') : '' };
    const miss = []; if (bedrooms == null) miss.push('bedrooms not found'); if (!row.sqm && !row.sqft) miss.push('area not found');
    row.note = miss.join('; ');
    const prev = seen.get(row.code);
    if (!prev) { seen.set(row.code, row); out.push(row); }
    else if (prev.note && !row.note) { Object.assign(prev, row); }
  });
  return out;
}
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function toCsv(rows, project, source) { return rows.map((r) => [project, r.code, r.bedrooms == null ? '' : r.bedrooms, r.variant, r.sqm, r.sqft, source, 'draft', r.note ? 'CHECK: ' + r.note : 'auto-extracted, check against the brochure'].map(csvCell).join(',')).join('\n'); }

module.exports = { extract, toCsv, variantOf };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  const file = arg('text'), project = arg('project'), source = arg('source', '');
  if (!file || !project) { console.error('Usage: node tools/market-data/extract-layouts.js --text <brochure.txt> --project "URA PROJECT NAME" [--source id]'); process.exit(2); }
  const rows = extract(fs.readFileSync(file, 'utf8'));
  if (!rows.length) { console.error('No layout codes with areas found. Check the text (pdftotext -layout) or enter the rows by hand.'); process.exit(1); }
  process.stdout.write(toCsv(rows, project, source) + '\n');
  console.error(rows.length + ' draft rows (' + rows.filter((r) => r.note).length + ' need a value filled in). Status is draft: review each row, then set status.');
}
