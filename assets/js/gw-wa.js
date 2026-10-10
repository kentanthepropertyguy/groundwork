/* ==========================================================================
   GROUNDWORK — WhatsApp handoff without figures in links (R2.1 privacy fix, Ken 9 Oct 2026).
   What can this budget buy? and the HDB Upgrade Planner prepare a WhatsApp message that names the visitor's budget or
   planning range. A link that carries that message can be read by analytics (Google Analytics records the address of
   outbound links that are clicked). Here the link keeps only Ken's chat address, https://wa.me/6590908898; the full
   message is kept in the page's memory and opened only when the visitor taps, through window.open, exactly as the
   calculators do. If this script does not run, the link still opens a chat with Ken, without the prepared text.
   Nothing here is stored, sent to analytics or put in an address of this site.
   ========================================================================== */
(function (root) {
  'use strict';
  if (root.GW_WA) return; // loaded twice on one page (audit fix): one click handler only, so a tap never opens two chats
  const NEUTRAL = 'https://wa.me/6590908898';
  const msgs = typeof WeakMap === 'function' ? new WeakMap() : null, builders = [];
  // A link whose message is known now.
  function set(a, url) { if (!a) return; if (msgs) msgs.set(a, url); a.setAttribute('href', NEUTRAL); a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); }
  // Links drawn later (cards): the page says how to build the message for a link that matches a selector, at the moment of the tap.
  function on(selector, build) { for (let i = 0; i < builders.length; i++) if (builders[i][0] === selector) { builders[i][1] = build; return; } builders.push([selector, build]); }
  function urlFor(a) {
    let u = msgs ? msgs.get(a) : null;
    if (!u) for (let i = 0; i < builders.length && !u; i++) if (a.matches(builders[i][0])) { try { u = builders[i][1](a); } catch (e) { u = null; } }
    return u && /^https:\/\/wa\.me\//.test(u) ? u : null;
  }
  if (typeof document !== 'undefined') document.addEventListener('click', function (e) {
    const a = e.target && e.target.closest ? e.target.closest('a') : null; if (!a) return;
    const u = urlFor(a); if (!u) return;
    e.preventDefault();
    let w = null; try { w = root.open(u, '_blank'); } catch (x) { w = null; }
    if (w) { try { w.opener = null; } catch (x) { /* ignore */ } } else root.location.href = NEUTRAL; // blocked pop-up: the chat opens without the prepared text
  });
  root.GW_WA = { set, on, NEUTRAL };
})(typeof self !== 'undefined' ? self : this);
