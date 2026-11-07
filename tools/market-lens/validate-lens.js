#!/usr/bin/env node
// Market Lens v1 — fail-closed integrity validation. Usage: node validate-lens.js <data/lens/v1> [<data/prism/v1.1>]
// Exits 1 on ANY failure. Checks hashes, structure, counts, universe, gates, wording and private-content exclusions.
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const DIR=process.argv[2],PRISM=process.argv[3];const errs=[];const fail=m=>{errs.push(m)};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(path.join(DIR,p));
const SCHEMA='groundwork-market-lens-v1';
const PROTECTED=['hougang-central','hundred-palms-residences','kingsford-waterbay','the-quinn','thomson-three'];
const EXCLUDED=['gls-202605-holland-plain','one-chuan-grove'];
const BANNED=[/\bscore\b/i,/\/100\b/,/\brank(ed|ing)?\b/i,/overpriced/i,/undervalued/i,/\bbargain\b/i,/\bcheap(er|est)?\b/i,/\bexpensive\b/i,/\bforecast\b/i,/\bwill (rise|fall|grow|increase|drop)\b/i,/\bKen\b/,/\bHuttons\b/i,/\bguarantee/i,/\bshould buy\b/i,/\bgood buy\b/i,/\binvestment grade\b/i];
const PRIVATE_KEYS=['ken','score','compositeScore','rank','rating','opinion','flags','note'];
const REPORT_KEYS=['class','district','facts','id','name','price','prismState','protected','record','schemaVersion','segment','sourceIds','tenure','text','watch'].join('|');
const KINDS=['observed','indicative','facts-only'],BANDS=['inline','above','below'],RB=['more','less','similar'];
const WATCH=['NO_MRT_800','LRT_ONLY','HIGH_START','SMALL_DEV_SMALL_UNITS','LEASE_70_OR_LESS','THIN_RESALE'];
function walkKeys(o,f,p=''){if(o&&typeof o==='object'){for(const k of Object.keys(o)){f(k,p+'.'+k);walkKeys(o[k],f,p+'.'+k);}}}
function walkStrings(o,f){if(typeof o==='string')f(o);else if(o&&typeof o==='object')Object.values(o).forEach(v=>walkStrings(v,f));}
try{
  const mb=read('manifest.json');const man=JSON.parse(mb);
  if(man.schemaVersion!==SCHEMA+'-manifest')fail('manifest: schemaVersion');
  if(man.status!=='approved')fail('manifest: status not approved');
  if(man.approvalRef!=='GW-PRISM-ML-V1-2026-11-07-A1')fail('manifest: approvalRef is not the reference issued by Groundwork 01');
  if(!/^lens-v1-\d{4}-\d{2}-\d{2}-[0-9a-f]{12}$/.test(man.releaseId||''))fail('manifest: releaseId');
  const ib=read('index.json');if(sha(ib)!==man.indexSha256)fail('index.json sha256 differs from manifest');
  const root=JSON.parse(ib);if(root.schemaVersion!==SCHEMA+'-index'||root.releaseId!==man.releaseId||root.status!=='approved')fail('index: header');
  // every file listed matches; no unlisted file present
  const listed=new Set();
  for(const f of man.files){ if(!/^(reports\/[a-z0-9-]{1,80}|index\/[0-9a-f])\.json$/.test(f.path))fail('manifest: bad path '+f.path);
    let b;try{b=read(f.path)}catch(e){fail('missing file '+f.path);continue}
    if(sha(b)!==f.sha256)fail('sha256 mismatch '+f.path);listed.add(f.path);}
  const onDisk=[...fs.readdirSync(path.join(DIR,'reports')).map(x=>'reports/'+x),...fs.readdirSync(path.join(DIR,'index')).map(x=>'index/'+x)];
  onDisk.forEach(p=>{if(!listed.has(p))fail('unlisted file '+p)});
  // shards
  if(!Array.isArray(root.shards)||root.shards.length!==16)fail('index: 16 shards expected');
  const ids=new Set();let total=0;
  for(const s of root.shards){ if(s.path!=='index/'+s.key+'.json')fail('shard path '+s.key);
    const sb=read(s.path);if(sha(sb)!==s.sha256)fail('shard sha256 '+s.key);
    const sj=JSON.parse(sb);if(sj.key!==s.key||sj.entries.length!==s.entries)fail('shard header/count '+s.key);
    for(const e of sj.entries){ if(sha(Buffer.from(e.id))[0]!==s.key)fail('id in wrong shard '+e.id);
      if(ids.has(e.id))fail('duplicate id '+e.id);ids.add(e.id);total++;
      if(e.path!=='reports/'+e.id+'.json')fail('entry path '+e.id);
      const rb=read(e.path);if(sha(rb)!==e.sha256)fail('report sha256 vs shard '+e.id);
      const r=JSON.parse(rb);checkReport(r,e,root);}}
  if(total!==man.counts.reports||total!==root.counts.reports)fail('count mismatch '+total);
  if(total!==2509)fail('expected 2509 reports, got '+total);
  EXCLUDED.forEach(x=>{if(ids.has(x))fail('excluded id present '+x)});
  PROTECTED.forEach(x=>{if(!ids.has(x))fail('protected id missing '+x)});
  // universe: identical to PRISM v1.1 entries minus nothing
  if(PRISM){const pr=new Set();const pi=JSON.parse(fs.readFileSync(path.join(PRISM,'index.json')));
    for(const s of pi.shards){JSON.parse(fs.readFileSync(path.join(PRISM,s.path))).entries.forEach(e=>pr.add(e.id))}
    pr.forEach(x=>{if(!ids.has(x))fail('PRISM entry without Market Lens record '+x)});ids.forEach(x=>{if(!pr.has(x))fail('Market Lens record not in PRISM '+x)});}
  function checkReport(r,e,root){const T=root.thresholds;const id=r.id;
    if(r.schemaVersion!==SCHEMA)fail('schema '+id);
    if(Object.keys(r).sort().join('|')!==REPORT_KEYS)fail('report keys '+id);
    if(r.protected!==PROTECTED.includes(id)||e.protected!==r.protected)fail('protected flag '+id);
    walkKeys(r,(k,p)=>{if(PRIVATE_KEYS.includes(k)&&!/\.facts\.supply/.test(p))fail('private key '+p+' in '+id)});
    walkStrings(r,s=>BANNED.forEach(b=>{if(b.test(s))fail('banned wording "'+s.slice(0,60)+'" in '+id)}));
    const p=r.price,c=p.comparison;
    if(!KINDS.includes(p.kind))fail('price.kind '+id);
    if(p.kind==='facts-only'&&(p.psf!=null||c))fail('facts-only shows a price '+id);
    if(p.kind!=='facts-only'&&!(Number.isInteger(p.psf)&&p.psf>0))fail('price.psf '+id);
    if(p.kind==='observed'&&!(p.salesUsed>=T.MIN_OBSERVED_RESALES_24M))fail('observed below minimum '+id);
    if(p.kind==='indicative'&&!(p.salesUsed>=T.MIN_INDICATIVE_SALES_5Y))fail('indicative below minimum '+id);
    if(c){ if(!BANDS.includes(c.band))fail('band '+id);
      if(r.class==='strata-landed')fail('strata landed comparison published '+id);
      if(Math.abs(c.gapPct)>=T.OUTSIDE)fail('gap outside range '+id);
      if(p.kind==='indicative'&&Math.abs(c.gapPct)>=T.EST_GAP)fail('indicative gap too large '+id);
      const want=c.gapPct>=T.INLINE?'above':c.gapPct<=-T.INLINE?'below':'inline';if(want!==c.band)fail('band/gap mismatch '+id);
      if(!r.text.comparison||!r.text.comparison.includes('District '))fail('comparison text '+id);
      if(/1 ?km|nearby/.test(r.text.comparison))fail('local wording in district comparison '+id);
      if(e.comparison!==c.band)fail('shard comparison '+id);}
    else if(r.text.comparison)fail('comparison text without comparison '+id);
    if(r.record){const d=r.record.pct-r.record.similarPct;const want=d>=T.GROWTH_EXPECTED?'more':d<=-T.GROWTH_EXPECTED?'less':'similar';
      if(!RB.includes(r.record.band)||want!==r.record.band)fail('record band '+id);
      if(!(Math.min(...r.record.salesEachPeriod)>=T.MIN_GROWTH_SALES_EACH_PERIOD))fail('record sales '+id);
      if(!r.text.record)fail('record text '+id);} else if(r.text.record)fail('record text without record '+id);
    r.watch.forEach(w=>{if(!WATCH.includes(w))fail('watch code '+id)});if(r.watch.length!==r.text.watch.length)fail('watch text '+id);
    (r.facts.popularSchools||[]).forEach(s=>{if(s.applicantsPerPlace<T.SCHOOL_MIN_APPLICANTS_PER_PLACE||s.distanceM>1000)fail('school rule '+id)});
    r.facts.supply.selling.forEach(x=>{if(x.distanceM>T.SUPPLY_RADIUS_M)fail('supply radius '+id);if(x.launchedAfterLatestUraMonth&&x.unsold!=null)fail('unsold shown before URA month '+id)});
    if(!r.text.answer||!r.text.price)fail('text missing '+id);
    if(e.priceKind!==p.kind||e.name!==r.name)fail('shard entry mismatch '+id);}
}catch(e){fail('exception: '+e.message)}
if(errs.length){console.error('FAIL ('+errs.length+')');errs.slice(0,50).forEach(x=>console.error(' - '+x));process.exit(1)}
console.log('PASS: Market Lens v1 integrity, structure, gates and wording');
