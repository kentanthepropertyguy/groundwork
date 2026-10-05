#!/usr/bin/env node
/* Downloads the 4 batches of private residential transactions from the URA Data Service into ./raw/.
   Needs your own access key: URA_ACCESS_KEY=xxxx node tools/market-data/fetch-ura.js
   NOT yet run against the live API (no access key in this build); the request flow follows URA's published API reference.
   Raw files are for your computer only; never commit or publish them (see .gitignore). */
const fs = require('fs'), path = require('path');
const BASE = 'https://eservice.ura.gov.sg/uraDataService/';

async function fetchAll(opts) {
  const f = opts.fetch, key = opts.accessKey;
  if (!key) throw new Error('URA_ACCESS_KEY is not set.');
  const UA = { 'User-Agent': 'Mozilla/5.0 (KPT market-data fetch)' };
  const get = async (label, url, h) => {
    const r = await f(url, { headers: Object.assign({}, UA, h) });
    const txt = typeof r.text === 'function' ? await r.text() : JSON.stringify(await r.json());
    try { return JSON.parse(txt); } catch (e) { throw new Error(label + ': URA did not return JSON (HTTP ' + r.status + '). First 200 chars: ' + txt.slice(0, 200)); }
  };
  const tk = await get('Token request', BASE + 'insertNewToken/v1', { AccessKey: key });
  if (tk.Status !== 'Success') throw new Error('Token request failed: ' + (tk.Message || tk.Status));
  const files = [];
  for (let batch = 1; batch <= 4; batch++) {
    const j = await get('Batch ' + batch, BASE + 'invokeUraDS/v1?service=PMI_Resi_Transaction&batch=' + batch, { AccessKey: key, Token: tk.Result });
    if (j.Status !== 'Success') throw new Error('Batch ' + batch + ' failed: ' + (j.Message || j.Status));
    files.push({ name: 'batch-' + batch + '.json', json: j });
  }
  return files;
}
module.exports = { fetchAll };

if (require.main === module) {
  const out = path.join(__dirname, 'raw'); fs.mkdirSync(out, { recursive: true });
  fetchAll({ fetch: globalThis.fetch, accessKey: process.env.URA_ACCESS_KEY }).then((files) => {
    files.forEach((x) => fs.writeFileSync(path.join(out, x.name), JSON.stringify(x.json)));
    console.log('Saved ' + files.length + ' batches to ' + out);
  }).catch((e) => { console.error(e.message); process.exit(1); });
}
