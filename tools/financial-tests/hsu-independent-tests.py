"""Hold vs Sell vs Upgrade, P1 (Master Planning approval, 6 Nov 2026): an INDEPENDENT check of GW_ENGINE.compare.

The figures are worked out here again from the published rules (independent/rules_model.py: IRAS BSD/ABSD, MAS TDSR/LTV/tenure) and plain loan arithmetic
written for this test, not from Groundwork's JavaScript, then compared with the engines (independent/hsu_batch.js) to the cent:
  the sale (2% commission + 9% GST, $3,000 legal fees, the loan repaid, the CPF refund), the purchase (75% LTV or the TDSR loan, 5% cash, CPF for the
  rest of the down payment, BSD + ABSD in cash, the $5,000 purchase-cost estimate), both loans month by month, the price assumption, rent and recurring
  costs, and the one ledger: position = equity + cash left + CPF left − everything paid for housing.
Cases: 300 seeded households (one or two buyers under 55; an HDB flat, or a private home held more than four years; a completed private home next) ×
1, 5 and 10 years. P3 (6 Nov 2026): each HDB flat has a category and a completion month; its minimum occupation period (HDB: Standard 5 years, Plus and
Prime 10, Fresh Start 20, from legal completion) is worked out here again, and a flat still within it can be neither sold nor upgraded from (stop). Run from the site folder: python3 tools/financial-tests/hsu-independent-tests.py
"""
import json, math, os, random, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'independent'))
import rules_model as M

random.seed(20261106)
ok = fail = 0
def check(name, cond, info=''):
    global ok, fail
    if cond: ok += 1
    else:
        fail += 1
        if fail < 15: print('  FAIL', name, str(info)[:500])

COMMISSION, GST, LEGAL, PURCHASE_COSTS, PLAN_RATE, HDB_RATE = .02, .09, 3000, 5000, .04, .026
MOP_YEARS = {'standard': 5, 'plus': 10, 'prime': 10, 'freshStart': 20}   # HDB, Conditions after buying (checked 6 Nov 2026)
AS_OF = (2026, 11)

