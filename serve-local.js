// Local preview server, no dependencies:  node tools\serve-local.js   then open http://localhost:8080/
// Serves this folder to your own computer only (127.0.0.1). Stop with Ctrl+C.
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), port = Number(process.env.PORT) || 8080;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || /[\\/]tools[\\/]market-data[\\/](raw|out)[\\/]/.test(f)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('Not found'); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(d); });
}).listen(port, '127.0.0.1', () => console.log('KPT local preview: http://localhost:' + port + '/   (Ctrl+C to stop)'));
