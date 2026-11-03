"""PRISM loading at any scale, in a real browser (1440 and 390 px): what each route downloads from data/prism/.
Run from the site folder:  python3 research/tests/prism-scale-render.py
 - Research landing: the V1 manifest, index.json, at most 5 of the 16 shards and at most PICKS_MAX (5) reports, never the whole release
 - Property Data of a development without PRISM: the V1 manifest, index.json and one shard, no report
 - Property Data / PRISM page of a development with PRISM: the manifests and that development's own report(s) only
 - moving between developments: each manifest is fetched once per visit (cached), each report only when its development is opened
 - time to the PRISM page's opening (Reveal or verdict) within budget; no script error"""
import os, pathlib, re, socket, subprocess, time
from playwright.sync_api import sync_playwright
SITE = pathlib.Path(__file__).resolve().parents[2]
ok_n = fail_n = 0
def check(name, cond, info=''):
    global ok_n, fail_n
    if cond: ok_n += 1; print('  ok   ' + name)
    else: fail_n += 1; print('  FAIL ' + name + (' :: ' + str(info)[:300] if info else ''))
s = socket.socket(); s.bind(('127.0.0.1', 0)); P = s.getsockname()[1]; s.close()
srv = subprocess.Popen(['node', str(SITE / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
B = os.environ.get('LIVE') or f'http://127.0.0.1:{P}'
BUDGET_MS = 4000
def session(br, w):
    mob = w < 500; ctx = br.new_context(viewport={'width': w, 'height': 900 if w > 500 else 844}, is_mobile=mob, has_touch=mob); pg = ctx.new_page(); log = []; errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('request', lambda r: log.append(re.sub(r'^.*?/data/prism/', '', r.url.split('?')[0])) if '/data/prism/' in r.url else None)
    pg.route(re.compile(r'googletagmanager|facebook\.net|onemap'), lambda r: r.fulfill(status=200, body=''))
    return ctx, pg, log, errs
reports = lambda log: [x for x in log if '/reports/' in x]
manifests = lambda log: [x for x in log if x.endswith('manifest.json') or x.endswith('index.json')]
shards = lambda log: [x for x in log if x.startswith('v1.1/index/')]
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for w in [1440, 390]:
            vn = f'{w}px'
            ctx, pg, log, errs = session(br, w)
            pg.goto(B + '/research/'); pg.wait_for_selector('[data-gwp-picks]:not([hidden])', timeout=30000); pg.wait_for_timeout(800)
            r = reports(log); ids = sorted(set(x.split('/')[-1] for x in r))
            check(f'{vn} landing: at most 5 developments\' reports, the V1 manifest, index.json and at most 5 of the 16 shards: never the whole release', len(ids) <= 5 and len(manifests(log)) <= 2 and len(set(shards(log))) <= 5, [len(ids), manifests(log), shards(log)])
            ctx.close()
            ctx, pg, log, errs = session(br, w)
            pg.goto(B + '/research/#/p/jadescape'); pg.wait_for_selector('header.lg-hero', timeout=30000); pg.wait_for_timeout(2500)
            check(f'{vn} Property Data without PRISM: the V1 manifest, index.json and one shard (to learn it has none), no report', reports(log) == [] and len(set(shards(log))) <= 1 and pg.locator('[data-gwp-switch]').count() == 0, log)
            log.clear(); pg.goto(B + '/research/#/p/the-quinn'); pg.wait_for_selector('[data-gwp-switch]', timeout=30000); pg.wait_for_timeout(800)
            check(f'{vn} then a development with PRISM: only its own shard (if not already loaded) and its own report; index.json not fetched again', all(x.endswith('/the-quinn.json') for x in reports(log)) and len(reports(log)) >= 1 and manifests(log) == [] and len(set(shards(log))) <= 1, log)
            log.clear(); t0 = time.time(); pg.click('[data-gwp-switch] [data-gwp-view="prism"]'); pg.wait_for_selector('[data-gwp-quick], [data-gwp-reveal]', timeout=30000); ms = (time.time() - t0) * 1000
            check(f'{vn} its PRISM page: nothing new downloaded (the report is already verified), quick read in {ms:.0f} ms (budget {BUDGET_MS})', reports(log) == [] and ms <= BUDGET_MS, log)
            log.clear(); pg.goto(B + '/research/#/prism/kingsford-waterbay'); pg.wait_for_selector('.gwp-card .gwp-ev', timeout=30000); pg.wait_for_timeout(500)
            check(f'{vn} another PRISM page: only that development\'s V1 and V1.1 reports (and at most its shard)', sorted(set(x.split('/')[-1] for x in reports(log))) == ['kingsford-waterbay.json'] and len(reports(log)) <= 2 and len(set(shards(log))) <= 1, log)
            check(f'{vn} no script error', not errs, errs[:2]); ctx.close()
        br.close()
finally:
    srv.terminate()
print('prism-scale-render: %d passed, %d failed' % (ok_n, fail_n))
raise SystemExit(1 if fail_n else 0)
