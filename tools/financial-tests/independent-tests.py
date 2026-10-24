"""Independent financial check (permanent regression test; first run as the calculator audit of 24 Oct 2026).

Compares Groundwork's engines with a SEPARATE model of the rules (independent/rules_model.py, written from IRAS, MAS, HDB and CPF sources, not from the engines):
  1. official worked examples and tables, asserted as fixed numbers (the model must match them too);
  2. seeded random clients across stamp duty, SSD, TDSR, HDB loans, mortgages, CPF for a second home, sell-first ownership and full budget searches;
  3. named client scenarios from the audit (the four C1 corrections among them).
Any difference fails. Run from the site folder: python3 tools/financial-tests/independent-tests.py   (about 30 seconds)
"""
import json, os, random, subprocess, sys, tempfile
from datetime import date, timedelta
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'independent'))
import rules_model as M

random.seed(20261024)
ok = fail = 0
def check(name, cond, info=''):
    global ok, fail
    if cond: ok += 1
    else: fail += 1; print('  FAIL', name, info)
def near(a, b, tol=1.0):
    return a is not None and b is not None and abs(a - b) <= tol

# ---------- 1. official examples: the model itself must reproduce them ----------
check('IRAS BSD on $1.5m is $44,600', M.bsd(1500000) == 44600)
check('IRAS BSD on $5m is $239,600', M.bsd(5000000) == 239600)
SC = lambda o: {'res': 'SC', 'owned': o}; PR = lambda o: {'res': 'PR', 'owned': o}; FR = lambda o: {'res': 'FR', 'owned': o}
# IRAS "ABSD rates or remission for joint purchase by a married couple" (rates from 27 Apr 2023)
for name, buyers, want in [('SC+SPR neither owns', [SC(0), PR(0)], 0), ('SC owns 1 + SPR', [SC(1), PR(0)], .20), ('SPR owns 1 + SC', [SC(0), PR(1)], .30),
                           ('SC+SPR both own 1', [SC(1), PR(1)], .30), ('SC owns 2 + SPR', [SC(2), PR(0)], .30), ('SC+SPR co-own 2', [SC(2), PR(2)], .35),
                           ('SC+FR neither owns', [SC(0), FR(0)], 0), ('SC owns 1 + FR', [SC(1), FR(0)], .60), ('SC+SC one owns 1', [SC(1), SC(0)], .20),
                           ('SPR+FR (no remission)', [PR(0), FR(0)], .60)]:
    check('IRAS couple table: ' + name, M.absd_rate(buyers, True) == want, M.absd_rate(buyers, True))
# MOM/MND release 9 May 2019 (buyers aged 25): lease covering to 80 allows 70%, to 90 allows 90% (of the 75% HDB LTV today)
check('MOM 2019: lease 55, buyers 25 -> 70% of the limit', near(M.hdb_loan([{'age': 25, 'fixed': 5000}], 55)[2], .75 * .70, 1e-9))
check('MOM 2019: lease 65, buyers 25 -> 90% of the limit', near(M.hdb_loan([{'age': 25, 'fixed': 5000}], 65)[2], .75 * .90, 1e-9))
check('IRAS SSD: bought 7 Jul 2025, sold 7 Jul 2029 -> none', M.ssd(1e6, '2025-07-07', '2029-07-07') == 0 and M.ssd(1e6, '2025-07-07', '2029-07-06') == 40000)
check('CPF 2026 BRS: OA 120,000 + SA 70,000 each -> 79,800 each', M.cpf_second([{'oa': 120000, 'sa': 70000}] * 2, True, 2026) == 159600)

# ---------- 2. seeded random clients ----------
def person(lo=25, hi=58):
    return {'age': random.randint(lo, hi), 'fixed': random.choice([3000, 4500, 6000, 8000, 10000, 12500, 16000, 22000]), 'variable': random.choice([0, 0, 500, 1500, 4000]),
            'rental': random.choice([0, 0, 0, 1800]), 'res': random.choice(['SC', 'SC', 'SC', 'PR', 'FR'])}
cases = {k: [] for k in ['duty', 'ssd', 'tdsr', 'hdbloan', 'mortgage', 'cpf2', 'afford', 'sellfirst']}
exp = {k: [] for k in cases}
for _ in range(500):
    n = random.choice([1, 2]); bs = []
    for _k in range(n):
        res = random.choice(['SC', 'SC', 'PR', 'FR']); b = {'res': res, 'owned': random.choice([0, 0, 1, 2])}
        if res != 'SC' and random.random() < .3: b['fta'] = random.choice([True, False])
        bs.append(b)
    couple = random.choice([True, False, None]) if n == 2 else None
    price = random.randint(50, 12000) * 1000 + random.choice([0, 1, 499, 999])
    cases['duty'].append({'price': price, 'buyers': bs, 'couple': couple})
    exp['duty'].append((M.bsd(price), M.duty_at(price, M.absd_rate(bs, couple))))
