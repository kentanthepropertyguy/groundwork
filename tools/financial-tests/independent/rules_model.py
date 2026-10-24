"""Groundwork — an INDEPENDENT model of the Singapore rules the calculators apply (audit of 24 Oct 2026, kept as a permanent regression test).

Written from the published rules, not from Groundwork's JavaScript, so that the engines are checked against a second, separate reading:
  IRAS   BSD bands (15 Feb 2023); ABSD rates (27 Apr 2023); joint purchase = the highest buyer's rate; married couple with a Citizen, both names only, neither owning
         a home = 0%; FTA nationals (US; Iceland, Liechtenstein, Norway, Switzerland nationals and PRs) at Citizen rates; SSD (3-year regime 11 Mar 2017 - 3 Jul 2025,
         4-year regime from 4 Jul 2025).
  MAS    Notice 645: TDSR 55%, tested at the higher of 4% and the quoted rate, variable and rental income at 70%. Notice 632: LTV 75/45/35% and minimum cash
         5/25/25% by outstanding housing loans; the lower limits beyond 30 years or past age 65.
  HDB    HDB loan: MSR 30% of gross income at a 3% floor; tenure the shortest of 25 years, 65 less the average age and the lease less 20; LTV 75% pro-rated when the
         lease does not reach the youngest buyer's 95th birthday (MOM/MND release, 9 May 2019).
  CPF    A buyer who owns another property can use only the OA left after setting aside the BRS (a property lasting to 95) or the FRS; OA, SA and RA count
         towards it (CPF Board, 18 Sep 2026). 2026: BRS 110,200 / FRS 220,400; 2027: BRS 114,100 / FRS 228,200.
Two conventions are Groundwork's own and are reproduced on purpose (they are labelled on the pages): the joint-borrower age is the OLDER of the age weighted by
counted income and by gross income (MAS's wording is not settled), and a bank loan ends by age 75 (lender policy). The answer is the highest price on a $1,000 grid.
"""
import math

BSD = [(180000, .01), (180000, .02), (640000, .03), (500000, .04), (1500000, .05), (float('inf'), .06)]
ABSD = {'SC': [0, .20, .30], 'PR': [.05, .30, .35], 'FR': [.60, .60, .60]}
SUMS = {2026: (110200, 220400), 2027: (114100, 228200)}
TDSR, MSR, STRESS, HDB_FLOOR = .55, .30, .04, .03


def bsd(p):
    t, left = 0.0, p
    for w, r in BSD:
        s = min(left, w); t += s * r; left -= s
        if left <= 0: break
    return max(1, math.floor(t + 1e-9))


def duty_at(p, rate):
    return math.floor(round(p * 100) * round(rate * 10000) / 1e6) if rate > 0 and p > 0 else 0


def absd_rate(buyers, couple=None):
    """buyers: [{'res', 'owned', 'fta'}]. The highest buyer's rate; an FTA buyer pays the Citizen rate for their count; a married couple with a Citizen,
    neither owning a home, pays nothing (IRAS joint-purchase tables)."""
    rate = max(ABSD['SC' if (b.get('fta') and b['res'] != 'SC') else b['res']][min(2, b['owned'])] for b in buyers)
    if couple is True and len(buyers) == 2 and any(b['res'] == 'SC' for b in buyers) and all(b['owned'] == 0 for b in buyers):
        return 0.0
    return rate


def af(rate, years):
    n = round(years * 12); i = rate / 12
    return (1 - (1 + i) ** -n) / i if i > 0 else n


def ssd(price, bought, sold):
    from datetime import date
    b, s = date.fromisoformat(bought), date.fromisoformat(sold)
    def ann(k):
        try: return b.replace(year=b.year + k)
        except ValueError: return b.replace(year=b.year + k, day=28)
    if b >= date(2025, 7, 4): rates = [.16, .12, .08, .04]
    elif b >= date(2017, 3, 11): rates = [.12, .08, .04]
    else: return None
    for k, r in enumerate(rates, 1):
        if s < ann(k): return duty_at(price, r)
    return 0


