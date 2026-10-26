import json, os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
"""V3.4 parity, the OLD side: the figures What can I afford? (tools/planner/) and HDB and EC loan limit (tools/msr/) show for every scenario in
parity-scenarios.json, read from the pages as a visitor sees them. Run against the build BEFORE the fold (the V3.3 site):
    python3 tools/financial-tests/parity-old.py <old-site-folder> <out.json>
The result file is kept with the tests (parity-baseline.json), so the parity check can run without the retired pages."""
SITE = pathlib.Path(sys.argv[1]).resolve(); OUT = sys.argv[2]
HERE = pathlib.Path(__file__).resolve().parent
SC = json.loads((HERE / 'parity-scenarios.json').read_text())
def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
P = port(); srv = subprocess.Popen(['node', str(SITE / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
B = f'http://127.0.0.1:{P}'
money = lambda s: None if s is None else (int(re.sub(r'[^0-9]', '', s)) if re.search(r'\d', s) else None)
res = {'afford': {}, 'msr': {}}
try:
  with sync_playwright() as p:
    br = p.chromium.launch(); pg = br.new_page(viewport={'width': 1280, 'height': 900})
    pg.route(re.compile(r'googletagmanager|facebook\.net|onemap'), lambda r: r.fulfill(status=200, body=''))
    for s in SC['afford']:
        pg.goto(B + '/tools/planner/'); pg.wait_for_selector('[data-out]')
        pg.evaluate("s=>{sessionStorage.clear();sessionStorage.setItem('gw.fin3.v1',JSON.stringify({raw:s.raw,loans:s.loans||[]}))}", s)
        pg.reload(); pg.wait_for_selector('[data-out]'); pg.wait_for_function("()=>!window.__f3Settled||window.__f3Settled()")
        pg.wait_for_function("()=>{const o=document.querySelector('[data-out]');return o&&o.textContent.trim().length>0}")
        o = pg.evaluate("""()=>{const o=document.querySelector('[data-out]');const t={};o.querySelectorAll('.f3-t').forEach(x=>t[x.querySelector('.k').textContent]=x.querySelector('.v').textContent);
          const m=o.querySelector('[data-max]');const q=o.querySelector('.f3-quote');const s=o.querySelector('.f3-s');
          return {budget:m?m.textContent:null,tiles:t,limited:s?s.textContent:null,quote:q?q.textContent:null,text:o.textContent.replace(/\\s+/g,' ').slice(0,400)}}""")
        o['budget_n'] = money(o['budget']); o['tiles_n'] = {k: money(v) for k, v in o['tiles'].items()}
        res['afford'][s['id']] = o; print(s['id'], o['budget'], o['tiles'], (o['limited'] or '')[:60])
    for s in SC['msr']:
        o = s['old']
        pg.goto(B + '/tools/msr/'); pg.wait_for_selector('[data-calc]'); pg.evaluate("sessionStorage.clear()"); pg.reload(); pg.wait_for_selector('[data-calc]')
        pg.click('[data-k="scenario"] [data-v="%s"]' % o['scenario'])
        if o.get('household'): pg.click('[data-k="household"] [data-v="%s"]' % o['household'])
        if len(o['b']) > 1: pg.click('[data-bn-v="2"]')
        for k, (age, fx, var) in enumerate(o['b']):
            pg.fill('[data-k="borrowers.%d.age"]' % k, age); pg.fill('[data-k="borrowers.%d.fixed"]' % k, fx)
            if var: pg.fill('[data-k="borrowers.%d.variable"]' % k, var)
        if o.get('housingLoans'): pg.click('[data-k="loans"] [data-v="%s"]' % o['housingLoans'])
        for f in ('propertyLoans', 'otherDebts', 'lease', 'tenure'):
            if o.get(f): pg.fill('[data-k="%s"]' % f, o[f])
        pg.evaluate("document.activeElement&&document.activeElement.blur()"); pg.wait_for_timeout(400)
        r = pg.evaluate("""()=>{const o=document.querySelector('[data-out]');const h=o.querySelector('.gw-res-h');const rows={};o.querySelectorAll('.gw-rows .gw-row, .gw-rows li, dl div').forEach(x=>{const k=x.firstElementChild,v=x.lastElementChild;if(k&&v&&k!==v)rows[k.textContent.trim()]=v.textContent.trim()});
          return {head:h?h.querySelector('span').textContent:null,value:h?h.querySelector('b').textContent:null,sub:h&&h.querySelector('small')?h.querySelector('small').textContent:null,rows:rows,warn:[...o.querySelectorAll('.gw-warn')].map(x=>x.textContent),text:o.textContent.replace(/\\s+/g,' ').slice(0,600)}}""")
        sub = r['sub'] or ''; m = re.search(r'over (\d+) years, tested at ([\d.]+)%', sub + ' ' + ' '.join(r['rows'].values()))
        r['maxLoan'] = money(r['value']) if r['head'] == 'Indicative maximum loan' else None
        th = re.search(r'Theoretical maximum[^$]*\$([\d,]+) over (\d+) years', r['text']); r['theoretical'] = money(th.group(1)) if th else None
        if not m and th: m = re.search(r'over (\d+) years, tested at ([\d.]+)%', r['text'])
        r['years'] = int(m.group(1)) if m else None; r['testRate'] = float(m.group(2)) if m else None
        pr = re.search(r'Price (?:that theoretical loan|this loan) supports\s*\$([\d,]+) \((\d+(?:\.\d+)?)% loan\)', r['text']); r['price'] = money(pr.group(1)) if pr else None; r['ltv'] = float(pr.group(2)) if pr else None
        if not pr: lo = re.search(r'Only ([\d.]+)% of the price can be borrowed', r['text']); r['ltv'] = float(lo.group(1)) if lo else None   # below 50% the old page gave the share, not a price
        res['msr'][s['id']] = r; print(s['id'], r['head'], r['value'], r['years'], r['testRate'], r['price'], r['ltv'], r['theoretical'])
    br.close()
finally:
    srv.terminate()
pathlib.Path(OUT).write_text(json.dumps(res, indent=1, ensure_ascii=False))
print('wrote', OUT)
