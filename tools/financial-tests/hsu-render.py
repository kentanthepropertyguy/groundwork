"""Hold, sell or upgrade? (HSU P4, journey/compare/): the page in a real browser, against the engine.
  A  Parity: 60 seeded households (HDB and private, with and without loans, MOP met / not yet / unsure, every way of living after a sale, 1, 5 and
     10 years, price changes): every position, difference from Hold, today's cash and CPF, monthly housing cost and state the page shows equals
     GW_ENGINE.compare's for the same figures (tools/financial-tests/independent/hsu_page_batch.js, the page's own caseOf/optsOf, run in Node).
  B  States: Sell before "where you'd live" shows today's cash and CPF only; within the MOP; MOP unsure (a special case: asked, no result);
     not possible at these figures; recurring costs given for some homes only; a private home inside SSD; ABSD for a PR-only household.
  C  Entry: a standalone arrival starts clean (even with an old tab state or a stray handoff); Plan My Move V2's link carries its answers once;
     a reload keeps the figures; the Calculators page links here; first-home buyers see no link in V2.
  D  Layout: 1440 three columns with their rows open; 390 and 360 the summary first, rows behind sections; no sideways scroll; labels; PDF sheet.
Run from the site folder:  python3 tools/financial-tests/hsu-render.py"""
import json, math, os, random, socket, subprocess, sys, tempfile, time
from playwright.sync_api import sync_playwright
SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ok_n = fail_n = 0
def check(name, cond, info=''):
    global ok_n, fail_n
    if cond: ok_n += 1; print('  ok   ' + name)
    else: fail_n += 1; print('  FAIL ' + name + (' :: ' + str(info)[:500] if info != '' else ''))
def money(n):
    r = math.floor(abs(n) + 0.5); return ('−' if n < 0 and r else '') + '$' + f'{r:,}'
def money_k(n): return '$' + f'{math.floor(abs(n) / 1000 + 0.5) * 1000:,}'

random.seed(20261107)
def household(i):
    two = random.random() < .6; hdb = random.random() < .6
    price = round((450000 + random.random() * 600000 if hdb else 900000 + random.random() * 1600000) / 1000) * 1000
    owed = 0 if random.random() < .2 else round(random.random() * price * .5 / 1000) * 1000
    f = {'n': '2' if two else '1', 'p0age': 30 + random.randrange(22), 'p0inc': round(4000 + random.random() * 16000), 'p0res': random.choice(['SC', 'SC', 'PR']),
         'cash': round(random.random() * 400000), 'cpf': round(random.random() * 250000), 'htype': 'hdb' if hdb else 'private', 'hval': price,
         'hcpf': round(random.random() * (price - owed) * .6), 'hloan': 'yes' if owed else 'no'}
    if two: f.update({'p1age': 30 + random.randrange(22), 'p1inc': round(random.random() * 12000), 'p1res': 'SC', 'hown': random.choice(['both', 'both', '0']), 'couple': random.choice(['yes', 'no'])})
    if owed:
        rate = 2.6 if hdb and random.random() < .6 else round((2 + random.random() * 2) * 100) / 100
        f.update({'howe': owed, 'hmo': round(owed * rate / 1200 * 1.15 + random.random() * 3000), 'hlender': 'hdb' if hdb and rate == 2.6 else 'bank'})
        if random.random() < .4: f['hrate'] = rate
    if hdb:
        m = random.random()
        if m < .55: f['mop'] = 'met'
        elif m < .85: f.update({'mop': 'notyet', 'mopcat': random.choice(['standard', 'standard', 'plus']), 'mopmon': '%d-%02d' % (2012 + random.randrange(14), 1 + random.randrange(12))})
        else: f['mop'] = 'unsure'
    else: f['hbought'] = '%d-%02d-15' % (2016 + random.randrange(10), 1 + random.randrange(9))
    if random.random() < .85: f['nprice'] = round(price * (1.2 + random.random() * 1.4) / 1000) * 1000
    live = random.choice(['rent', 'rent', 'buy', 'none', ''])
    if live: f['live'] = live
    if live == 'rent': f['rent'] = 2500 + round(random.random() * 3000)
    if live == 'buy': f['sprice'] = round(price * .8 / 1000) * 1000
    if random.random() < .5: f['hmc'] = round(100 + random.random() * 400); f['nmc'] = round(200 + random.random() * 600); f['smc'] = round(150 + random.random() * 300)
    o = {'years': random.choice([1, 5, 5, 10])}
    if random.random() < .4: o['pcur'] = random.choice([2, -1.5, 1]); o['pnext'] = random.choice([3, -2, 0])
    if random.random() < .2: o['oneUp'] = round(random.random() * 80000)
    return {'v': 1, 'f': f, 'o': o, 'from': None}
