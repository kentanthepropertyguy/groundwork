/* ==========================================================================
   GROUNDWORK — detailed research reports: "Try a price", section navigation, citations and analytics (Oct 2026).
   Nothing is filled in: the check starts blank and shows results only for a price the visitor types.
   Calculations come from the calculators' own engine (GW_CALC: stamp duty, progressive payments, mortgage) and the
   resale development's URA sales written into the page (GW_REPORT.rows: [sqft, price, psf], last 24 months).
   What the visitor types stays in this page: it is never stored, sent to analytics or put in an address. The WhatsApp
   message that names a price is opened only on tap (GW_WA), so link addresses never carry it.
   ========================================================================== */
(function () {
  'use strict';
  var G = window.GW_REPORT, C = window.GW_CALC, KPT = window.KPT || { track: function () {}, setContext: function () {} };
  if (!G) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var n0 = function (x) { return Math.round(x).toLocaleString('en-US'); };
  var money = function (x) { return '$' + n0(x); };
  var mm = function (x) { return x >= 1e6 ? '$' + (Math.round(x / 1e4) / 100).toFixed(2) + 'm' : '$' + n0(Math.round(x / 1000)) + 'k'; };
  var pct = function (x) { var k = Math.round(x * 100); return k === 0 ? 'About the same' : (k > 0 ? '+' : '−') + Math.abs(k) + '%'; };
  var tolTxt = function (t) { var k = Math.round(t * 1000) / 10; return (k % 1 ? k.toFixed(1) : String(k)) + '%'; };
  var median = function (a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  var track = function (n, p) { try { KPT.track(n, p || {}); } catch (e) { /* analytics unavailable */ } };
  try { KPT.setContext({ tool_category: 'research-report' }); } catch (e) { /* ignore */ }
  track('page_view', { page: 'research-report', report: G.slug });

  /* ---------------- section chips: the one in view is marked; clicks are counted (section names only) ---------------- */
  var chips = [].slice.call(document.querySelectorAll('[data-gr-nav]'));
  chips.forEach(function (a) { a.addEventListener('click', function () { track('report_nav', { target: a.dataset.grNav, report: G.slug }); }); });
  if ('IntersectionObserver' in window && chips.length) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (!e.isIntersecting) return; chips.forEach(function (c) { var on = c.dataset.grNav === e.target.id; if (on) { c.setAttribute('aria-current', 'true'); try { c.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (x) { /* ignore */ } } else c.removeAttribute('aria-current'); }); });
    }, { rootMargin: '-120px 0px -60% 0px' });
    chips.forEach(function (c) { var s = $(c.dataset.grNav); if (s) io.observe(s); });
  }
  /* ---------------- a citation opens its source and marks it ---------------- */
  function showSource(id, smooth) { var t = $(id); if (!t) return false; t.classList.add('hit'); setTimeout(function () { t.classList.remove('hit'); }, 2400); t.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' }); return true; }
  document.addEventListener('click', function (e) {
    var c = e.target.closest ? e.target.closest('.gr-cite a') : null; if (!c) return;
    var id = c.getAttribute('href').slice(1); if (showSource(id, true)) { e.preventDefault(); try { history.replaceState(null, '', '#' + id); } catch (x) { /* ignore */ } }
  });
  if (/^#src-[a-z0-9-]+$/.test(location.hash)) showSource(location.hash.slice(1), false);
  /* ---------------- WhatsApp and other links ---------------- */
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('[data-gr-wa]') : null;
    if (a) track('whatsapp_click', { context: 'report', placement: a.dataset.grWa, ref: 'KPT-RPT', report: G.slug });
    var l = e.target.closest ? e.target.closest('[data-gr-link]') : null;
    if (l) track('report_link', { target: l.getAttribute('href').replace(/^[./]+/, '').split('#')[0] || 'research', report: G.slug });
    var j = e.target.closest ? e.target.closest('[data-gr-jump]') : null;
    if (j) track('report_nav', { target: j.dataset.grJump, placement: 'hero', report: G.slug });
  }, true);

  /* ---------------- Try a price ---------------- */
  var box = document.querySelector('[data-gr-try]'); if (!box) return;
  var out = $('grOut'), started = false, done = {};
  var BLANK = out.innerHTML;
  function start() { if (!started) { started = true; track('tool_started', { tool_name: 'report-price-check', placement: 'report', report: G.slug }); } }
  function completed(step) { if (!done[step]) { done[step] = true; track('tool_completed', { tool_name: 'report-price-check', step: step, report: G.slug }); } }
  function size() {
    var v = $('grLayout').value; $('grSizeW').hidden = v !== 'other';
    if (v === 'other') { var p = C ? C.parseNum($('grSize').value) : { value: parseFloat($('grSize').value) }; return p.value && p.value >= 300 && p.value <= 4000 ? p.value : null; }
    return v ? +v : null;
  }
  function layoutName() { var o = $('grLayout').selectedOptions && $('grLayout').selectedOptions[0]; return o && o.value && o.value !== 'other' ? o.textContent : null; }
  function stats(rows) { return rows.length ? { n: rows.length, lo: Math.min.apply(null, rows.map(function (r) { return r[0]; })), hi: Math.max.apply(null, rows.map(function (r) { return r[0]; })), psf: Math.round(median(rows.map(function (r) { return r[2]; }))), price: median(rows.map(function (r) { return r[1]; })), size: Math.round(median(rows.map(function (r) { return r[0]; }))) } : { n: 0 }; }
  var range = function (s) { return s.lo === s.hi ? n0(s.lo) + ' sq ft' : n0(s.lo) + '–' + n0(s.hi) + ' sq ft'; };
  function run() {
    var pr = C ? C.parseMoney($('grPrice').value) : { empty: true }, sz = size();
    $('grPriceErr').textContent = pr.error || (pr.value && (pr.value < 2e5 || pr.value > C.LIMITS.money.max) ? 'Check the price: type the full amount, e.g. 1,650,000 or 1.65m.' : '');
    $('grPrice').setAttribute('aria-invalid', $('grPriceErr').textContent ? 'true' : 'false');
    if (!C) { out.innerHTML = '<p class="gr-fine" role="alert">The calculator didn’t load completely. Please refresh the page.</p>'; return; }
    if (!pr.value || $('grPriceErr').textContent || !sz) { out.innerHTML = BLANK; return; }
    var price = pr.value, psf = price / sz, h = '';
    var same = stats(G.rows.filter(function (r) { return Math.abs(r[0] - sz) <= sz * G.tol; }));
    var bud = stats(G.rows.filter(function (r) { return Math.abs(r[1] - price) <= price * G.btol; }));
    h += '<h4>' + esc(layoutName() || n0(sz) + ' sq ft') + ' at ' + money(price) + '</h4>';
    h += '<div class="gr-figs"><div><span>' + esc(G.a) + '</span><b>$' + n0(psf) + ' psf</b><small>your price ÷ ' + n0(sz) + ' sq ft</small></div>';
    if (same.n >= 3) {
      var gap = psf / same.psf - 1;
      h += '<div><span>' + esc(G.b) + ', similar size</span><b>$' + n0(same.psf) + ' psf</b><small>median of ' + same.n + ' resales, ' + range(same) + '</small></div>' +
        '<div><span>Difference per sq ft</span><b>' + pct(gap) + '</b><small>' + (Math.round(gap * 100) === 0 ? 'as ' : gap > 0 ? 'above ' : 'below ') + esc(G.b) + '’s median</small></div>';
    } else h += '<div><span>' + esc(G.b) + ', similar size</span><b>' + (same.n ? same.n + ' sale' + (same.n === 1 ? '' : 's') : 'No sales') + '</b><small>within 10% of ' + n0(sz) + ' sq ft in 24 months: too few to compare per sq ft</small></div>';
    h += '</div>';
    if (bud.n >= 3) {
      var more = bud.size - sz;
      h += '<p>For about the same budget (within ' + tolTxt(G.btol) + ' of your price), ' + bud.n + ' ' + esc(G.b) + ' homes resold in the last 24 months, ' + range(bud) + ' (median ' + n0(bud.size) + ' sq ft). ' + (Math.abs(more) < 20 ? 'That is <b>about the same floor area</b> as' : 'That is about <b>' + n0(Math.abs(more)) + ' sq ft ' + (more > 0 ? 'more' : 'less') + '</b> floor area than') + ' this ' + esc(G.a) + ' layout, in an older building with about ' + esc(G.leaseGap) + ' fewer years of lease.</p>';
    } else h += '<p>Fewer than 3 ' + esc(G.b) + ' resales came within ' + tolTxt(G.btol) + ' of this price in the last 24 months' + (bud.n ? ' (' + bud.n + ')' : '') + ', so there is no fair same-budget comparison.</p>';
    // Where this price sits against the report's reference points: positions only, never a verdict
    var pos = [], nb = G.newest && G.newest.bands.filter(function (x) { return sz >= x.lo && sz <= x.hi && x.psf; })[0];
    if (nb) { var dn = psf / nb.psf - 1; pos.push('<li>' + (Math.round(dn * 100) === 0 ? 'About the same as' : Math.abs(Math.round(dn * 100)) + '% ' + (dn > 0 ? 'above' : 'below')) + ' ' + esc(G.newest.name) + '’s median for this size band ($' + n0(nb.psf) + ' psf), the newest resale development in the district.</li>'); }
    if (G.hist && same.n >= 3) { var pr = Math.round((psf / same.psf - 1) * 100);
      pos.push('<li>A ' + (pr >= 0 ? pr + '% premium' : Math.abs(pr) + '% discount') + ' over ' + esc(G.b) + ' at the same size. In the report’s developer-sale comparison, developers sold at a median premium of ' + G.hist.at + '% over older resale nearby (range ' + G.hist.lo + '% to ' + G.hist.hi + '%, ' + G.hist.n + ' cases); later resale medians kept a median ' + G.hist.now + '%. This price’s premium is ' + (pr < G.hist.lo ? 'below' : pr > G.hist.hi ? 'above' : 'within') + ' that range. No assessment label is given for a typed price.</li>'); }
    if (G.costShare) pos.push('<li>Buying and later selling costs about ' + G.costShare + '% of the price (stamp duty, legal fees, commission), before interest.</li>');
    if (pos.length) h += '<h4>Where this price sits</h4><ul class="gr-ul">' + pos.join('') + '</ul><p class="gr-fine">Reference points from URA records, not a valuation. See “Is the new-launch premium worth paying?” for how they are found and what they cannot show.</p>';
    h += '<p class="gr-src">' + esc(G.b) + ' resales ' + esc(G.from) + ' to ' + esc(G.latest) + ', from URA records. A price you type is not checked against the developer’s price list.</p>';
    completed('compare');
    h += money2(price, sz);
    h += '<a class="gw-btn wa" id="grTryWa" href="https://wa.me/' + esc(G.phone) + '" target="_blank" rel="noopener" data-gr-wa="report-try">Ask Ken about this price</a><p class="gr-fine">WhatsApp opens with a message naming this layout and price, which you can edit first.</p>';
    out.innerHTML = h;
    var msg = String(G.tryMessage || '').replace('{layout}', layoutName() || n0(sz) + ' sq ft').replace('{price}', money(price));
    if (window.GW_WA) GW_WA.set($('grTryWa'), 'https://wa.me/' + G.phone + '?text=' + encodeURIComponent(msg));
  }
  function money2(price, sz) {
    var res = $('grRes').value, owned = $('grOwned').value, ageP = C.parseNum($('grAge').value, '40'), rateP = C.parseNum($('grRate').value, '3.5');
    if (!res || owned === '') return '<p class="gr-fine">Add your buyer profile above (under “Add stamp duty and payment timing”) to see stamp duty and when the money goes out.</p>';
    var buyers = [{ res: res, owned: +owned }], duty = C.stampDuty({ price: price, kind: 'private', buyers: buyers });
    if (!duty.ok) return '';
    var h = '<h4>Stamp duty</h4><div class="gr-figs"><div><span>Buyer’s Stamp Duty</span><b>' + money(duty.bsd) + '</b></div><div><span>ABSD (' + Math.round(duty.absdRate * 100) + '%)</span><b>' + money(duty.absd) + '</b></div><div><span>Total, within 14 days of signing</span><b>' + money(duty.total) + '</b><small>the same for a resale at this price</small></div></div>';
    (duty.notes || []).forEach(function (n) { h += '<p class="gr-fine">' + esc(n.text) + '</p>'; });
    completed('stamp-duty');
    if (!ageP.value || ageP.value < 21 || ageP.value > 99) return h + '<p class="gr-fine">Add your age to see the loan limit and payment timing.</p>';
    if (rateP.error || (rateP.value !== undefined && (rateP.value < 0 || rateP.value > 20))) return h + '<p class="gr-fine">Check the interest rate: a number between 0 and 20.</p>';
    // Loan tenure and limit (MAS Notice 632, the calculators' own engine): 75% when the tenure is 30 years or less and the loan
    // ends by age 65; a longer tenure (up to 35 years) or a loan past 65 is allowed at 55%. A tenure the visitor types is used as
    // typed. Left blank, both choices are shown: the longer of the two with the 75% limit, and 30 years at the lower limit.
    var tenP = C.parseNum($('grTenure').value, '25');
    if (tenP.error || (tenP.value !== undefined && (tenP.value < 1 || tenP.value > 35))) return h + '<p class="gr-fine">Check the loan tenure: between 1 and 35 years, or leave it blank.</p>';
    var base = { price: price, kind: 'private', age: ageP.value, buyers: buyers, loans: +$('grLoans').value, ratePct: rateP.value };
    var p, alt = null, why;
    if (tenP.value) { p = C.progressive(Object.assign({}, base, { years: tenP.value })); why = 'the tenure you entered'; }
    else {
      var p30 = C.progressive(Object.assign({}, base, { years: 30 })); if (!p30.ok) return h;
      if (p30.lowerWhy === 'age' && p30.stdYears >= 5) { p = C.progressive(Object.assign({}, base, { years: p30.stdYears })); alt = p30; why = 'ends by age 65, keeping the higher limit'; }
      else { p = p30; why = p30.lower ? 'runs past age 65' : 'standard 30 years'; }
    }
    if (!p || !p.ok) return h;
    var m = C.mortgage({ loan: p.loanMax, ratePct: p.rate * 100, years: p.years, lender: 'bank' });
    var first = p.stages.filter(function (s) { return s.loan >= 1; })[0];
    h += '<h4>When the money goes out</h4><div class="gr-figs"><div><span>Within 8 weeks (20%)</span><b>' + money(p.stages[0].amount + p.stages[1].amount) + '</b><small>plus stamp duty; ' + money(p.cashMin) + ' of the price must be cash</small></div>' +
      '<div><span>Loan limit (' + Math.round(p.ltv * 100) + '%)</span><b>' + money(p.loanMax) + '</b><small>' + p.years + ' years (' + why + ') at ' + (Math.round(p.rate * 1000) / 10) + '%' + (p.lower ? '; the lower limit applies because ' + (p.lowerWhy === 'age' ? 'the loan runs past age 65' : 'the tenure is over 30 years') : '') + '</small></div>' +
      '<div><span>' + esc(G.a) + ': first instalment</span><b>' + (first ? money(first.monthly) + '/mo' : '—') + '</b><small>rising to ' + money(p.finalMonthly) + '/mo once fully drawn' + (G.vpYear ? ', by about ' + esc(G.vpYear) : '') + '</small></div>' +
      '<div><span>A resale at this price</span><b>' + (m.ok ? money(m.monthly) + '/mo' : '—') + '</b><small>the whole loan from the first month, after completion in about 8–12 weeks</small></div></div>';
    if (alt) h += '<p class="gr-fine">Or a 30-year loan, which would run past age 65: allowed, with a limit of ' + Math.round(alt.ltv * 100) + '% (' + money(alt.loanMax) + ') and ' + money(alt.finalMonthly) + '/mo once fully drawn. For joint borrowers, banks use the income-weighted average age. Type a tenure above to see another choice.</p>';
    h += '<div class="gr-tw"><table class="gr-t"><caption class="gr-sr">Progressive payments at this price</caption><thead><tr><th scope="col">Stage</th><th scope="col" class="r">Payment</th><th scope="col" class="r">Loan drawn</th><th scope="col" class="r">Instalment after</th></tr></thead><tbody>' +
      p.stages.map(function (s) { return '<tr><td>' + esc(s.name) + ' <small>' + Math.round(s.pct * 100) + '%</small></td><td class="r">' + money(s.amount) + '</td><td class="r">' + money(s.drawn) + '</td><td class="r">' + (s.monthly ? money(s.monthly) : '—') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="gr-src">Standard progressive payment schedule, paid from cash first, then cash or CPF, then the loan; the sale and purchase agreement, your bank and CPF Board decide the actual funding. Interest ' + ($('grRate').value.trim() ? 'at the rate you entered' : 'at 4% a year, the rate banks must test affordability at, not a quote') + '. Loan limits under MAS Notice 632; your bank decides. Stamp duty from IRAS rates.</p>';
    completed('payments');
    return h;
  }
  ['grPrice', 'grSize', 'grAge', 'grRate', 'grTenure'].forEach(function (id) { $(id).addEventListener('input', function () { start(); run(); }); });
  ['grLayout', 'grRes', 'grOwned', 'grLoans'].forEach(function (id) { $(id).addEventListener('change', function () { start(); run(); }); });
  $('grPrice').addEventListener('blur', function () { var p = C && C.parseMoney(this.value); if (p && p.value && p.value <= 1e8) this.value = p.value.toLocaleString('en-SG', { maximumFractionDigits: 0 }); });
})();
