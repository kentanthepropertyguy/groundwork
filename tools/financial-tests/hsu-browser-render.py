"""Hold vs Sell vs Upgrade, P1: the two new files load in a real browser exactly as P4's page will load them, and answer as in Node.
No page loads them in P1, so this test adds them to Plan My Move's page (journey/, which already loads GW_RULES, GW_CALC, the planner's assumptions and
GW_ENGINE), then checks: GW_CALC and GW_ENGINE gain only the new names; their existing functions are the same objects; Plan My Move V2 is unaffected;
compare() in the browser gives the same figures as in Node (node tools/financial-tests/independent/hsu_batch.js) for a few cases.
Run from the site folder:  python3 tools/financial-tests/hsu-browser-render.py"""
import json, os, socket, subprocess, tempfile, time
from playwright.sync_api import sync_playwright
SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ok_n = fail_n = 0
def check(name, cond, info=''):
    global ok_n, fail_n
    if cond: ok_n += 1; print('  ok   ' + name)
    else: fail_n += 1; print('  FAIL ' + name + (' :: ' + str(info)[:400] if info != '' else ''))
s = socket.socket(); s.bind(('127.0.0.1', 0)); P = s.getsockname()[1]; s.close()
srv = subprocess.Popen(['node', os.path.join(SITE, 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(200):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
BASE = {'schema': 'gw-case-v1', 'people': [{'age': 40, 'res': 'SC', 'income': {'fixed': 9000}}, {'age': 38, 'res': 'SC', 'income': {'fixed': 7000}}], 'household': {'cash': 150000, 'cpf': 80000, 'couple': True}, 'otherLoans': [],
        'owned': [{'id': 'flat', 'type': 'hdb', 'owners': [0, 1], 'intent': 'keep', 'loan': {'monthly': 1200, 'lender': 'hdb'}, 'monthlyCosts': 90, 'sale': {'price': 700000, 'loan': 150000, 'cpfRefund': 260000}}],
        'purchase': {'type': 'completed', 'price': 1800000, 'monthlyCosts': 450}, 'financing': {}}
CASES = [{'case': BASE, 'opts': {}}, {'case': BASE, 'opts': {'years': 10, 'pct': {'current': 1.5, 'next': -1}, 'sell': {'housing': 'rent', 'rent': 3500}}},
         {'case': BASE, 'opts': {'years': 3, 'sell': {'housing': 'buy', 'price': 1100000, 'monthlyCosts': 300}, 'oneOff': {'upgrade': 60000}}}]
tmp = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False); json.dump(CASES, tmp); tmp.close()
node = json.loads(subprocess.run(['node', os.path.join(SITE, 'tools/financial-tests/independent/hsu_batch.js'), tmp.name], capture_output=True, text=True, check=True).stdout)
os.unlink(tmp.name)
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(f'http://127.0.0.1:{P}/journey/'); pg.wait_for_selector('[data-pmm] [data-next]')
        before = pg.evaluate("() => ({ calc: Object.keys(GW_CALC).sort(), eng: Object.keys(GW_ENGINE).sort(), mortgage: GW_CALC.mortgage === GW_CALC.mortgage && (window.__m = GW_CALC.mortgage, true), afford: (window.__a = GW_ENGINE.afford, true) })")
        for f in ['assets/js/gw-calc-position.js', 'assets/js/gw-engine-position.js']: pg.add_script_tag(url=f'/{f}')
        after = pg.evaluate("() => ({ calc: Object.keys(GW_CALC).sort(), eng: Object.keys(GW_ENGINE).sort(), same: window.__m === GW_CALC.mortgage && window.__a === GW_ENGINE.afford })")
        added_c = sorted(set(after['calc']) - set(before['calc'])); added_e = sorted(set(after['eng']) - set(before['eng']))
        check('GW_CALC gains only the five primitives (and their version)', added_c == ['POSITION_VERSION', 'breakEven', 'ledger', 'loanAt', 'loanFrom', 'valueAt'] and set(before['calc']) <= set(after['calc']), added_c)
        check('GW_ENGINE gains only position and compare (and their version and schema)', added_e == ['COMPARE_SCHEMA', 'POSITION_VERSION', 'compare', 'position'], added_e)
        check('their existing functions are the same objects (nothing replaced)', after['same'])
        got = pg.evaluate("(cases) => cases.map((k) => { const r = GW_ENGINE.compare(k.case, k.opts); const f = (x) => ({ status: x.status, position: x.end ? x.end.position : null, cash: x.today ? x.today.cash : null }); return { hold: f(r.choices.hold), sell: f(r.choices.sell), upgrade: f(r.choices.upgrade), comparable: r.comparable }; })", CASES)
        for i, (g, n) in enumerate(zip(got, node)):
            same = all(g[k]['status'] == n[k]['status'] and (g[k]['position'] == n[k].get('position')) and (g[k]['cash'] == n[k].get('todayCash')) for k in ('hold', 'sell', 'upgrade')) and g['comparable'] == n['comparable']
            check(f'case {i + 1}: the browser’s compare() gives Node’s figures exactly', same, (g, n))
        pg.locator('[data-pmm] [data-k="sit"] [data-v="first"]').click()
        check('Plan My Move V2 still answers on the same page (its own flow unaffected)', pg.locator('[data-pmm] [data-k="sit"] [data-v="first"]').get_attribute('aria-checked') == 'true')
        check('no script error', not errs, errs[:3])
        br.close()
finally:
    srv.terminate()
print(f'hsu-browser-render: {ok_n} passed, {fail_n} failed')
raise SystemExit(1 if fail_n else 0)
