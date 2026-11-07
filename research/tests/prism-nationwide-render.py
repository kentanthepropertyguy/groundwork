"""PRISM nationwide (GW-PRISM-V1.1-2026-11-03-NATIONWIDE-1): the 49 focused-validation cases in a real browser, 1440 and 390 px, and the
rare extremes, missing-data and D3 cases again at 195 px (200% zoom on a phone).
Run from the site folder:  python3 research/tests/prism-nationwide-render.py   (SHOTS=<folder> also saves a screenshot of each page)
 Each case: its evidence-profile page loads from index.json, its shard and its own report; the opening is the approved one (Reveal, factual
 summary, D4 summary, or D3 evidence summary) and is labelled Reveal or summary accordingly; five dimensions; every profile statement and
 position on the page verbatim; missing evidence named; no verdict, score, purchasing-power or affordability wording; the Reveal figures fit
 their boxes; no sideways scroll; no script error."""
import json, os, pathlib, re, socket, subprocess, time
from playwright.sync_api import sync_playwright
import prism_detailed  # PRISM Research hero R1: these suites test the five dimensions, which are in Detailed
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
SHOTS = os.environ.get('SHOTS')
# (group, id, approved opening) from the release's focused validation and opening expectations (NATIONWIDE-1, D3/D4)
CASES = [["CCR full / small", "m5", "summaryD4"], ["CCR full / small", "jervois-treasures", "summary"], ["CCR full / large", "the-sail-at-marina-bay", "summary"], ["CCR full / large", "valley-park", "summary"], ["CCR full / near threshold", "dormer-park", "resaleAbove"], ["CCR full / near threshold", "cairnhill-crest", "summary"], ["RCR full / small", "sims-meadows", "summaryD4"], ["RCR full / small", "silverscape", "summaryD4"], ["RCR full / large", "city-square-residences", "summary"], ["RCR full / large", "bartley-ridge", "summary"], ["RCR full / near threshold", "aston-mansions", "summary"], ["RCR full / near threshold", "okio", "resaleAbove"], ["OCR full / small", "presto-at-upper-serangoon", "summaryD4"], ["OCR full / small", "east-palm", "summaryD4"], ["OCR full / large", "high-park-residences", "summary"], ["OCR full / large", "melville-park", "resaleAbove"], ["OCR full / near threshold", "the-springbloom", "summary"], ["OCR full / near threshold", "riversails", "summary"], ["EC full / small", "the-esparis", "summary"], ["EC full / small", "belysa", "resaleAbove"], ["EC full / large", "the-terrace", "summary"], ["EC full / large", "twin-waterfalls", "summary"], ["EC full / near threshold", "waterwoods", "summary"], ["EC full / near threshold", "austville-residences", "resaleAbove"], ["flagged / resale wave", "paya-lebar-residences", "summary"], ["flagged / resale wave", "attitude-at-kim-yam", "summaryD4"], ["flagged / quiet area", "seahill", "quiet"], ["flagged / quiet area", "the-shelford", "quiet"], ["flagged / price premium/discount 20%+", "goldenhill-park-condominium", "quiet"], ["flagged / price premium/discount 20%+", "seaside-residences", "summary"], ["partial / partial: price missing", "the-red-house", "summaryD4"], ["partial / partial: price missing", "the-lucent", "summary"], ["partial / partial: price and resale missing", "veranda", "evidence"], ["partial / partial: price and resale missing", "mill-creek", "evidence"], ["partial / partial: resale missing", "the-palette", "summary"], ["partial / market missing", "roots-at-transit", "quiet"], ["unusual / new-sale share 60.6%; homes 38", "jervois-regency", "summary"], ["unusual / price 46.2%", "north-park-residences", "summary"], ["unusual / MRT 3090 m", "the-coast-at-sentosa-cove", "quiet"], ["extreme / highest price premium", "boulevard-88", "resaleSettling"], ["extreme / deepest price discount", "mendon-spring", "summaryD4"], ["extreme / highest turnover", "m5", "summaryD4"], ["extreme / farthest from MRT", "cape-royale", "quiet"], ["extreme / fewest homes", "91-marshall", "summary"], ["extreme / highest new-sale share", "le-quest", "resaleAbove"], ["extreme / largest market rise", "the-verandah-residences", "resaleAbove"], ["extreme / largest market fall", "villa-de-west", "quiet"], ["extreme / most panels missing", "hong-heng-garden", "quiet"], ["extreme / settling (partial)", "15-holland-hill", "quiet"]]
ZOOM = [c for c in CASES if c[0].startswith(('extreme', 'partial', 'unusual'))]
NOOVER = 'document.documentElement.scrollWidth <= innerWidth + 1'
TXT = "s=>{const e=document.querySelector(s);return e?e.textContent.replace(/\\s+/g,' ').trim():''}"
BAD = re.compile(r'score\s*/?\s*100|/\s*100\b|purchasing|affordab|PRISM Verdict|ken.s take', re.I)
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for w, cases in [(1440, CASES), (390, CASES), (195, ZOOM)]:
            vn = f'{w}px'; mob = w < 500
            ctx = br.new_context(viewport={'width': w, 'height': {1440: 900, 390: 844, 195: 422}[w]}, is_mobile=mob, has_touch=mob); pg = ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.route(re.compile(r'googletagmanager|facebook\.net|onemap'), lambda r: r.fulfill(status=200, body=''))
            seen = set()
            for group, id, want in cases:
                if id in seen: continue
                seen.add(id); r = json.loads((SITE / f'data/prism/v1.1/reports/{id}.json').read_text())
                pg.goto(B + '/research/#/prism/' + id)
                try: pg.wait_for_selector(f'[data-gwp-page="{id}"]', timeout=30000)
                except Exception: check(f'{vn} {id} ({group}): its PRISM page loads', False, pg.url); continue
                pg.wait_for_timeout(300)
                got = pg.get_attribute('[data-gwp-reveal]', 'data-gwp-reveal') if pg.locator('[data-gwp-reveal]').count() else None
                kick = re.sub(r'\s+', ' ', pg.inner_text('[data-gwp-reveal] > .gwp-k, [data-gwp-reveal] .gwp-ev > .gwp-k')).strip().lower() if got else ''
                # buyer explanation (Master Planning, 3 Nov 2026): a Reveal keeps its kicker on top; a factual summary is headed by "What the
                # numbers reveal" when the explanation has a Price or Resale finding to lead with, otherwise it keeps "PRISM summary" (e.g. D3)
                kicks = ('prism reveal',) if want in ('quiet', 'resaleAbove', 'resaleSettling') else ('prism summary',) if want == 'evidence' else ('prism summary', 'what the numbers reveal')
                check(f'{vn} {id} ({group}): the approved opening "{want}", labelled {" or ".join(kicks)}', got == want and kick in kicks and pg.get_attribute('[data-gwp-page]', 'data-gwp-mode') == 'profile', [got, kick])
                if SHOTS: os.makedirs(SHOTS, exist_ok=True); pg.screenshot(path=f'{SHOTS}/{id}-top-{w}.png')
                pg.click('[data-gwp-all="open"]'); pg.wait_for_timeout(250)
                t = pg.evaluate(TXT, '[data-gwp-page]')
                miss = [l['measure'] for l in r['profile']['lines'] if l['statement'] not in t] + [x['dimension'] for x in (r['peerComparison'] or {}).get('positions', []) if x['statement'] not in t]
                check(f'{vn} {id}: five dimensions; every statement verbatim (missing evidence named)', pg.locator('[data-gwp-pillar]').count() == 5 and not miss, miss)
                ov = pg.evaluate("[...document.querySelectorAll('[data-gwp-reveal] .gwp-fig, [data-gwp-reveal] .gwp-xf')].map(f => f.scrollWidth - f.clientWidth)")
                check(f'{vn} {id}: no unsupported wording; figures fit; no sideways scroll; no script error', not BAD.search(t) and all(x <= 1 for x in ov) and pg.evaluate(NOOVER) and not errs, [BAD.search(t) and BAD.search(t).group(0), ov, errs[:1]])
            ctx.close()
        br.close()
finally:
    srv.terminate()
print('prism-nationwide-render: %d passed, %d failed' % (ok_n, fail_n))
raise SystemExit(1 if fail_n else 0)