def mop_met(mop):
    y, m = map(int, mop['completed'].split('-'))
    end = (y + MOP_YEARS[mop['category']]) * 12 + (m - 1)
    return AS_OF[0] * 12 + AS_OF[1] - 1 > end, '%d-%02d' % (end // 12, end % 12 + 1)

def running(balance, monthly, rate, months):
    """a loan already running: month by month, the last payment only what is owed. Returns (balance, interest, paid)."""
    b, it_sum, paid = balance, 0.0, 0.0
    for _ in range(months):
        if b <= 1e-6: b = 0.0; break
        it = b * rate / 12; pay = min(monthly, b + it)
        b -= pay - it; it_sum += it; paid += pay
    return max(b, 0.0), it_sum, paid

def fresh(loan, rate, years, months):
    """a new loan from its start (closed form)."""
    n = round(years * 12); i = rate / 12; m = min(months, n)
    P = loan / M.af(rate, years)
    bal = loan * (1 + i) ** m - P * ((1 + i) ** m - 1) / i if m < n else 0.0
    return bal, P * m - (loan - bal), P * m, P

def sale(c):
    s = c['owned'][0]['sale']; comm = s['price'] * COMMISSION
    costs = comm + comm * GST + LEGAL
    total = s['price'] - s['loan'] - costs
    return {'total': total, 'cash': total - s['cpfRefund'], 'cpf': s['cpfRefund'], 'costs': costs}

def purchase(c, price, sl):
    """sell first, so after the sale each buyer owns no home: 75% LTV / 5% cash, ABSD as for a first home."""
    bs = [dict(age=p['age'], fixed=p['income']['fixed'], variable=0) for p in c['people']]
    earners = [b for b in bs if M.gross(b) > 0]
    years = M.std_tenure(M.age_used(earners))
    debts = sum(l['monthly'] for l in c['otherLoans'])
    loan = min(.75 * price, M.tdsr_loan(earners, debts, years))
    rate = M.absd_rate([{'res': p['res'], 'owned': 0} for p in c['people']], c['household'].get('couple'))
    bsd, absd = M.bsd(price), M.duty_at(price, rate)
    cmin = .05 * price; flex = price - loan - cmin
    cpf_pool = c['household']['cpf'] + sl['cpf']
    cpf_used = min(cpf_pool, flex)
    cash_needed = cmin + (flex - cpf_used) + bsd + absd
    return {'loan': loan, 'years': years, 'duty': bsd + absd, 'cashLeft': c['household']['cash'] + sl['cash'] - cash_needed - PURCHASE_COSTS, 'cpfLeft': cpf_pool - cpf_used}

def model(c, o):
    yrs = o['years']; m = yrs * 12; hh = c['household']; h = c['owned'][0]; s = h['sale']
    pc, pn = o['pct']['current'], o['pct']['next']
    rec_cur, rec_next = h.get('monthlyCosts'), c['purchase'].get('monthlyCosts')
    out = {}
    # Hold
    rate = h['loan']['ratePct'] / 100 if 'loan' in h else 0
    bal, it, paid = running(s['loan'], h['loan']['monthly'], rate, m) if 'loan' in h else (0, 0, 0)
    v = s['price'] * (1 + pc / 100) ** yrs
    rec = (rec_cur or 0) * m
    out['hold'] = dict(position=v - bal + hh['cash'] + hh['cpf'] - (paid + rec), loanEnd=bal, interest=it, cash=hh['cash'], cpf=hh['cpf'])
    sl = sale(c)
    # Sell (rent)
    rent = o['sell']['rent'] * m
    out['sell'] = dict(position=hh['cash'] + sl['cash'] + hh['cpf'] + sl['cpf'] - rent, cash=hh['cash'] + sl['cash'], cpf=hh['cpf'] + sl['cpf'])
    # Upgrade
    pu = purchase(c, c['purchase']['price'], sl)
    if pu['cashLeft'] < 0 or pu['cpfLeft'] < 0:
        out['upgrade'] = dict(stop=True)
    else:
        nb, nit, npaid, P = fresh(pu['loan'], PLAN_RATE, pu['years'], m)
        nv = c['purchase']['price'] * (1 + pn / 100) ** yrs
        out['upgrade'] = dict(position=nv - nb + pu['cashLeft'] + pu['cpfLeft'] - (npaid + (rec_next or 0) * m), loan=pu['loan'], loanEnd=nb, interest=nit, cash=pu['cashLeft'], cpf=pu['cpfLeft'], duty=pu['duty'], years=pu['years'])
    return out

def household():
    two = random.random() < .6; hdb = random.random() < .6
    price = round((450000 + random.random() * 600000 if hdb else 900000 + random.random() * 1600000) / 1000) * 1000
    owed = 0 if random.random() < .15 else round(random.random() * price * .5 / 1000) * 1000
    rate = 2.6 if hdb and random.random() < .6 else round((2 + random.random() * 2) * 100) / 100
    mo = round(owed * rate / 1200 * 1.15 + random.random() * 3000) if owed else 0
    people = [{'age': 30 + random.randrange(22), 'res': random.choice(['SC', 'SC', 'SC', 'PR']), 'income': {'fixed': round(4000 + random.random() * 16000)}}]
    if two: people.append({'age': 30 + random.randrange(22), 'res': 'SC', 'income': {'fixed': round(random.random() * 12000)}})
    owned = {'id': 'home', 'type': 'hdb' if hdb else 'private', 'owners': [0, 1] if two else [0], 'intent': 'keep',
             'sale': {'price': price, 'loan': owed, 'cpfRefund': round(random.random() * (price - owed) * .6)}}
    if hdb: owned['mop'] = {'category': random.choice(['standard', 'standard', 'standard', 'plus', 'freshStart']), 'completed': '%d-%02d' % (2004 + random.randrange(20), 1 + random.randrange(12))}
    if not hdb: owned['sale']['bought'] = '2015-0%d-15' % (1 + random.randrange(9)); owned['sale']['sold'] = '2026-11-06'   # held over 4 years: no SSD
    if owed: owned['loan'] = {'monthly': mo, 'ratePct': rate}
    rec = random.random() < .7
    if rec: owned['monthlyCosts'] = round(100 + random.random() * 400)
    c = {'schema': 'gw-case-v1', 'people': people, 'household': {'cash': round(random.random() * 400000), 'cpf': round(random.random() * 250000)},
         'otherLoans': [{'person': 0, 'monthly': round(random.random() * 1200)}] if random.random() < .2 else [], 'owned': [owned],
         'purchase': {'type': 'completed', 'price': round(price * (1.2 + random.random() * 1.5) / 1000) * 1000}, 'financing': {}}
    if two: c['household']['couple'] = True
    if rec: c['purchase']['monthlyCosts'] = round(200 + random.random() * 600)
    o = {'asOf': '%d-%02d' % AS_OF, 'pct': {'current': random.choice([0, 0, 2, -1.5]), 'next': random.choice([0, 0, 3, -2])}, 'sell': {'housing': 'rent', 'rent': 2500 + round(random.random() * 3000)}}
    return c, o

cases = []
for _ in range(300):
    c, o = household()
    for y in (1, 5, 10):
        cases.append({'case': c, 'opts': dict(o, years=y)})
tmp = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False); json.dump(cases, tmp); tmp.close()
eng = json.loads(subprocess.run(['node', os.path.join(HERE, 'independent', 'hsu_batch.js'), tmp.name], capture_output=True, text=True, check=True).stdout)
os.unlink(tmp.name)

