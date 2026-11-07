"""PRISM Research hero, Release 1 (Master Planning, 7 Nov 2026): an evidence-profile page opens in Simple, which hides the section bar, the
full analysis and the five dimensions; Detailed shows them exactly as before. The PRISM browser suites written before the hero test those
parts, so importing this module opens every page they load in Detailed (the visitor's remembered choice, gw.prism.mode). The hero, the
strip, the pentagon and Simple itself are tested by prism-hero-render.py."""
from playwright.sync_api import Browser
_SET = "try { localStorage.setItem('gw.prism.mode', 'detailed'); } catch (e) {}"
_nc, _np = Browser.new_context, Browser.new_page
def _new_context(self, *a, **k):
    c = _nc(self, *a, **k); c.add_init_script(_SET); return c
def _new_page(self, *a, **k):
    pg = _np(self, *a, **k); pg.add_init_script(_SET); return pg
Browser.new_context, Browser.new_page = _new_context, _new_page
