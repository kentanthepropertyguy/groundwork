/* ==========================================================================
   GROUNDWORK — money fields. One input behaviour for every calculator (the Payment Timeline's, moved here unchanged so it is not written twice).
   Commas appear as you type. Only the display changes: the caret stays with its digits and the number is the same one C.parseMoney reads.
   Backspace or Delete over a comma only moves the caret past it. Letters (1.2m, 800k), a minus or a second dot are left exactly as typed,
   so each tool's existing validation speaks. On leaving the field a readable amount is tidied (1,250,000 or 2,500.75).
   GW_MONEY.wire(input, { parse, max })  parse: text → number or null; max: the largest amount to tidy.
   GW_MONEY.selectOnFocus(input)         keyboard focus selects the value so typing replaces it.
   GW_MONEY.tenureField(input, o)        a loan-tenure field shows the tenure that is used. While you type nothing moves. When you leave the field, or a
                                         calculation finishes with the field not in use, a tenure above what is allowed is replaced by the tenure applied.
                                         o.read(): the typed number or null; o.max(): the most the field takes; o.limit(): the most the age allows, or 0; o.recalc(): run the screen's calculation;
                                         o.changed(): the screen's own save after the value was changed here. Returns { settle(applied), hint(applied) }.
   No calculation here: the tenure applied and the most allowed are always passed in from the calculators (gw-calc.js bankTenure).
   ========================================================================== */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GW_MONEY = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const tidy = (t) => String(t).replace(/[\s ]/g, '').replace(/^(sgd|s\$)/i, '').replace(/\$/g, '');
  const group = (n) => n.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  function liveMoney(t) { // t: tidied text; returns the display text, or null to leave the field as typed
    if (!/^[\d,]*\.?\d*$/.test(t)) return null;
    const dot = t.indexOf('.'); let n = (dot < 0 ? t : t.slice(0, dot)).replace(/,/g, '');
    n = n.replace(/^0+(?=\d)/, ''); if (dot >= 0 && n === '') n = '0';
    return group(n) + (dot >= 0 ? '.' + t.slice(dot + 1) : '');
  }
  const fmt = (v) => (v === null || v === undefined ? '' : v.toLocaleString('en-US', { maximumFractionDigits: 2 }));
  function selectOnFocus(x) { x.addEventListener('focus', () => { if (x.matches(':focus-visible')) try { x.select(); } catch (e) { /* ignore */ } }); }
  function wire(x, o) {
    o = o || {};
    let prev = x.value;
    x.addEventListener('focus', () => { prev = x.value; });
    x.addEventListener('input', (e) => {
      const raw = x.value; let txt = raw, over = false, caret = x.selectionStart == null ? raw.length : x.selectionStart; const type = (e && e.inputType) || '';
      // Backspace or Delete over a comma only moves the caret past it (the value is unchanged); the next key deletes the digit
      if ((type === 'deleteContentBackward' || type === 'deleteContentForward') && raw.length === prev.length - 1 && prev.charAt(caret) === ',') { txt = prev; if (type === 'deleteContentForward') { caret += 1; over = true; } }
      const out = liveMoney(tidy(txt));
      if (out === null) { prev = x.value; return; }
      let sig = (tidy(txt.slice(0, caret)).match(/[\d.]/g) || []).length; if (/^\./.test(tidy(txt)) && out.indexOf('0.') === 0) sig += 1;
      if (out !== raw) {
        x.value = out;
        if (root.document.activeElement === x && x.setSelectionRange) {
          let n = 0, pos = sig ? out.length : 0;
          for (let k = 0; sig && k < out.length; k++) { if (/[\d.]/.test(out.charAt(k)) && ++n === sig) { pos = k + 1; break; } }
          if (over && out.charAt(pos) === ',') pos += 1;
          try { x.setSelectionRange(pos, pos); } catch (er) { /* ignore */ }
        }
      }
      prev = x.value;
    });
    x.addEventListener('blur', () => {
      if (!o.parse) return;
      const v = o.parse(x.value.replace(/\.$/, '')); // an unreadable entry stays as typed, with its message
      if (v !== null && v !== undefined && (o.max === undefined || v <= o.max)) x.value = fmt(v);
    });
    selectOnFocus(x);
  }
  function tenureField(x, o) {
    o = o || {};
    const read = () => { if (o.read) return o.read(); const t = String(x.value).replace(/[,\s]/g, ''); return /^\d+(\.\d+)?$/.test(t) && +t > 0 ? +t : null; };
    const put = (v, from) => { x.value = String(v); x.dataset.adjustedFrom = x.dataset.adjustedFrom || String(from); if (o.changed) o.changed(); }; // keeps what was first typed through a second adjustment
    const idle = () => root.document.activeElement !== x;
    // o.limit(): the most this tenure can be from the age alone (calculators' tenureLimit), 0 when the age is not known yet; it needs no income, price or result
    const lim = () => { const l = o.limit ? o.limit() : 0; return l >= 1 ? l : 0; };
    x.addEventListener('input', () => { delete x.dataset.adjustedFrom; }); // typing again starts afresh: the "Changed from" line goes
    x.addEventListener('blur', () => {
      const asked = read(), most = lim() || (o.max ? o.max() : null);
      // more than any tenure can be: the most, at once. The screen then recalculates after the short delay its own changes use, so a click
      // that caused the blur is not moved from under the pointer; a changed entry reaches the same recalculation through its change event.
      if (asked !== null && most && asked > most) put(most, asked);
      if (o.recalc) root.setTimeout(o.recalc, 120); // also for an entry that did not change: a blank field then shows the tenure used
    });
    // Called after every calculation with the tenure the calculation applied (a number of years, or 0/null when there is none).
    function settle(applied) {
      const to = applied >= 1 ? applied : lim(); // the calculation's own tenure when there is a result, else the age limit
      if (!idle() || !(to >= 1)) return false;
      const asked = read();
      if (asked !== null && asked > to) { put(to, asked); return true; }
      return false;
    }
    // A blank field shows the tenure that will be used, in the placeholder, so what is seen is what is calculated.
    function hint(applied) {
      if (!idle() || read() !== null || String(x.value).trim() !== '') return;
      const base = x.dataset.ph0 === undefined ? (x.dataset.ph0 = x.getAttribute('placeholder') || '') : x.dataset.ph0;
      x.setAttribute('placeholder', applied >= 1 ? applied + (applied === 1 ? ' year used' : ' years used') : base);
    }
    return { settle, hint };
  }
  return { wire, selectOnFocus, tenureField, fmt, liveMoney, tidy, group };
});
