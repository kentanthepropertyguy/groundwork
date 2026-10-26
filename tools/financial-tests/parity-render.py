import json, os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
"""V3.4 parity: How much can I borrow? must give the same figures as the two pages folded into it, for every scenario in parity-scenarios.json.
  afford (14): What can I afford? -> "Add my cash and CPF": budget, borrowing capacity, monthly instalment, cash needed, CPF used, and what limits it.
  msr (15):    HDB and EC loan limit -> the HDB / EC chip: the loan (shown to the $1,000), tenure, test rate, loan-to-value, price supported (to the $10,000),
               and HDB loan eligibility (singles' age, the income ceiling) with the loan the income would support.
The old pages' figures were read from the V3.3 site by parity-old.py into parity-baseline.json. Run from the site folder:
    python3 tools/financial-tests/parity-render.py            (FIN3_PARITY_OUT=file.json also writes the side-by-side table)"""
SITE = pathlib.Path(__file__).resolve().parents[2]; HERE = pathlib.Path(__file__).resolve().parent
SC = json.loads((HERE / 'parity-scenarios.json').read_text()); BASE = json.loads((HERE / 'parity-baseline.json').read_text())
def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
P = port(); srv = subprocess.Popen(['node', str(SITE / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
B = f'http://127.0.0.1:{P}'
ok = fail = 0; table = {'afford': [], 'msr': []}
def check(n, c, i=''):
    global ok, fail
    if c: ok += 1
    else: fail += 1; print('  FAIL', n, i)
money = lambda s: None if s is None else (int(re.sub(r'[^0-9]', '', s.split('.')[0])) if re.search(r'\d', s) else None)
fl = lambda x, u: None if x is None else (x // u) * u
def msr_raw(o):
    r = {'n': str(len(o['b']))}; loans = []
    r['bkind'] = 'ec' if o['scenario'] == 'ec' else 'hdb'; r['hdbLoan'] = 'bank' if o['scenario'] == 'hdb-bank' else 'hdb'
    if o.get('household'): r['household'] = o['household']
    for k, (age, fx, var) in enumerate(o['b']):
        r['p.%d.age' % k] = age; r['p.%d.fixed' % k] = fx
        if var: r['p.%d.bonusYr' % k] = '{:,}'.format(int(var.replace(',', '')) * 12)
    if o.get('propertyLoans'): loans.append({'type': 'home', 'who': 0, 'amt': o['propertyLoans']})
    if o.get('otherDebts'): loans.append({'type': 'car', 'who': 0, 'amt': o['otherDebts']})
    if o.get('tenure'): r['years'] = o['tenure']
    if o.get('lease'): r['lease'] = o['lease']
    return r, loans
try:
  with sync_playwright() as p:
    br = p.chromium.launch(); pg = br.new_page(viewport={'width': 1280, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route(re.compile(r'googletagmanager|facebook\.net|onemap'), lambda r: r.fulfill(status=200, body=''))
    def load(raw, loans, hash_=''):
        pg.goto(B + '/tools/tdsr/?parity'); pg.wait_for_selector('[data-out]')
        pg.evaluate("s=>{sessionStorage.clear();sessionStorage.setItem('gw.fin3.v1',JSON.stringify({v:3,raw:s.raw,loans:s.loans}))}", {'raw': raw, 'loans': loans})
        pg.goto(B + '/tools/tdsr/?j=1' + hash_); pg.wait_for_selector('[data-out]');   # V3.7: the seeded figures are the journey's (gw.fin3.v1); a standalone page starts blank pg.wait_for_function("()=>window.__f3Settled&&window.__f3Settled()")
    for s in SC['afford']:
        o = BASE['afford'][s['id']]; load(s['raw'], s.get('loans', []), '#cash')
        n = pg.evaluate("""()=>{const g=k=>{const e=document.querySelector('[data-out] [data-'+k+']');return e?e.textContent:null};return {budget:g('budget'),cap:g('cap'),mon:g('mon'),cash:g('cashneed'),cpf:g('cpfuse'),fact:(document.querySelector('[data-out] .f3-fact')||{}).textContent||'',text:document.querySelector('[data-out]').textContent.slice(0,300)}}""")
        old = {'budget': o['budget_n'], 'cap': o['tiles_n'].get('Borrowing capacity'), 'mon': o['tiles_n'].get('Monthly mortgage'), 'cash': o['tiles_n'].get('Cash you’d need'), 'cpf': o['tiles_n'].get('CPF you’d use')}
        new = {k: money(n[k]) for k in ('budget', 'cap', 'mon', 'cash', 'cpf')}
        lim_old = 'funds' if 'cash and CPF' in (o['limited'] or '') else 'income' if 'income' in (o['limited'] or '') else 'other'
        lim_new = 'funds' if 'cash and CPF are the limit' in n['fact'] else 'income' if 'The loan is the limit' in n['fact'] else 'other'
        same = all(old[k] == new[k] for k in old) and lim_old == lim_new
        check(s['id'] + ' ' + s['name'], same, [old, new, lim_old, lim_new, n['text'][:160]])
        table['afford'].append({'id': s['id'], 'name': s['name'], 'old': old, 'new': new, 'limit_old': lim_old, 'limit_new': lim_new, 'same': same})
    for s in SC['msr']:
        o = BASE['msr'][s['id']]; raw, loans = msr_raw(s['old']); load(raw, loans)
        sh = pg.evaluate("()=>window.__f3Sheet&&window.__f3Sheet()")
        n = pg.evaluate("""()=>{const o=document.querySelector('[data-out]');const c=o.querySelector('[data-cap]');const e=o.querySelector('[data-elig]');return {cap:c?c.textContent:null,elig:e?e.dataset.elig:'',text:o.textContent}}""")
        yrs = re.search(r'Over (\d+) years', n['text']); ltv = re.search(r'supports at ([\d.]+)%', n['text'])
        pv = [f['value'] for f in (sh or {}).get('figures', []) if f.get('key') == 'price']; pr = re.search(r'S\$([\d,.]+)(M?)', pv[0]) if pv else None
        price_new = None
        if pr: price_new = int(round(float(pr.group(1).replace(',', '')) * 1e6)) if pr.group(2) else money(pr.group(1))
        test = None
        for blk in (sh or {}).get('left', []):
            for r in blk.get('rows', []):
                if r.get('label') == 'Stress rate': test = float(r['value'].replace('%', ''))
        elig_old = 'age' if o['head'] == 'HDB purchase eligibility' else 'ceiling' if o['head'] == 'HDB loan eligibility' else ''
        loan_old = o['maxLoan'] if o['maxLoan'] is not None else o['theoretical']
        old = {'loan': fl(loan_old, 1000), 'years': o['years'], 'test': o['testRate'], 'ltv': round(o['ltv']) if o['ltv'] is not None else None, 'price': (fl(o['price'], 10000) if o['price'] and o['price'] < 1e6 else round(fl(o['price'], 10000) / 1e4) * 1e4 if o['price'] else None), 'elig': elig_old}
        new = {'loan': money(n['cap']), 'years': int(yrs.group(1)) if yrs else None, 'test': test, 'ltv': round(float(ltv.group(1))) if ltv else None, 'price': price_new, 'elig': n['elig']}
        # below a 50% loan-to-value the old page said "Only 45% of the price can be borrowed" instead of a price; the new page gives the price: check it is the same loan at that share
        if old['price'] is None and o.get('ltv') and loan_old: old['price'] = round(loan_old / (o['ltv'] / 100) / 1e4) * 1e4; new['price'] = round(new['price'] / 1e4) * 1e4 if new['price'] else None
        # a price of $1M or more is shown to $10,000 as "$1.13M"; compare at the precision shown
        if old['price'] and old['price'] >= 1e6 and new['price']: old['price'] = round(old['price'] / 1e4) * 1e4; new['price'] = round(new['price'] / 1e4) * 1e4
        same = all(old[k] == new[k] for k in old)
        check(s['id'] + ' ' + s['name'], same, [old, new])
        table['msr'].append({'id': s['id'], 'name': s['name'], 'old': old, 'new': new, 'same': same})
    check('no script errors', not errs, errs[:3])
    br.close()
finally:
    srv.terminate()
if os.environ.get('FIN3_PARITY_OUT'): pathlib.Path(os.environ['FIN3_PARITY_OUT']).write_text(json.dumps(table, indent=1, ensure_ascii=False))
print('parity-render: %d passed, %d failed' % (ok, fail)); sys.exit(1 if fail else 0)