for _ in range(400):
    b = date(random.randint(2017, 2026), random.randint(1, 12), random.randint(1, 28))
    if b < date(2017, 3, 11): continue
    s = b + timedelta(days=random.randint(0, 6 * 365)); p = random.randint(500, 5000) * 1000
    cases['ssd'].append({'price': p, 'bought': b.isoformat(), 'sold': s.isoformat()}); exp['ssd'].append(M.ssd(p, b.isoformat(), s.isoformat()))
for _ in range(400):
    bs = [person() for _ in range(random.choice([1, 2]))]; d = random.choice([0, 0, 600, 1500, 3000])
    cases['tdsr'].append({'buyers': bs, 'debts': d}); y = M.std_tenure(M.age_used(bs)); exp['tdsr'].append((y, M.tdsr_loan(bs, d, y) if y >= 1 else 0))
for _ in range(300):
    bs = [person(21, 60) for _ in range(random.choice([1, 2]))]
    for b in bs: b['variable'] = 0; b['rental'] = 0; b['fixed'] = random.choice([1500, 2500, 3500, 5000, 7000])
    lease = random.randint(25, 95); cases['hdbloan'].append({'buyers': bs, 'lease': lease}); exp['hdbloan'].append(M.hdb_loan(bs, lease))
for _ in range(100):
    c = {'loan': random.randint(100, 3000) * 1000, 'rate': random.choice([1.5, 2.6, 3, 3.75, 4.2, 6]), 'years': random.randint(5, 35)}
    cases['mortgage'].append(c); exp['mortgage'].append(c['loan'] / M.af(c['rate'] / 100, c['years']))
for _ in range(200):
    ms = [{'oa': random.randint(0, 400) * 1000, 'sa': random.randint(0, 250) * 1000, 'subject': random.random() < .8} for _ in range(random.choice([1, 2]))]
    cov = random.choice([True, False, None]); yr = random.choice([2026, 2027, 2028])
    cases['cpf2'].append({'year': yr, 'cover95': cov, 'members': ms}); exp['cpf2'].append(M.cpf_second(ms, cov, yr))
for _ in range(200):
    o = [random.choice([0, 1, 1, 2]), random.choice([0, 1, 2])]; res = [random.choice(['SC', 'SC', 'PR']), random.choice(['SC', 'PR', 'FR'])]
    owners = [k for k in (0, 1) if o[k] >= 1]
    if not owners: continue
    sellers = random.choice([owners] + [[k] for k in owners]); p = random.randint(800, 4000) * 1000
    cases['sellfirst'].append({'input': {'kind': 'completed', 'price': p, 'otp': '2027-03-01', 'buyers': [{'res': res[k], 'owned': o[k]} for k in (0, 1)], 'age': 40, 'ratePct': 3, 'cash': 2e6, 'cpf': 0, 'order': 'sell', 'sale': {'cash': 0, 'cpf': 0, 'owners': sellers}}})
    exp['sellfirst'].append(M.duty_at(p, M.absd_rate([{'res': res[k], 'owned': o[k] - (1 if k in sellers else 0)} for k in (0, 1)], None)))
for _ in range(220):
    n = random.choice([1, 2]); bs = []
    for _k in range(n):
        b = person(25, 55); b['res'] = random.choice(['SC', 'SC', 'PR', 'FR']); b['owned'] = random.choice([0, 0, 1])
        if b['res'] != 'SC' and random.random() < .4: b['fta'] = random.choice([True, False])
        bs.append(b)
    couple = random.choice([True, False, None]) if n == 2 else None
    cash = random.choice([100, 200, 400, 800]) * 1000; cpf = random.choice([0, 60, 150, 300]) * 1000; debts = random.choice([0, 0, 800])
    keep = any(b['owned'] >= 1 for b in bs)
    inp = {'kind': random.choice(['new', 'completed']) if not keep else 'completed', 'otp': '2027-03-01', 'buyers': [dict(b) for b in bs], 'couple': couple, 'cash': cash, 'cpf': cpf, 'debts': debts, 'home': 'keep' if keep else 'none'}
    model = {'buyers': bs, 'couple': couple, 'cash': cash, 'cpf': cpf, 'debts': debts, 'keep': keep, 'year': 2027}
    if keep:
        has_loan = random.random() < .6; inst = random.choice([800, 1500, 2500]) if has_loan else 0
        inp['flat'] = {'hasLoan': 'yes' if has_loan else 'no', 'instalment': inst} if has_loan else {'hasLoan': 'no'}
        model.update({'flatInstal': inst, 'flatLoans': 1 if has_loan else 0})
        owners = [k for k, b in enumerate(bs) if b['owned'] >= 1]
        if len(owners) > 1:
            joint = random.choice([True, False]); inp['homeJoint'] = joint
            if not joint: inp['otherLoans'] = 0
        if sum(b['owned'] for b in bs) - (1 if len(owners) > 1 and inp.get('homeJoint') else 0) >= 2 and 'otherLoans' not in inp: inp['otherLoans'] = 0
        if cpf > 0:
            bal = [{'oa': random.randint(0, 300) * 1000, 'sa': random.randint(0, 200) * 1000} for _ in bs]; cov = random.choice([True, False, None])
            inp['cpfBal'] = bal; inp['cover95'] = cov; model.update({'cpfBal': bal, 'cover95': cov})
    cases['afford'].append({'input': inp}); exp['afford'].append(M.afford(model))

