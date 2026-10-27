import os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
"""Financial experience audit (V3.6, 26 Oct 2026): Ken's test cases, checked against figures worked out from the published rules,
NOT from Groundwork's engines, and against what the buyer reads on the card.
Run from the site folder: python3 tools/financial-tests/audit-render.py
 A  $2.65M new launch, PR, second home, no housing loan, 75%, no CPF: BSD, ABSD, each payment stage, the totals and the instalment
 B  $1.2M completed home, SC, first home, $200k CPF: the stages from option to completion reconcile
 C  tenure: 31-35 years offered on Cost and Borrow; a tenure past 75 is said, not silently shortened; the lower loan limit is put in dollars
 D  CPF: 'up to $X' never reads as the buyer having it; a second home names the set-aside
 E  sale: 2% + GST by default, changeable; loan, CPF refund, legal fees and penalty all reflected
Rules used (sources: IRAS, MAS, CPF, HDB, checked 26 Oct 2026):
  BSD 1/2/3/4/5/6% tiers; ABSD PR 5/30/35%; LTV 75% (0 loans), 55% when the tenure is over 30 years or runs past 65, cash at least 5% / 10%;
  new launch: 5% booking (cash), 15% at the S&P within 8 weeks, stamp duty within 14 days of the S&P; the buyer's share goes first, then the bank."""