near = lambda a, b, tol=0.01: a is not None and b is not None and abs(a - b) <= tol
n = {'hold': 0, 'sell': 0, 'upgrade': 0, 'stop': 0, 'compared': 0, 'mop': 0}
for k, (cs, e) in enumerate(zip(cases, eng)):
    want = model(cs['case'], cs['opts'])
    rec_given = 'monthlyCosts' in cs['case']['owned'][0]
    # Hold: its loan always; its position only when it is compared (renting is compared, so the recurring costs must be given)
    h = e['hold']; w = want['hold']
    check('hold #%d loan at the end and interest' % k, near(h.get('loanEnd', 0), w['loanEnd']) and near(h.get('interest', 0), w['interest']), (h, w)); n['hold'] += 1
    mop = cs['case']['owned'][0].get('mop'); within = bool(mop) and not mop_met(mop)[0]
    # renting is not compared while the flat cannot be sold (within its MOP), so recurring costs are then excluded for every home and Hold has its figure
    if rec_given or within: check('hold #%d position' % k, near(h.get('position'), w['position']), (h, w))
    else: check('hold #%d: no end figure while the recurring costs are missing' % k, 'position' not in h, h)
    if within:
        ends = mop_met(mop)[1]
        check('#%d within the MOP: Sell and Upgrade stop, ending in %s' % (k, ends), all(e[x]['status'] == 'stop' and e[x]['reason'] == 'within-mop' and e[x].get('mopEndsIn') == ends and 'position' not in e[x] for x in ('sell', 'upgrade')), (e['sell'], e['upgrade'], mop))
        check('#%d within the MOP: nothing compared' % k, not e['comparable'], e['comparable'])
        n['mop'] += 1; continue
    # Sell (rent): its housing cost is complete, so it always has an end figure
    s = e['sell']; ws = want['sell']
    check('sell #%d position, cash and CPF' % k, near(s.get('position'), ws['position']) and near(s.get('cash'), ws['cash']) and near(s.get('cpf'), ws['cpf']), (s, ws)); n['sell'] += 1
    # Upgrade
    u = e['upgrade']; wu = want['upgrade']
    if wu.get('stop'):
        check('upgrade #%d: not possible at these figures (stop) in both' % k, u['status'] == 'stop', u); n['stop'] += 1
    else:
        check('upgrade #%d loan, tenure, stamp duty' % k, near(u.get('loan'), wu['loan']) and u.get('years') == wu['years'] and near(u.get('duty'), wu['duty']), (u, wu))
        check('upgrade #%d cash and CPF left today' % k, near(u.get('todayCash'), wu['cash']) and near(u.get('todayCpf'), wu['cpf']), (u, wu))
        check('upgrade #%d loan at the end and interest' % k, near(u.get('loanEnd'), wu['loanEnd']) and near(u.get('interest'), wu['interest']), (u, wu))
        if rec_given: check('upgrade #%d position' % k, near(u.get('position'), wu['position']), (u, wu))
        n['upgrade'] += 1
    check('#%d comparable exactly when recurring costs are given for every home (renting is compared)' % k, e['comparable'] == (rec_given and u['status'] in ('ok', 'stop')), (e['comparable'], rec_given, u['status']))
    if e['comparable']: n['compared'] += 1

check('enough of each choice compared (%s)' % n, n['upgrade'] > 250 and n['stop'] > 20 and n['compared'] > 250 and n['mop'] > 50)
print('hsu-independent-tests: %d passed, %d failed (%d cases: hold %d, sell %d, upgrade %d, upgrade not possible %d, within the MOP %d, comparable %d)' % (ok, fail, len(cases), n['hold'], n['sell'], n['upgrade'], n['stop'], n['mop'], n['compared']))
sys.exit(1 if fail else 0)
