// Backs up Battle.net dev portal docs from its public page API.
// Walks api/pages/navigation/*.json to find every page, saves raw JSON under data/,
// and builds a static GitHub Pages site under docs/ (guide html + endpoint tables).
import fs from 'node:fs'; import path from 'node:path';
const SITE = 'https://community.developer.battle.net';
const BASE = SITE + '/api/pages/';
const DELAY_MS = 300; // pause between requests, to stay polite
const RETRIES = 6;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// GET with backoff on 429/5xx/network errors; honours Retry-After when sent.
async function get(p) {
  for (let i = 0; ; i++) {
    await sleep(DELAY_MS);
    let r;
    try { r = await fetch(BASE + p + '.json'); } catch (e) { r = { ok: false, status: e.code || 'network' }; }
    if (r.ok) return r.text();
    const retryable = r.status === 429 || r.status >= 500 || typeof r.status === 'string';
    if (!retryable || i >= RETRIES) throw new Error(`${p} -> ${r.status}`);
    const wait = Number(r.headers?.get('retry-after')) * 1000 || 2000 * 2 ** i;
    console.warn(`${p} -> ${r.status}, retry ${i + 1}/${RETRIES} in ${wait / 1000}s`);
    await sleep(wait);
  }
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Full refresh: build into temp dirs, swap into data/ and docs/ only after every page succeeded,
// so a failed run never leaves a half-empty site. Pages removed upstream disappear here too.
const TMP = { data: 'data.tmp', docs: 'docs.tmp' };
for (const d of Object.values(TMP)) fs.rmSync(d, { recursive: true, force: true });
const save = (f, s) => {
  f = f.replace(/^(data|docs)\//, (m, d) => TMP[d] + '/');
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s);
};

const pages = new Map(), seen = new Set();
async function nav(p) {
  if (seen.has(p)) return; seen.add(p);
  const raw = await get('navigation/' + p); save(`data/navigation/${p}.json`, raw);
  const walk = async n => {
    if (n.path?.startsWith('documentation')) pages.set(n.path, { title: n.page?.title || n.path, description: n.page?.description });
    for (const c of n.children || []) { if (c.expandable && !(c.children || []).length) await nav(c.path); await walk(c); }
  };
  await walk(JSON.parse(raw));
}
await nav('documentation');
for (const p of [...pages.keys()]) await nav(p);

// Portal links: backed-up pages point at local copies, anything else at the live portal.
// Relative hrefs resolve as the SPA does, with the page path treated as a directory.
const fixLinks = (html, from, up) => html.replace(/(href|src)="([^"]*)"/g, (m, attr, href) => {
  if (!href || /^(#|mailto:)/.test(href)) return m;
  const u = new URL(href, `${SITE}/${from}/`);
  if (u.origin !== SITE) return m;
  const clean = u.pathname.slice(1).replace(/\/$/, '');
  return pages.has(clean) ? `${attr}="${up}${clean}.html${u.hash}"` : `${attr}="${u.href}"`;
});

const CSS = `:root{--bg:#fff;--fg:#1d1d1f;--muted:#666;--line:#d0d0d0;--code:#f2f2f2;--link:#0b62d6}
@media (prefers-color-scheme:dark){:root{--bg:#15171b;--fg:#e6e6e6;--muted:#9a9a9a;--line:#3a3d44;--code:#23262c;--link:#6ea8ff}}
body{background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,sans-serif;max-width:1000px;margin:auto;padding:16px}
a{color:var(--link)}nav,small{color:var(--muted)}img{max-width:100%}
table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}td,th{border:1px solid var(--line);padding:4px 6px;text-align:left;vertical-align:top}
code,pre{background:var(--code);border-radius:3px}code{padding:0 3px}pre{padding:8px;overflow-x:auto}`;

const shell = (title, up, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Battle.net API docs archive</title>
<link rel="stylesheet" href="${up}style.css"></head><body>
<nav><a href="${up}index.html">Battle.net API docs archive</a></nav>
${body}</body></html>`;

const render = (p, { title, description }, c) => {
  const up = '../'.repeat(p.split('/').length - 1);
  let h = `<h1>${esc(title)}</h1>\n<p><small>Original: <a href="${SITE}/${p}">${SITE}/${p}</a></small></p>\n`;
  if (!c.html && description) h += `<p>${esc(description)}</p>`;
  h += fixLinks(c.html || '', p, up);
  // Landing pages: card grids linking to child pages.
  for (const s of c.sections || []) {
    h += `\n<h2>${esc(s.title)}</h2><ul>` + (s.cardPages || []).map(cp =>
      `<li><a href="${pages.has(cp.path) ? up + cp.path + '.html' : `${SITE}/${cp.path}`}">${esc(cp.cardTitle || cp.title)}</a>${cp.cardDescription ? ` — ${esc(cp.cardDescription)}` : ''}</li>`).join('') + '</ul>';
  }
  for (const r of c.resources || []) {
    h += `\n<h2>${esc(r.name)}</h2>${r.description ? `<p>${esc(r.description)}</p>` : ''}`;
    for (const m of r.methods || []) {
      h += `\n<h3>${esc(m.name)}</h3><p><code>${esc(m.httpMethod || 'GET')} ${esc(m.path)}</code>${m.cnRegion ? ' <small>(available in CN)</small>' : ''}</p>${m.description ? `<p>${esc(m.description)}</p>` : ''}`;
      if (m.parameters?.length) h += '<table><tr><th>Name</th><th>Type</th><th>Required</th><th>Default</th><th>Description</th></tr>' +
        m.parameters.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.type)}</td><td>${p.required ? 'yes' : ''}</td><td>${esc(p.defaultValue ?? p.default)}</td><td>${esc(p.description)}${p.options?.length ? `<br><small>Allowed: ${p.options.map(esc).join(', ')}</small>` : ''}</td></tr>`).join('') + '</table>';
    }
  }
  return shell(title, up, h);
};

const idx = [];
for (const [p, meta] of [...pages].sort()) {
  const { title } = meta;
  const raw = await get('content/' + p);
  save(`data/content/${p}.json`, raw);
  save(`docs/${p}.html`, render(p, meta, JSON.parse(raw)));
  const depth = p.split('/').length - 1;
  idx.push(`<li style="margin-left:${depth * 1.2}em"><a href="${p}.html">${esc(title)}</a> <small>${p}</small></li>`);
}
const date = new Date().toISOString().slice(0, 10);
save('docs/style.css', CSS);
save('docs/.nojekyll', '');
save('docs/index.html', shell('Index', '', `<h1>Battle.net API docs archive</h1>
<p>Unofficial text snapshot of the <a href="${SITE}/documentation">Battle.net Community Developer Portal</a> documentation, taken ${date}. Not affiliated with Blizzard Entertainment.</p>
<ul style="list-style:none;padding:0">${idx.join('\n')}</ul>`));
if (pages.size < 10) throw new Error(`only ${pages.size} pages found, refusing to replace the archive`);
for (const [d, tmp] of Object.entries(TMP)) { fs.rmSync(d, { recursive: true, force: true }); fs.renameSync(tmp, d); }
console.log('pages', pages.size);