def counted(b):
    return b.get('fixed', 0) + .7 * b.get('variable', 0) + .7 * b.get('rental', 0)


def gross(b):
    return b.get('fixed', 0) + b.get('variable', 0) + b.get('rental', 0)


def age_used(bs):
    bs = [b for b in bs if gross(b) > 0]
    a = sum(counted(b) for b in bs); g = sum(gross(b) for b in bs)
    return max(sum(b['age'] * counted(b) for b in bs) / a, sum(b['age'] * gross(b) for b in bs) / g)


def std_tenure(age, hdb=False):
    return max(0, min(25 if hdb else 30, math.floor(65 - age)))


def tdsr_loan(bs, debts, years, rate=STRESS):
    return max(0, TDSR * sum(counted(b) for b in bs if gross(b) > 0) - debts) * af(max(STRESS, rate), years)


def hdb_loan(bs, lease):
    avg = sum(b['age'] for b in bs) / len(bs)
    years = max(0, min(25, math.floor(65 - avg), math.floor(lease - 20)))
    loan = MSR * sum(gross(b) for b in bs) * af(max(HDB_FLOOR, .026), years) if years >= 1 else 0
    y = min(b['age'] for b in bs); ltv = .75
    if lease + y < 95: ltv = .75 * max(0, lease - 20) / (75 - y)
    return years, loan, ltv


def cpf_second(members, cover95, year):
    """members: [{'oa', 'sa', 'subject'}]. Usable OA in total."""
    years = sorted(SUMS)
    y = year if year in SUMS else (years[-1] if year > years[-1] else years[0])
    brs, frs = SUMS[y]
    need = brs if cover95 is True else frs
    return sum((max(0, m['oa'] - max(0, need - m['sa'])) if m.get('subject', True) else m['oa']) for m in members)


LTV = {0: (.75, .05), 1: (.45, .25), 2: (.35, .25)}


def afford(c):
    """Highest price (on the $1,000 grid) for a private home, static check. c: {'buyers': [{res, age, fixed, variable, rental, owned, fta}], 'couple',
    'cash', 'cpf', 'debts', 'keep' (a home is kept: the buyers' counts stand), 'flatInstal', 'flatLoans' (housing loans outstanding, for the LTV row),
    'cpfBal': [{oa, sa}], 'cover95', 'year'}. Without a kept home every buyer owns nothing."""
    earners = [b for b in c['buyers'] if gross(b) > 0]
    years = std_tenure(age_used(earners))
    if years < 1: return None
    keep = c.get('keep', False)
    debts = c.get('debts', 0) + (c.get('flatInstal', 0) if keep else 0)
    inc_loan = tdsr_loan(earners, debts, years)
    ltv, mincash = LTV[min(2, c.get('flatLoans', 0) if keep else 0)]
    duty_buyers = [{'res': b['res'], 'owned': (b.get('owned', 0) if keep else 0), 'fta': b.get('fta')} for b in c['buyers']]
    rate = absd_rate(duty_buyers, c.get('couple'))
    cpf = c['cpf']
    if keep and cpf > 0 and any(b['owned'] >= 1 for b in duty_buyers):
        bal = c['cpfBal']
        cpf = min(cpf, cpf_second([{'oa': bal[k]['oa'], 'sa': bal[k]['sa'], 'subject': duty_buyers[k]['owned'] >= 1} for k in range(len(duty_buyers))], c.get('cover95'), c.get('year', 2027)))
    best = None
    for k in range(100, 20001):
        P = k * 1000
        loan = min(ltv * P, inc_loan); cmin = mincash * P
        cash_only = cmin + bsd(P) + duty_at(P, rate)
        flex = P - loan - cmin
        if c['cash'] >= cash_only - 1e-6 and flex <= cpf + (c['cash'] - cash_only) + 1e-6: best = P
    return best
