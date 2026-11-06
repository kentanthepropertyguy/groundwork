"""PRISM Future MRT Phase 1 (GW-FMRT-P1-20261104-01) in a real browser: desktop (1440), phone (390) and 200% zoom (195).
Run from the site folder:  python3 research/tests/prism-fmrt-render.py   (LIVE=https://... against a deployed site; SHOTS=dir for screenshots)
 - the pinned release loads in the browser (root, shard and report sha256 checked by the page itself)
 - qualifying pages: Infrastructure & Catalysts -> Future transport shows the approved line (the report's own statement), its fixed note and
   its sources; the URA and LTA records are in Sources (LTA not linked); nothing runs past its box; no sideways scroll
 - held, protected and out-of-range pages keep "Not yet assessed"; no planned station appears anywhere else on the page
 - the V3 quick read never names a planned station, except the 21 future-MRT reports (FM.ON): only their approved nearest one; no script error"""
import json, os, pathlib, re, socket, subprocess, time
from playwright.sync_api import sync_playwright
SITE = pathlib.Path(__file__).resolve().parents[2]
SHOTS = os.environ.get('SHOTS')
ok_n = fail_n = 0
def check(name, cond, info=''):
    global ok_n, fail_n
    if cond: ok_n += 1; print('  ok   ' + name)
    else: fail_n += 1; print('  FAIL ' + name + (' :: ' + str(info)[:400] if info else ''))
