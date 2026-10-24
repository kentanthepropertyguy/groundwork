"""Research opens a development with NO size chosen (25 Oct 2026): no size's price or reading is shown until the visitor picks one.
Tests that read a size's price, reading or chart pick the size that sold most, as a visitor would (through the same storage key the Map and the page use)."""
def pick_dominant(pg, ready='#sizeSel'):
    pg.wait_for_selector(ready, state='attached', timeout=15000); pg.wait_for_timeout(300)
    b = pg.evaluate("""() => { const M = window.__kptResearchModel; const d = M && (M.bands || []).find(x => x.isDominant); if (!d) return null; sessionStorage.setItem('kpt.research.size', String(d.bin)); return d.bin; }""")
    if b is not None: pg.reload(); pg.wait_for_selector('#sizeSel', state='attached', timeout=15000); pg.wait_for_timeout(300)
    return b
def forget_size(pg):
    pg.evaluate("sessionStorage.removeItem('kpt.research.size')")
