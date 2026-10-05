/* ==========================================================================
   Ken Property Tools — shared components
   Generic building blocks for the reasoning spine (YOUR POSITION → WHAT IT
   MEANS → THE TRADE-OFF → KEN'S TAKE → WHAT NEXT). That spine is a thinking
   model, not a fixed layout — these functions are small and composable so
   each tool/journey uses only the pieces it needs, in whatever order and
   wording fits the question. Nothing below assumes HDB, a single figure,
   or a single pin: the gauge and take renderers are shared by a one-value
   analysis today and a project-vs-project comparison tomorrow.
   Plain JS, no build step, no dependencies.
   ========================================================================== */
window.KPT = window.KPT || {};

/* ---------------------------------------------------------------------
   KPT.gauge(el, opts)
   Renders the horizontal position gauge — the one recurring diagnostic
   visual. Works with any number of pins (1 for a single analysis, 2+ for
   a comparison) over a shared min..max scale with optional named zones.

   opts = {
     min, max,
     zones: [{ from, to, label }],           // optional background zones
     pins:  [{ value, label, color:"gold"|"navy" }]
   }
------------------------------------------------------------------------ */
KPT.gauge = function (el, opts) {
  if (!el || !opts) return;
  const { min, max, zones = [], pins = [], bands = [] } = opts;
  const span = max - min || 1;
  const pct = (v) => Math.max(0, Math.min(100, ((v - min) / span) * 100));
  // Labels hug the nearest edge so they never run off the track on a phone.
  const tagAlign = (left) => (left > 72 ? "translateX(-100%)" : left < 28 ? "translateX(0)" : "translateX(-50%)");

  let zoneHtml = "";
  zones.forEach((z) => {
    zoneHtml += `<span class="zone-label" style="left:${pct(z.from)}%">${z.label}</span>`;
  });

  // A band marks a range (e.g. a planning range) as one continuous stretch of the track.
  const tagPos = []; // labels that sit close together are staggered onto a second line
  const lowIf = (pos) => { const near = tagPos.some((x) => Math.abs(x - pos) < 75); tagPos.push(pos); return near ? " low" : ""; };
  let bandHtml = "";
  bands.forEach((b) => {
    const l = pct(b.from), r = pct(b.to);
    bandHtml += `<span class="band" style="left:${l}%;width:${Math.max(r - l, 0.8)}%"></span>`;
    if (b.label) {
      const mid = (l + r) / 2;
      bandHtml += `<span class="pin-tag gold${lowIf(mid)}" style="left:${mid}%;transform:${tagAlign(mid)}">${b.label}</span>`;
    }
  });

  // color: "gold" (our position), "navy", or "outline" (a possibility, not our position).
  let pinHtml = "";
  pins.forEach((p) => {
    const left = pct(p.value);
    const color = p.color === "navy" ? "navy" : p.color === "outline" ? "outline" : "gold";
    const tagColor = color === "gold" ? "gold" : "navy";
    pinHtml += `<span class="pin ${color}" style="left:${left}%"></span>`;
    if (p.label) {
      pinHtml += `<span class="pin-tag ${tagColor}${lowIf(left)}" style="left:${left}%;transform:${tagAlign(left)}">${p.label}</span>`;
    }
  });

  el.innerHTML =
    `<div class="kpt-gauge">` +
    `<div class="track">${zoneHtml}${bandHtml}${pinHtml}</div>` +
    `<span class="scale-end" style="left:0">${opts.minLabel || ""}</span>` +
    `<span class="scale-end right">${opts.maxLabel || ""}</span>` +
    `</div>`;
};

/* ---------------------------------------------------------------------
   KPT.take(el, opts)
   Renders Ken's Take — real judgement, never a restated result.
   opts = { quote, byline, photo }
   If `quote` is empty/missing, the section renders NOTHING (not an empty
   box) — the product rule is "if there's no real judgement, don't
   manufacture one," enforced here so no page can accidentally render a
   hollow Ken's Take.
------------------------------------------------------------------------ */
KPT.take = function (el, opts) {
  if (!el) return;
  if (!opts || !opts.quote || !opts.quote.trim()) {
    el.innerHTML = "";
    el.style.display = "none";
    return;
  }
  el.style.display = "";
  const photo = opts.photo || "../../assets/img/ken-portrait.jpg";
  el.innerHTML =
    `<div class="kpt-take">` +
    `<img src="${photo}" alt="Ken Tan">` +
    `<div><blockquote>${opts.quote}</blockquote>` +
    `<div class="byline">${opts.byline || "Ken Tan · ken tan | the property guy"}</div></div>` +
    `</div>`;
};

/* ---------------------------------------------------------------------
   KPT.waLink(opts)
   Builds a WhatsApp deep link. Enforces the one non-negotiable privacy
   rule across every journey: callers pass a plain-text `message` they
   composed themselves — this helper never reaches into form state, so
   it is structurally impossible for a tool to leak income/CPF/cash/debt
   into a WhatsApp handoff just by calling this function. Keep `message`
   limited to what the product principle allows (e.g. an estimated range,
   a project name, a priority) — never a raw financial figure that wasn't
   already meant to be shared.
------------------------------------------------------------------------ */
KPT.waLink = function (opts) {
  const phone = (opts && opts.phone) || "6590908898";
  const message = (opts && opts.message) || "Hi Ken, I'd like some advice.";
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
};

/* ---------------------------------------------------------------------
   KPT.money(n) — compact SGD formatting shared by every tool.
------------------------------------------------------------------------ */
KPT.money = function (n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e6) return (n < 0 ? "-" : "") + "$" + (abs / 1e6).toFixed(abs >= 1e7 ? 1 : 2) + "m";
  if (abs >= 1e3) return (n < 0 ? "-" : "") + "$" + Math.round(abs / 1e3) + "k";
  return (n < 0 ? "-" : "") + "$" + Math.round(abs);
};