s = socket.socket(); s.bind(('127.0.0.1', 0)); P = s.getsockname()[1]; s.close()
srv = subprocess.Popen(['node', str(SITE / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
B = os.environ.get('LIVE') or f'http://127.0.0.1:{P}'
rep = lambda i: json.loads((SITE / f'data/prism/v1.1/reports/{i}.json').read_text())
ftl = lambda r: next((l for l in (r.get('profile') or {}).get('lines', []) if l['measure'] == 'infrastructure.futureTransport'), None)
# Hundred Palms Residences: amended on its own (GW-FMRT-P1-AMEND-HPR-20261104-01); its Reveal, quick read and MRT today are checked as approved
SHOW = ['parc-vera', 'vue-8-residence', '1-king-albert-park', 'the-esparis', 'hundred-palms-residences']   # one station; two (60 m); two (Maju); two (150 m); amended
KEEP = ['eastwood-lodge', 'bukit-828', 'caspian', 'thomson-three', 'bartley-ridge']  # TEL5 held; Brickland; JRL; protected; none within 2 km
PLANNED = re.compile(r'Defu MRT|Elias MRT|Maju MRT|Pasir Ris East MRT|Serangoon North MRT|Teck Ghee MRT|Turf City MRT|Tampines North MRT|Tavistock MRT|Loyang MRT|West Coast MRT|Jurong Lake District MRT|Bedok South|Sungei Bedok|Xilin|Brickland')
NOOVER = 'document.documentElement.scrollWidth <= innerWidth + 1'
# the future-MRT reading (Groundwork 01 / Master Planning, 6 Nov 2026): the 21 reviewed reports in gw-prism.js FM.ON name their nearest future station in the quick read
FM_ON = set(re.findall(r"'([a-z0-9-]+)': true", re.search(r"ON: \{([^}]*)\}", (SITE / 'assets/js/gw-prism.js').read_text()).group(1)))
assert len(FM_ON) == 21, FM_ON
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for w in [1440, 390, 195]:
            vn = f'{w}px'; mob = w < 500
            ctx = br.new_context(viewport={'width': w, 'height': {1440: 900, 390: 844, 195: 422}[w]}, is_mobile=mob, has_touch=mob); pg = ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.route(re.compile(r'googletagmanager|facebook\.net|onemap'), lambda r: r.fulfill(status=200, body=''))
            for id in SHOW + KEEP:
                r = rep(id); l = ftl(r)
                pg.goto(B + '/research/#/prism/' + id)
                try: pg.wait_for_selector(f'[data-gwp-page="{id}"] [data-gwp-pillar="I"]', timeout=30000)
                except Exception: check(f'{vn} {id}: the page loads (pinned release)', False, pg.url); continue
                pg.wait_for_timeout(300)
                pg.evaluate("document.querySelector('[data-gwp-toggle=\"I\"]').click()"); pg.wait_for_timeout(300)
                sel = '#gwpDimI [data-gwp-line="infrastructure.futureTransport"]'
                has = pg.locator(sel).count()
                if id in SHOW:
                    st = pg.inner_text(sel + ' [data-gwp-statement]') if has else ''
                    meta = pg.evaluate(f"[...document.querySelectorAll('{sel} .gwp-ms')].map(e => e.textContent)") if has else []
                    check(f'{vn} {id}: Future transport shows the approved line, its note and sources', has == 1 and st == l['statement'] and l['status'] == 'available' and
                          any(m.startswith('Opening dates are LTA targets and can change') for m in meta) and any('URA Master Plan 2025 rail station sites' in m and 'LTA rail project pages' in m for m in meta), [st, meta])
                    src = pg.evaluate("(() => { const s = document.querySelector('[data-gwp-sources]'); if (!s) return null; s.open = true; const li = [...s.querySelectorAll('li')]; const u = li.find(x => /Amendment to Master Plan 2025 Rail Station Layer/.test(x.textContent)), t = li.find(x => /Land Transport Authority/.test(x.textContent) && /Cross Island Line project page/.test(x.textContent)); return [!!u, !!t, t ? t.querySelectorAll('a').length : -1, u ? /Singapore Open Data Licence/.test(u.textContent) : false]; })()")
                    check(f'{vn} {id}: Sources lists URA (Open Data Licence) and LTA (not linked)', src == [True, True, 0, True], src)
                    ov = pg.evaluate(f"[...document.querySelectorAll('{sel}, {sel} *')].map(e => e.scrollWidth - e.clientWidth)")
                    check(f'{vn} {id}: the line fits its box; no sideways scroll', all(x <= 1 for x in ov) and pg.evaluate(NOOVER), max(ov) if ov else None)
                    if SHOTS: os.makedirs(SHOTS, exist_ok=True); pg.locator('#gwpDimI').screenshot(path=f'{SHOTS}/{id}-{w}-infrastructure.png')
                else:
                    st = pg.inner_text(sel + ' [data-gwp-statement]') if has else ''
                    check(f'{vn} {id}: keeps "Not yet assessed" (or no line)', (has == 0 and l is None) or (has == 1 and st.startswith('Not yet assessed') and (l is None or l['status'] == 'not_yet_assessed')), st)
                    body = pg.inner_text(f'[data-gwp-page="{id}"]')
                    check(f'{vn} {id}: no planned station named anywhere on the page', not PLANNED.search(body), (PLANNED.search(body) or [''])[0])
                if id == 'hundred-palms-residences':
                    hp = pg.evaluate("""(() => [document.querySelector('.gwp-qr-h') ? document.querySelector('.gwp-qr-h').innerText.replace(/\\s+/g, ' ').trim() : '',
                      [...document.querySelectorAll('.gwp-qr .gwp-qr-f b')].map(b => b.textContent), document.body.textContent.indexOf('High resale activity, but sustained activity is still settling') >= 0,
                      document.querySelector('#gwpDimI [data-gwp-line="infrastructure.mrt"] [data-gwp-statement]').textContent])()""")
                    # the future-MRT reading pilot (Groundwork 01, 6 Nov 2026) now names the station in the quick read (prism-fmrt-quick-tests.js); the Reveal and MRT today are unchanged
                    check(f'{vn} {id}: the pilot quick read, the approved Reveal and MRT today, exactly', hp[0] == 'New MRT station being built 300 m away. Higher pricing. Steady market.' and hp[1] == ['22.7% above', '1.6 km', '300 m', '0.8% fewer'] and hp[2] and
                          hp[3] == 'Hougang MRT about 1,600 m, Kovan MRT about 1,610 m; closer than 1 of 46 similar developments. Straight-line distances.', hp)
                qr = pg.evaluate("(() => { const q = document.querySelector('.gwp-qr'); return q ? q.innerText : ''; })()")
                if id in FM_ON:   # the future-MRT reading (gw-prism.js FM.ON): only its approved nearest future station, with its status and LTA target
                    s0 = ftl(rep(id))['data']['stations'][0]
                    check(f'{vn} {id}: the quick read names only {s0["name"]}, under construction, LTA target {s0["target"]}', s0['name'] in qr and f'Under construction · LTA target {s0["target"]}' in qr.replace('\u00a0', ' ') and not PLANNED.search(qr.replace(s0['name'], '')), qr[:300])
                else: check(f'{vn} {id}: the quick read never names a planned station', not PLANNED.search(qr), qr[:200])
                check(f'{vn} {id}: no script error', not errs, errs[:2])
            ctx.close()
        br.close()
finally:
    srv.terminate()
print('prism-fmrt-render: %d passed, %d failed' % (ok_n, fail_n))
raise SystemExit(1 if fail_n else 0)