# ---------- 3. named client scenarios (audit, 24 Oct 2026) ----------
named = [
    ('first-home couple, new launch', {'kind': 'new', 'otp': '2026-11-01', 'buyers': [{'res': 'SC', 'age': 32, 'fixed': 6500, 'variable': 1000}, {'res': 'SC', 'age': 30, 'fixed': 5500}], 'cash': 150000, 'cpf': 120000, 'home': 'none'}, 983000),
    ('B1 Citizen + PR, married', {'kind': 'completed', 'otp': '2026-11-01', 'couple': True, 'buyers': [{'res': 'SC', 'age': 35, 'fixed': 8000}, {'res': 'PR', 'age': 34, 'fixed': 7000}], 'cash': 250000, 'cpf': 150000, 'home': 'none'}, 1432000),
    ('B1 Citizen + PR, not married', {'kind': 'completed', 'otp': '2026-11-01', 'couple': False, 'buyers': [{'res': 'SC', 'age': 35, 'fixed': 8000}, {'res': 'PR', 'age': 34, 'fixed': 7000}], 'cash': 250000, 'cpf': 150000, 'home': 'none'}, 1221000),
    ('B1 Citizen + foreigner, married', {'kind': 'completed', 'otp': '2026-11-01', 'couple': True, 'buyers': [{'res': 'SC', 'age': 35, 'fixed': 9000}, {'res': 'FR', 'age': 34, 'fixed': 8000}], 'cash': 400000, 'cpf': 200000, 'home': 'none'}, 2101000),
    ('B3 keeps flat, 2026 BRS', {'kind': 'completed', 'otp': '2026-11-01', 'homeJoint': True, 'cover95': True, 'cpfBal': [{'oa': 120000, 'sa': 70000}, {'oa': 120000, 'sa': 70000}], 'buyers': [{'res': 'SC', 'age': 45, 'fixed': 9000, 'owned': 1}, {'res': 'SC', 'age': 43, 'fixed': 7000, 'owned': 1}], 'cash': 400000, 'cpf': 240000, 'home': 'keep', 'flat': {'hasLoan': 'yes', 'instalment': 1100}}, 724000),
]
for name, inp, want in named:
    cases['afford'].append({'input': inp, 'name': name}); exp['afford'].append(want)

# ---------- run the engines and compare ----------
with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f: json.dump(cases, f); tmp = f.name
eng = json.loads(subprocess.run(['node', os.path.join(HERE, 'independent', 'engine_batch.js'), tmp], capture_output=True, text=True, check=True).stdout)
os.unlink(tmp)
for c, e, g in zip(cases['duty'], exp['duty'], eng['duty']): check('duty %s' % c, g['bsd'] == e[0] and g['absd'] == e[1], (e, g))
for c, e, g in zip(cases['ssd'], exp['ssd'], eng['ssd']): check('ssd %s' % c, g['ssd'] == e, (e, g))
for c, e, g in zip(cases['tdsr'], exp['tdsr'], eng['tdsr']):
    if e[0] >= 1: check('tdsr %s' % c, g['years'] == e[0] and near(g['maxLoan'], e[1]), (e, g))
for c, e, g in zip(cases['hdbloan'], exp['hdbloan'], eng['hdbloan']):
    if e[0] < 1: check('hdb no tenure %s' % c, g.get('noTenure') is True, g)
    else: check('hdb loan %s' % c, g['years'] == e[0] and near(g['maxLoan'], e[1]) and near(g['ltv'], e[2], 1e-9), (e, g))
for c, e, g in zip(cases['mortgage'], exp['mortgage'], eng['mortgage']): check('mortgage %s' % c, near(g['monthly'], e, .01), (e, g))
for c, e, g in zip(cases['cpf2'], exp['cpf2'], eng['cpf2']): check('cpf second home %s' % c, near(g['usable'], e, 0), (e, g))
for c, e, g in zip(cases['sellfirst'], exp['sellfirst'], eng['sellfirst']): check('sell-first ABSD %s' % c, g['absd'] == e, (e, g))
for c, e, g in zip(cases['afford'], exp['afford'], eng['afford']): check('budget %s' % c.get('name', c['input']), g['highest'] == e, (e, g))
total = ok + fail
print('independent-tests: %d passed, %d failed (%d engine cases: %s)' % (ok, fail, sum(len(v) for v in cases.values()), ', '.join('%s %d' % (k, len(v)) for k, v in cases.items())))
sys.exit(1 if fail else 0)