SITE = pathlib.Path(__file__).resolve().parents[2]
def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
P = port(); srv = subprocess.Popen(['node', str(SITE / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
B = f'http://127.0.0.1:{P}'
ok = fail = 0
def check(n, c, i=''):
    global ok, fail
    if c: ok += 1; print('  ok  ', n)
    else: fail += 1; print('  FAIL', n, str(i)[:500])
def bsd(p):
    t, rest = 0, p
    for size, r in [(180000, .01), (180000, .02), (640000, .03), (500000, .04), (1500000, .05), (float('inf'), .06)]:
        a = min(rest, size); t += a * r; rest -= a
        if rest <= 0: break
    return round(t)
def pmt(L, r, y): i = r / 12; n = y * 12; return L * i / (1 - (1 + i) ** -n)
D = lambda v: '${:,.0f}'.format(v)
def settle(pg): pg.wait_for_function("()=>!window.__f3Settled||window.__f3Settled()"); pg.evaluate("document.activeElement&&document.activeElement.blur()"); pg.wait_for_timeout(250)
def fresh(pg, path): pg.goto(B + path); pg.wait_for_selector('[data-out]'); pg.evaluate("sessionStorage.clear()"); pg.reload(); pg.wait_for_selector('[data-out]')
def opt(pg, chip, text): pg.evaluate("k=>window.__f3OpenChip(k)", chip); pg.wait_for_timeout(150); pg.locator(f'[data-optl="{chip}"] .f3-opt', has_text=text).first.click(); settle(pg)
def close(pg): pg.evaluate("()=>window.__f3OpenChip&&window.__f3OpenChip(null)"); settle(pg)
def rows(pg):   # the "When you pay it" rows: [label, line, amount]
    # V3.7: one row per payment (.f3-sr): its heading, when and how it is paid, and the amount
    return pg.evaluate("()=>[...document.querySelectorAll('[data-stages] .f3-sr')].map(r=>[r.querySelector('.f3-sl').textContent.trim(),((r.querySelector('.f3-sw')||{}).textContent||'').trim(),r.querySelector('.f3-sr1>b').textContent.trim()])")
amt = lambda s: int(re.sub(r'[^0-9]', '', s.split('/')[0]))
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for tag, vp in (('desktop', {'width': 1440, 'height': 900}), ('phone', {'width': 390, 'height': 844})):
        ctx = br.new_context(viewport=vp, is_mobile=tag == 'phone', has_touch=tag == 'phone'); pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        # ---------- A. $2.65M new launch, PR, second home ----------
        P0 = 2650000; b = bsd(P0); ab = P0 * .30; loan = P0 * .75
        check(f'{tag} A: the independent figures are Ken\'s (BSD $102,100, ABSD $795,000, 20% + duties $1,427,100, in all $1,559,600, $9,489 a month)',
              b == 102100 and ab == 795000 and P0 * .20 + b + ab == 1427100 and P0 * .25 + b + ab == 1559600 and round(pmt(loan, .04, 30)) == 9489)
        fresh(pg, '/tools/payment-planner/'); pg.fill('[data-k="price"]', '2,650,000'); settle(pg)
        opt(pg, 'who', 'Permanent Resident'); opt(pg, 'who', 'Second home'); pg.evaluate("()=>document.querySelector('[data-home=\"0\"] [data-hk=\"mort\"][data-v=\"no\"]').click()"); settle(pg); close(pg)   # V3.12 Stage 2: the home's loan status answered (no loan), as the old “second home” assumed
        o = pg.inner_text('[data-out]'); r = rows(pg)
        check(f'{tag} A: the card: cash $1,559,600 with BSD and ABSD named, $9,489 a month once fully drawn', D(P0 * .25 + b + ab) in o and D(b) + ' BSD + ' + D(ab) + ' ABSD' in o and D(ab) in o and '$9,489' in o and 'once fully drawn' in o, o[:600])
        want = [('Booking fee', P0 * .05, 'cash'), ('At the S&P', P0 * .15, 'cash or CPF'), ('Buyer’s stamp duty', b, 'Within 14 days of signing the S&P'), ('ABSD', ab, 'Within 14 days of signing the S&P'), ('Upfront, in all', P0 * .20 + b + ab, ''), ('Foundation stage, your share', P0 * .05, 'the bank pays the rest'), ('From you, in all', P0 * .25 + b + ab, ''), ('The bank pays', loan, ''), ('Then each month', 9489, '')]
        check(f'{tag} A: "When you pay it" (V3.7): booking fee, S&P, BSD and ABSD apart, the upfront subtotal, the buyer\'s last share at the foundation stage, the total, then the bank; each amount as worked out',
              len(r) == len(want) and all(x[0].startswith(w[0]) and amt(x[2]) == w[1] and w[2] in x[1] for x, w in zip(r, want)), r)
        check(f'{tag} A: BSD $102,100 and ABSD $795,000 are separate rows, before construction', len(r) > 5 and amt(r[2][2]) == 102100 and amt(r[3][2]) == 795000 and r[5][0].startswith('Foundation'))
        check(f'{tag} A: the stages reconcile: booking + S&P + BSD + ABSD = $1,427,100 (the headline); with the foundation share, $1,559,600 in all', len(r) > 6 and sum(amt(x[2]) for x in r[:4]) == amt(r[4][2]) == 1427100 == amt(pg.inner_text('[data-answer]')) and amt(r[4][2]) + amt(r[5][2]) == amt(r[6][2]) == 1559600)
        check(f'{tag} A: the booking fee is said to be cash (the 5% minimum)', 'cash' == r[0][1].split('· ')[-1])
        check(f'{tag} A: the page\'s own reconciliation check agrees', pg.evaluate("()=>{const g=window.__f3Stages();return !!(g&&g.ok)}"))
        sh = pg.evaluate("()=>JSON.stringify(window.__f3Sheet())")
        check(f'{tag} A: the PDF sheet has the same stages: upfront S$1,427,100, then the foundation share, S$1,559,600 in all, the bank S$1,987,500', all(x in sh for x in ['Upfront, in all', 'S$1,427,100', 'From you, in all', 'S$1,559,600', 'The bank pays', 'S$1,987,500']), sh[-900:])
        # ---------- B. $1.2M completed, SC first home, $200k CPF ----------
        P1 = 1200000; b1 = bsd(P1)
        fresh(pg, '/tools/payment-planner/'); pg.fill('[data-k="price"]', '1,200,000'); settle(pg); opt(pg, 'pkind', 'Completed private'); opt(pg, 'cpf', '$200,000'); close(pg)
        r = rows(pg)
        want = [('Option fee', P1 * .01, 'cash'), ('Exercising the option', P1 * .04, 'cash'), ('Buyer’s stamp duty', b1, 'Within 14 days of exercising the option'), ('Balance at completion', P1 * .20, 'cash or CPF'), ('From you, in all', P1 * .25 + b1, ''), ('The bank pays', P1 * .75, 'At completion'), ('Then each month', 4297, '')]
        check(f'{tag} B: completed home: 1% option, 4% exercise (the 5% cash minimum), stamp duty, 20% at completion, then the bank; amounts as worked out',
              len(r) == len(want) and all(x[0].startswith(w[0]) and amt(x[2]) == w[1] and w[2] in x[1] for x, w in zip(r, want)), r)
        o = pg.inner_text('[data-out]'); check(f'{tag} B: with CPF entered, the card shows the $200,000 used and the cash after it ({D(P1 * .25 + b1 - 200000)}); no "up to" line', bool(re.search(r'CPF used\s+\$200,000', o)) and D(P1 * .25 + b1 - 200000) in o and 'can pay up to' not in o, o[:600])
        # ---------- C. tenure ----------
        fresh(pg, '/tools/payment-planner/'); pg.fill('[data-k="price"]', '2,000,000'); settle(pg)
        pg.evaluate("window.__f3OpenChip('who','p.0.age')"); pg.locator('[data-k="p.0.age"]:visible').first.fill('45'); close(pg)
        pg.evaluate("window.__f3OpenChip('rate')"); pg.wait_for_timeout(150); t = pg.inner_text('[data-optl="rate"]')
        check(f'{tag} C: Cost offers 35, 30, 25 and 20 years and another tenure', all(f'{y} years' in t for y in (35, 30, 25, 20)) and 'Another tenure or rate' in t, t)
        pg.locator('[data-optl="rate"] .f3-opt', has_text='35 years').first.click(); settle(pg); close(pg)
        o = pg.inner_text('[data-out]')
        check(f'{tag} C: age 45 asking for 35 years: the shorter 30 years is said, with MAS and the bank told apart', 'You chose 35 years' in o and 'by age 75' in o and 'MAS allows up to 35 years' in o and 'a bank may decide differently' in o, o[-900:])
        check(f'{tag} C: the loan runs past 65, so 55% of the price and at least 10% cash, and the extra upfront in dollars ($400,000 at $2M)',
              '55% of the price instead of 75%' in o and 'at least 10% must be cash' in o and '$400,000 more from you' in o and '$1,100,000 loan' in o, o[-900:])
        fresh(pg, '/tools/tdsr/'); pg.fill('[data-k="p.0.fixed"]', '15,000'); settle(pg)
        pg.evaluate("window.__f3OpenChip('rate')"); pg.wait_for_timeout(150); t = pg.inner_text('[data-optl="rate"]')
        check(f'{tag} C: Borrow offers the standard tenure and 35, 30, 25 and 20 years for a private home', 'Standard' in t and all(f'{y} years' in t for y in (35, 30, 25, 20)), t)
        close(pg)
        # ---------- D. CPF on a second home ----------
        fresh(pg, '/tools/payment-planner/'); pg.fill('[data-k="price"]', '1,500,000'); settle(pg); opt(pg, 'who', 'Second home'); pg.evaluate("()=>document.querySelector('[data-home=\"0\"] [data-hk=\"mort\"][data-v=\"no\"]').click()"); settle(pg); close(pg)
        o = pg.inner_text('[data-out]')
        check(f'{tag} D: second home: "up to" is qualified, and the CPF set-aside is named', 'If you have it, CPF can pay up to' in o and 'only CPF above a set-aside can be used' in o, o[:700])
        check(f'{tag} D: no wording says CPF "can come from" as if the buyer had it', 'can come from CPF' not in o)
        # ---------- E. sale proceeds ----------
        r = pg.evaluate("()=>{const a=GW_FIN3.sell({sale:{type:'hdb',price:750000,loan:250000,cpfRefund:205000,penalty:4000,legal:3000}});const b=GW_FIN3.sell({sale:{type:'hdb',price:750000,loan:250000,cpfRefund:205000,penalty:4000,legal:3000,comm:1}});return [a.total,a.cash,b.total]}")
        e = 750000 - 250000 - 4000 - 3000 - 750000 * .02 * 1.09
        check(f'{tag} E: sale $750k: 2% + 9% GST, loan, $3,000 legal and $4,000 penalty come off; $205,000 goes back to CPF first', abs(r[0] - e) <= 1 and abs(r[1] - (e - 205000)) <= 1, (r, e))
        check(f'{tag} E: a 1% commission is honoured when chosen', abs(r[2] - (e + 750000 * .01 * 1.09)) <= 1, r)
        check(f'{tag} no script errors', not errs, errs)
        ctx.close()
    br.close()
finally:
    srv.terminate()
print(f'\naudit-render: {ok} passed, {fail} failed'); sys.exit(1 if fail else 0)