STATES = [household(i) for i in range(60)]

s = socket.socket(); s.bind(('127.0.0.1', 0)); P = s.getsockname()[1]; s.close()
srv = subprocess.Popen(['node', os.path.join(SITE, 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(200):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
B = f'http://127.0.0.1:{P}'
def node_expect(states, today):
    tmp = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False); json.dump(states, tmp); tmp.close()
    out = json.loads(subprocess.run(['node', os.path.join(SITE, 'tools/financial-tests/independent/hsu_page_batch.js'), tmp.name, today], capture_output=True, text=True, check=True).stdout)
    os.unlink(tmp.name); return out
def open_state(pg, st, hash_='#results'):
    pg.goto(B + '/journey/compare/'); pg.wait_for_selector('[data-hsu] .hsu-card')
    pg.evaluate("() => history.replaceState(null, '', '" + hash_ + "')"); pg.evaluate("(s) => sessionStorage.setItem('gw.hsu.v1', JSON.stringify(s))", st)   # the hash first (no popstate), then this tab's state
    pg.reload(); pg.wait_for_selector('[data-hsu] .hsu-card')
def shown(pg):
    return pg.evaluate("""() => { const t = (s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; };
      const out = {}; ['hold', 'sell', 'upgrade'].forEach((k) => { out[k] = { pos: t('[data-pos="' + k + '"]'), diff: t('[data-diff="' + k + '"]'), cash: t('[data-row="' + k + '.cash"]'), cpf: t('[data-row="' + k + '.cpf"]'), mo: t('[data-row="' + k + '.mo"]'), state: t('[data-state="' + k + '"]') }; });
      out.answer = t('[data-ans]'); out.view = document.querySelector('[data-cols]') ? 'results' : 'figures'; out.global = t('[data-global]'); return out; }""")

try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        ctx = br.new_context(viewport={'width': 1440, 'height': 900}); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(B + '/journey/compare/'); pg.wait_for_selector('[data-hsu] .hsu-card')
        today = pg.evaluate("(() => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })()")
        EXP = node_expect(STATES, today)
        # ---------- A parity ----------
        bad, n_pos, n_state, kinds = [], 0, 0, {}
        for i, (st, ex) in enumerate(zip(STATES, EXP)):
            open_state(pg, st); sh = shown(pg)
            if sh['view'] != 'results': bad.append((i, 'view', sh['view'])); continue
            if ex['answer'] != sh['answer'] and not (ex['answer'] is None and (sh['answer'] == 'Not enough figures to compare yet.' or sh['answer'].startswith('Only keeping your flat'))): bad.append((i, 'answer', ex['answer'], sh['answer']))
            for k in ('hold', 'sell', 'upgrade'):
                e, d = ex['choices'][k], sh[k]; kinds[e['status'] + ':' + str(e['reason'])] = kinds.get(e['status'] + ':' + str(e['reason']), 0) + 1
                if e['position'] is not None:
                    n_pos += 1
                    if d['pos'] != money(e['position']): bad.append((i, k, 'pos', d['pos'], money(e['position'])))
                    if k != 'hold' and e['vs'] is not None and not (d['diff'] or '').startswith(money_k(e['vs']) if round(e['vs'] / 1000) else 'About'): bad.append((i, k, 'diff', d['diff'], e['vs']))
                else:
                    n_state += 1
                    if d['pos'] is not None or not d['state']: bad.append((i, k, 'no position expected, a reason shown', d))
                    if e['reason'] == 'within-mop' and e['mopEndsIn'] and 'ends in' not in (d['state'] or ''): bad.append((i, k, 'mop text', d['state']))
                if e['cash'] is not None and (d['cash'] != money(e['cash']) or d['cpf'] != money(e['cpf'])): bad.append((i, k, 'today', d['cash'], d['cpf'], e['cash'], e['cpf']))
                if e['cash'] is None and d['cash'] is not None: bad.append((i, k, 'today shown without the engine', d['cash']))
                if e['monthly'] is not None and d['mo'] is not None and d['mo'] != money(e['monthly']): bad.append((i, k, 'monthly', d['mo'], e['monthly']))
        check('A: 60 households, the page shows the engine’s figures exactly (%d positions, %d choices with a reason instead)' % (n_pos, n_state), not bad and n_pos > 80 and n_state > 30, bad[:4])
        check('A: the states seen include within-MOP, MOP not given, no housing yet, not possible and ok (%s)' % kinds, all(any(k.startswith(x) for k in kinds) for x in ('stop:within-mop', 'incomplete:None', 'incomplete:housing', 'ok:None')))
        # ---------- B states ----------
        base = {'n': '2', 'p0age': 40, 'p0inc': 9000, 'p0res': 'SC', 'p1age': 38, 'p1inc': 7000, 'p1res': 'SC', 'couple': 'yes', 'cash': 150000, 'cpf': 80000, 'htype': 'hdb', 'hown': 'both', 'hval': 700000, 'hcpf': 260000,
                'hloan': 'yes', 'howe': 150000, 'hmo': 1200, 'hlender': 'hdb', 'mop': 'met', 'hmc': 90, 'nprice': 1800000, 'nmc': 450}
        st = lambda **kw: {'v': 1, 'f': dict(base, **kw), 'o': {}, 'from': None}
        open_state(pg, st()); sh = shown(pg)
        check('B: Sell before “where you’d live”: today’s cash and CPF only, no 5-year figure, and it says what to add', sh['sell']['pos'] is None and sh['sell']['cash'] == '$421,740' and sh['sell']['cpf'] == '$340,000' and 'where you would live' in (sh['sell']['state'] or ''), sh['sell'])
        check('B: …and Hold and Upgrade are still compared', sh['hold']['pos'] == '$758,601' and sh['upgrade']['pos'] == '$416,680' and 'ahead of upgrading' in (sh['answer'] or ''), sh['answer'])
        open_state(pg, st(live='rent', rent=3500)); sh = shown(pg)
        check('B: the worked example: Hold $758,601 · Sell $551,740 · Upgrade $416,680; about $207,000 and $342,000 (the P4 concept)', sh['hold']['pos'] == '$758,601' and sh['sell']['pos'] == '$551,740' and sh['upgrade']['pos'] == '$416,680' and sh['answer'] == 'Keeping your flat leaves you about $207,000 ahead of selling and renting, and about $342,000 ahead of upgrading.', sh)
        be = pg.locator('[data-breakeven]').inner_text() if pg.locator('[data-breakeven]').count() else ''
        check('B: the break-even line says 3.5% a year, and that it is arithmetic, not a forecast', '3.5% a year' in be and 'not a forecast' in be, be)
        lab = pg.locator('[data-label]').inner_text(); note = pg.locator('[data-note]').inner_text()
        check('B: labelled a comparison under the visitor’s assumptions, not a recommendation or a forecast; the position is not money to spend', 'not a recommendation or a price forecast' in lab and 'not money you can spend' in note, (lab, note))
        open_state(pg, st(live='rent', rent=3500, mop='notyet', mopcat='standard', mopmon='2023-02')); sh = shown(pg)
        check('B: within the MOP: Sell and Upgrade stop with the month it ends, nothing compared', sh['sell']['pos'] is None and sh['upgrade']['pos'] is None and 'Feb 2028' in (sh['sell']['state'] or '') and 'appeal' in (sh['sell']['state'] or '') and sh['hold']['pos'] == '$758,601' and sh['answer'] == 'Only keeping your flat can be worked out now: it is within its minimum occupation period until Feb 2028.', sh)
        open_state(pg, st(live='rent', rent=3500, mop='unsure')); sh = shown(pg)
        check('B: MOP unsure or a special case (SERS, early sale): asked, no Sell or Upgrade result, never a guess', sh['sell']['pos'] is None and sh['upgrade']['pos'] is None and 'minimum occupation period' in (sh['sell']['state'] or '') and 'SERS' in (sh['sell']['state'] or ''), sh['sell'])
        open_state(pg, st(live='rent', rent=3500, nprice=4500000)); sh = shown(pg)
        check('B: not possible at these figures: said, no 5-year figure', sh['upgrade']['pos'] is None and 'Not possible' in (sh['upgrade']['state'] or ''), sh['upgrade'])
        open_state(pg, st(live='rent', rent=3500, nmc='')); sh = shown(pg)
        check('B: recurring costs given for some homes only: the home missing them has no 5-year figure, no comparison sentence, and the page asks for it', sh['global'] and 'maintenance' in sh['global'] and sh['upgrade']['pos'] is None and 'maintenance' in (sh['upgrade']['state'] or '') and sh['answer'] == 'Not enough figures to compare yet.' and sh['sell']['diff'] is None, sh)
        open_state(pg, st(htype='private', hbought=today[:4] + '-01-02', mop='', live='none', hval=1500000, hcpf=300000, nprice=2500000)); pg.locator('[data-workings] summary').click()
        w = pg.locator('[data-work]').inner_text()
        check('B: a private home sold within 4 years: Seller’s Stamp Duty in the sale', 'Seller’s Stamp Duty' in w, w[:300])
        open_state(pg, st(n='1', p0res='PR', hown='0', live='none', cash=500000)); pg.locator('[data-workings] summary').click(); w = pg.locator('[data-work]').inner_text()
        check('B: a PR buying: ABSD in the purchase (sell first: 5% for a PR’s first home)', 'ABSD' in w and 'no ABSD' not in w, w[:600])
        # ---------- C entry ----------
        pg.goto(B + '/journey/compare/'); pg.evaluate("() => { sessionStorage.setItem('gw.hsu.v1', JSON.stringify({ v: 1, f: { hval: 999999, cash: 1 }, o: {} })); sessionStorage.setItem('gw.hsu.handoff', JSON.stringify({ v: 1, a: { cash: 123456 } })); }")
        pg.goto(B + '/tools/'); pg.click('a[href="../journey/compare/"]'); pg.wait_for_selector('[data-hsu] .hsu-card')
        vals = pg.evaluate("() => [document.querySelector('[data-k=hval]').value, document.querySelector('[data-k=cash]').value, sessionStorage.getItem('gw.hsu.handoff')]")
        check('C: from the Calculators page: starts clean (no old figures, a stray handoff ignored and removed)', vals == ['', '', None], vals)
        pmm = {'v': 1, 'a': {'sit': 'upgrade', 'n': '2', 'p0age': 40, 'p0inc': 9000, 'p0res': 'SC', 'p1age': 38, 'p1inc': 7000, 'p1res': 'SC', 'htype': 'hdb', 'hown': 'both', 'hloan': 'yes', 'hmo': 1200, 'ptype': 'completed', 'cash': 150000, 'cpf': 80000, 'sprice': 700000, 'sloan': 150000, 'scpf': 260000, 'optSeen': True}, 'homes': [{'name': 'A', 'price': 1800000, 'type': 'completed'}], 'step': 'options'}
        pg.goto(B + '/tools/'); pg.evaluate("(s) => sessionStorage.setItem('gw.pmm.v2', JSON.stringify(s))", pmm); pg.goto(B + '/journey/#options'); pg.wait_for_selector('[data-pmm-hsu]')
        pg.click('[data-pmm-hsu]'); pg.wait_for_selector('[data-hsu] .hsu-card')
        got = pg.evaluate("() => ({ hval: document.querySelector('[data-k=hval]').value, howe: document.querySelector('[data-k=howe]').value, hcpf: document.querySelector('[data-k=hcpf]').value, nprice: document.querySelector('[data-k=nprice]').value, cash: document.querySelector('[data-k=cash]').value, sub: document.querySelector('.hsu-sub').textContent, hand: sessionStorage.getItem('gw.hsu.handoff'), url: location.search })")
        check('C: from Plan My Move V2: its answers are carried over once (home, loan, CPF, cash, the home considered); the handoff is removed', got['hval'] == '700,000' and got['howe'] == '150,000' and got['hcpf'] == '260,000' and got['nprice'] == '1,800,000' and got['cash'] == '150,000' and 'Plan My Move' in got['sub'] and got['hand'] is None and got['url'] == '?from=pmm', got)
        pg.locator('[data-k="mop"] [data-v="met"]').click(); pg.reload(); pg.wait_for_selector('[data-hsu] .hsu-card')
        check('C: a reload keeps this tab’s figures (including what was added)', pg.evaluate("() => document.querySelector('[data-k=hval]').value") == '700,000' and pg.locator('[data-k="mop"] [data-v="met"]').get_attribute('aria-checked') == 'true')
        pg.goto(B + '/journey/compare/'); pg.wait_for_selector('[data-hsu] .hsu-card')
        check('C: typing the address again (a new arrival, not a reload): starts clean', pg.evaluate("() => document.querySelector('[data-k=hval]').value") == '')
        pg.goto(B + '/tools/'); pg.evaluate("(s) => sessionStorage.setItem('gw.pmm.v2', JSON.stringify(s))", dict(pmm, a=dict(pmm['a'], sit='first'))); pg.goto(B + '/journey/#options'); pg.wait_for_selector('[data-pmm-explore]')
        check('C: Plan My Move for a first-home buyer: no Hold, sell or upgrade link (it needs a home owned)', pg.locator('[data-pmm-hsu]').count() == 0)
        # ---------- D layout ----------
        open_state(pg, st(live='rent', rent=3500))
        lay = pg.evaluate("() => ({ sum: getComputedStyle(document.querySelector('.hsu-sum')).display, open: [...document.querySelectorAll('[data-more]')].every((d) => d.open), sw: document.documentElement.scrollWidth, w: innerWidth })")
        check('D 1440: three columns with their rows open, no summary list, no sideways scroll', lay['sum'] == 'none' and lay['open'] and lay['sw'] <= lay['w'], lay)
        pg.locator('[data-ed="years"]').click(); pg.select_option('[data-k="o.years"]', '10'); pg.wait_for_function("() => /After 10 years/.test(document.querySelector('[data-answer]').textContent)")
        sh = shown(pg); ex10 = node_expect([dict(st(live='rent', rent=3500), o={'years': 10})], today)[0]
        check('D: changing an assumption (10 years) redraws from the engine: the same figures as Node', sh['hold']['pos'] == money(ex10['choices']['hold']['position']) and sh['upgrade']['pos'] == money(ex10['choices']['upgrade']['position']), (sh['hold']['pos'], ex10['choices']['hold']['position']))
        pg.evaluate("() => { window.print = () => {}; }"); pg.click('[data-pdf]')
        sheet = pg.locator('.gw-sheet-host').inner_text() if pg.locator('.gw-sheet-host').count() else ''
        check('D: Save as PDF builds the one-page sheet from the same figures', 'Hold, sell or upgrade?' in sheet and money(ex10['choices']['hold']['position']) in sheet, sheet[:300])
        check('D 1440: no script error', not errs, errs[:3])
        ctx.close()
        for w in (390, 360):
            c2 = br.new_context(viewport={'width': w, 'height': 800}, device_scale_factor=1); p2 = c2.new_page(); e2 = []; p2.on('pageerror', lambda e: e2.append(str(e)))
            open_state(p2, st(live='rent', rent=3500))
            lay = p2.evaluate("() => ({ sum: getComputedStyle(document.querySelector('.hsu-sum')).display, closed: [...document.querySelectorAll('[data-more]')].every((d) => !d.open), heads: [...document.querySelectorAll('.hsu-c .hd')].every((h) => getComputedStyle(h).display === 'none'), rows: [...document.querySelectorAll('.hsu-sum li')].map((l) => l.textContent), sw: document.documentElement.scrollWidth, w: innerWidth, sumTop: document.querySelector('.hsu-sum').getBoundingClientRect().top + scrollY, colsTop: document.querySelector('[data-cols]').getBoundingClientRect().top + scrollY })")
            check(f'D {w}: the summary first (position, difference, monthly cost for each choice), details behind sections, no sideways scroll', lay['sum'] == 'block' and lay['closed'] and lay['heads'] and len(lay['rows']) == 3 and '$758,601' in lay['rows'][0] and '$1,290 a month' in lay['rows'][0] and '$207,000 behind' in lay['rows'][1] and lay['sumTop'] < lay['colsTop'] and lay['sw'] <= lay['w'], lay)
            p2.locator('[data-more="upgrade"] summary').click()
            check(f'D {w}: a section opens to the choice’s cash, CPF and loan', p2.locator('[data-row="upgrade.cash"]').is_visible() and p2.locator('[data-row="upgrade.cash"]').inner_text() == '$247,140')
            p2.goto(B + '/journey/compare/'); p2.wait_for_selector('[data-see]')
            check(f'D {w}: the figures form fits (no sideways scroll), no script error', p2.evaluate('document.documentElement.scrollWidth') <= w and not e2, e2[:2])
            c2.close()
        br.close()
finally:
    srv.terminate()
print(f'hsu-render: {ok_n} passed, {fail_n} failed')
raise SystemExit(1 if fail_n else 0)
