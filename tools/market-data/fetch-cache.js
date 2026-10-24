/* ==========================================================================
   GROUNDWORK — polite, cached fetching for document sources (Node; uses curl so the machine's proxy settings apply).

   Every URL is fetched at most once into a PRIVATE cache (<dir>/<host>/<sha1 of the URL>.<ext>, with a .json note of when and what came
   back); later runs read the cache unless the copy is older than maxAgeDays. Before the first request to a host its robots.txt is read
   and obeyed (the rules for user-agent "*": the longest matching Allow / Disallow wins; Allow wins a tie). Requests to one host are spaced
   by rateMs. Nothing here decides whether a source may be used at all: that is the source's "permission" entry in sources.json.
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');

function robotsRules(text) {
  // groups for user-agent "*" only
  const rules = []; let mine = false, inGroup = false;
  String(text || '').split(/\r?\n/).forEach((raw) => {
    const l = raw.replace(/#.*/, '').trim(); if (!l) return;
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(l); if (!m) return;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!inGroup) mine = false; inGroup = true; if (v === '*') mine = true; return; }
    inGroup = false;
    if (mine && (k === 'allow' || k === 'disallow')) rules.push({ allow: k === 'allow', path: v });
  });
  return rules;
}
function robotsAllows(rules, urlPath) {
  let best = null;
  rules.forEach((r) => {
    if (!r.path) return;   // "Disallow:" with nothing allows everything
    const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (!re.test(urlPath)) return;
    const len = r.path.length;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow };
  });
  return !best || best.allow;
}

const sleep = (ms) => { if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };
function fetcher(o) {
  o = Object.assign({ rateMs: 2000, maxAgeDays: 30, timeoutS: 180, userAgent: 'Groundwork research (low rate; contact via tools.kentanthepropertyguy.com)', offline: false }, o || {});
  const last = new Map(), robots = new Map(), log = [];
  const fileFor = (url, ext) => { const u = new URL(url); return path.join(o.dir, u.host, crypto.createHash('sha1').update(url).digest('hex').slice(0, 20) + (ext || path.extname(u.pathname) || '.html')); };
  function raw(url, file) {
    const host = new URL(url).host, wait = (last.get(host) || 0) + o.rateMs - Date.now(); sleep(wait); last.set(host, Date.now());
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.part';
    let code = 0;
    try { code = Number(cp.execFileSync('curl', ['-sS', '-L', '--max-redirs', '5', '-m', String(o.timeoutS), '-A', o.userAgent, '-o', tmp, '-w', '%{http_code}', url], { encoding: 'utf8' }).trim()); } catch (e) { code = 0; }
    if (code >= 200 && code < 300 && fs.existsSync(tmp)) { fs.renameSync(tmp, file); } else { try { fs.unlinkSync(tmp); } catch (e) { /* none */ } }
    return code;
  }
  function allowed(url) {
    if (o.ignoreRobots) return true;
    const u = new URL(url), host = u.host;
    if (!robots.has(host)) {
      const f = path.join(o.dir, host, 'robots.txt');
      if (!fs.existsSync(f) && !o.offline) raw(u.protocol + '//' + host + '/robots.txt', f);
      robots.set(host, robotsRules(fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''));
    }
    return robotsAllows(robots.get(host), u.pathname + (u.search || ''));
  }
  // get(url, {ext}) -> { file, status: 'cached' | 'fetched' | 'robots' | 'failed' | 'offline', code }
  function get(url, opt) {
    opt = opt || {};
    const file = opt.file || fileFor(url, opt.ext), note = file + '.json';
    if (fs.existsSync(file)) {
      const age = (Date.now() - fs.statSync(file).mtimeMs) / 864e5;
      if (opt.maxAgeDays == null ? age <= o.maxAgeDays : age <= opt.maxAgeDays) return { file, status: 'cached' };
    }
    if (o.offline) return { file: fs.existsSync(file) ? file : null, status: 'offline' };
    if (!allowed(url)) { log.push({ url, status: 'robots' }); return { file: null, status: 'robots' }; }
    const code = raw(url, file);
    const ok = code >= 200 && code < 300;
    fs.writeFileSync(note, JSON.stringify({ url, code, at: new Date().toISOString() }));
    log.push({ url, status: ok ? 'fetched' : 'failed', code });
    return ok ? { file, status: 'fetched', code } : { file: fs.existsSync(file) ? file : null, status: 'failed', code };
  }
  return { get, allowed, fileFor, log };
}

module.exports = { fetcher, robotsRules, robotsAllows };
