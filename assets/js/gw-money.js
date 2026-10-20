/* ==========================================================================
   GROUNDWORK — money fields. One input behaviour for every calculator (the Payment Timeline's, moved here unchanged so it is not written twice).
   Commas appear as you type. Only the display changes: the caret stays with its digits and the number is the same one C.parseMoney reads.
   Backspace or Delete over a comma only moves the caret past it. Letters (1.2m, 800k), a minus or a second dot are left exactly as typed,
   so each tool's existing validation speaks. On leaving the field a readable amount is tidied (1,250,000 or 2,500.75).
   GW_MONEY.wire(input, { parse, max })  parse: text → number or null; max: the largest amount to tidy.
   GW_MONEY.selectOnFocus(input)         keyboard focus selects the value so typing replaces it.
   No calculation here.
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
  return { wire, selectOnFocus, fmt, liveMoney, tidy, group };
});
