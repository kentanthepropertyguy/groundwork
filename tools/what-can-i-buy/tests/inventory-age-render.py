import json, os, pathlib, re, socket, subprocess, sys, time, datetime as dt
from playwright.sync_api import sync_playwright
"""V3.10 (Ken, 27 Oct 2026; Claude C's 14-day cadence): what Budget Search says about a Huttons check as it ages, on the live inventory file,
with the page clock set from the file's own date (so a refresh needs no edit here):
  12 hours  : "updated today/yesterday, <date>", no "(as shown then)", no caveat
  5 days    : "updated <date>", prices "(as shown then)", no caveat
  16 days   : "updated <date> · may have changed since", "(as shown then)"
  (Ken, 28 Oct 2026: the line reads "Developer listings · Checked <date>"; "Availability may have changed." under the prices is the standing disclaimer,
   so the 14-day caveat is checked as "may have changed since".)
  22 days   : the check is not used at all (no Huttons line)
Never "Huttons", "available", "in stock" or a unit count; the inventory is loaded with no version tag. Run from the site folder."""
ROOT = pathlib.Path(__file__).resolve().parents[3]
AT = dt.datetime.fromisoformat(json.load(open(ROOT / 'data/projects/inventory.json'))['checkedAt'].replace('Z', '+00:00'))
q = lambda h: '?now=' + (AT + dt.timedelta(hours=h)).strftime('%Y-%m-%dT%H:%M:%SZ')
def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
P = port(); srv = subprocess.Popen(['node', str(ROOT / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
B = f'http://127.0.0.1:{P}'
ok = fail = 0
def check(n, c, i=''):
    global ok, fail
    if c: ok += 1; print('  ok  ', n)
    else: fail += 1; print('  FAIL', n, str(i)[:400])
for f in ('research/index.html', 'tools/what-can-i-buy/index.html'):
    t = open(ROOT / f, encoding='utf8').read()
    check(f'{f}: the inventory is loaded with no hand-edited version tag', 'inventory.json?v=' not in t and "INV_URL: inv + '?v=" not in t)
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); errs = []
        def lines(h):   # a new browser context each time, so no earlier search is restored
            ctx = br.new_context(viewport={'width': 1440, 'height': 900}); pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.route(re.compile(r'googletagmanager|facebook\.net|onemap'), lambda r: r.fulfill(status=200, body=''))
            pg.goto(B + '/tools/what-can-i-buy/' + q(h)); pg.wait_for_selector('#kdBudget'); pg.fill('#kdBudget', '3,000,000')
            pg.click('[data-f=seg][data-k=sale][data-v=new]'); pg.click('[data-f=show]'); pg.wait_for_selector('#kdH', timeout=25000)
            out = pg.evaluate("()=>[...document.querySelectorAll('.kd-inv')].map(p=>p.innerText.replace(/\\s+/g,' ').trim())"); ctx.close(); return out
        L = lines(12)
        check('12 hours: lines say "updated today" or "yesterday" with the date; no "(as shown then)", no caveat', L and all(re.match(r'^Developer listings · Checked (today|yesterday), (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+ [A-Z][a-z]{2} ', x) for x in L) and not any('as shown then' in x or 'may have changed since' in x for x in L), L[:3])
        L = lines(5 * 24)
        check('5 days: "updated <date>", prices "(as shown then)", no caveat', L and all(re.match(r'^Developer listings · Checked (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+ [A-Z][a-z]{2} ', x) for x in L) and any('(as shown then)' in x for x in L) and not any('may have changed since' in x for x in L), L[:3])
        L = lines(16 * 24)
        check('16 days (past the 14-day cadence): "· may have changed since" on every line, prices "(as shown then)"', L and all(' · may have changed since ' in x + ' ' for x in L) and any('(as shown then)' in x for x in L), L[:3])
        check('no line ever names Huttons, says available, in stock, sold or gives a unit count', not any(re.search(r'huttons|available|in stock|\bsold\b|\d+ units?', x, re.I) for x in L), L[:3])
        L = lines(22 * 24)
        check('22 days: the check is no longer used (no Huttons line)', L == [], L[:3])
        check('no script errors', not errs, errs)
        br.close()
finally:
    srv.terminate()
print(f'inventory-age-render: {ok} passed, {fail} failed'); sys.exit(1 if fail else 0)
