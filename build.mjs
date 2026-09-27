// Turns data/ (raw portal JSON) into MkDocs Material sources under build/.
// Then: mkdocs build -f build/mkdocs.yml   (output lands in build/site/)
import fs from 'node:fs'; import path from 'node:path';
const SITE = 'https://community.developer.battle.net';
const OUT = 'build';
const read = f => JSON.parse(fs.readFileSync(path.join('data', f), 'utf8'));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const cell = s => esc(s).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
const save = (f, s) => { f = path.join(OUT, f); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };

// Rebuild the page tree from the saved navigation files, in portal order.
const find = (n, p) => n.path === p ? n : (n.children || []).reduce((hit, c) => hit || find(c, p), null);
const meta = new Map(), kids = new Map();
// Collapsed nodes (expandable, no children listed) have their own navigation file, like fetch.mjs saw them.
function walk(node) {
  if (node.expandable && !(node.children || []).length) node = find(read(`navigation/${node.path}.json`), node.path);
  meta.set(node.path, node.page || {});
  const children = (node.children || []).filter(c => c.path.startsWith('documentation'));
  if (children.length) kids.set(node.path, children.map(c => c.path));
  children.forEach(walk);
}
walk(find(read('navigation/documentation.json'), 'documentation'));

// documentation (the portal landing page) becomes the site home.
const fileOf = p => p === 'documentation' ? 'index.md' : kids.has(p) ? `${p}/index.md` : `${p}.md`;
const rel = (from, to, ext = '.md') => path.posix.relative(path.posix.dirname(fileOf(from)), fileOf(to)).replace(/\.md$/, ext);

// Portal links in guide HTML: archived pages point at the local copy, anything else at the live portal.
// Raw HTML is not rewritten by MkDocs, so these links use the final .html names.
const fixLinks = (html, from) => html.replace(/(href|src)="([^"]*)"/g, (m, attr, href) => {
  if (!href || /^(#|mailto:)/.test(href)) return m;
  const u = new URL(href, `${SITE}/${from}/`);
  if (u.origin !== SITE) return m;
  const target = u.pathname.slice(1).replace(/\/$/, '');
  return meta.has(target) ? `${attr}="${rel(from, target, '.html')}${u.hash}"` : `${attr}="${u.href}"`;
});

// Endpoint and parameter descriptions are Markdown and may hold portal-relative links.
const fixMdLinks = (md, from) => String(md ?? '').replace(/\]\((\/[^)\s]*)\)/g, (m, href) => {
  const u = new URL(href, SITE), target = u.pathname.slice(1).replace(/\/$/, '');
  return `](${meta.has(target) ? rel(from, target) + u.hash : u.href})`;
});

const params = (ps, from) => '\n| Parameter | Type | Required | Default | Description |\n|---|---|---|---|---|\n' + ps.map(p => {
  const def = p.defaultValue ?? p.default;
  const allowed = p.options?.length ? `<br>Allowed: ${p.options.map(o => `\`${cell(o)}\``).join(', ')}` : '';
  return `| \`${cell(p.name)}\` | ${cell(p.type)} | ${p.required ? 'Yes' : 'No'} | ${def ? `\`${cell(def)}\`` : ''} | ${fixMdLinks(cell(p.description), from)}${allowed} |`;
}).join('\n') + '\n';

// Home page: portal landing cards as a grid, with an icon and endpoint count per section.
const ICONS = {
  guides: 'book-open-variant', 'battle-net': 'shield-key', 'diablo-3': 'sword', hearthstone: 'cards-playing',
  'starcraft-2': 'rocket-launch', 'world-of-warcraft': 'axe-battle', 'world-of-warcraft-classic': 'castle',
  'streaming-provider-service': 'broadcast', 'getting-started': 'flag-checkered', 'using-oauth': 'key-variant',
};
const endpointCount = prefix => [...meta.keys()].filter(k => k === prefix || k.startsWith(prefix + '/'))
  .reduce((n, k) => n + (read(`content/${k}.json`).resources || []).reduce((a, r) => a + (r.methods || []).length, 0), 0);

const cards = (c, from) => {
  let md = '';
  for (const s of c.sections || []) {
    md += `## ${s.title}\n\n<div class="grid cards" markdown>\n\n` + (s.cardPages || []).map(cp => {
      const link = meta.has(cp.path) ? rel(from, cp.path) : `${SITE}/${cp.path}`;
      const n = endpointCount(cp.path);
      return `-   :material-${ICONS[cp.path.split('/').pop()] || 'file-document'}:{ .lg .middle } __[${cp.cardTitle || cp.title}](${link})__\n\n    ---\n\n    ${esc(cp.cardDescription || '')}` +
        (n ? `\n\n    <span class="count">${n} endpoints</span>` : '');
    }).join('\n\n') + '\n\n</div>\n\n';
  }
  return md;
};

const renderHome = c => `---\nhide:\n  - navigation\n  - toc\n---\n\n# Battle.net API docs archive\n\n` +
  `An unofficial copy of the [Battle.net Community Developer Portal](${SITE}/documentation) documentation. The portal now asks you to log in to read it; this archive doesn't. It covers every guide, endpoint and parameter, and is refreshed weekly. Press ++slash++ to search it.\n\n` +
  cards(c, 'documentation') +
  `<p class="source">Not affiliated with Blizzard Entertainment. All documentation content belongs to Blizzard.</p>\n`;

function render(p) {
  const c = read(`content/${p}.json`), m = meta.get(p);
  if (p === 'documentation') return renderHome(c);
  let md = `# ${m.title || p}\n\n`;
  md +=`<p class="source">Original page: <a href="${SITE}/${p}">${SITE.replace('https://', '')}/${p}</a></p>\n\n`;
  if (!c.html && m.description && p !== 'documentation') md += `${esc(m.description)}\n\n`;
  if (c.html) md += `<div class="portal-html">\n${fixLinks(c.html, p)}\n</div>\n\n`;
  md += cards(c, p);
  for (const r of c.resources || []) {
    md += `## ${r.name}\n\n`;
    for (const e of r.methods || []) {
      md += `### ${e.name}\n\n<p class="endpoint"><span class="verb ${esc((e.httpMethod || 'GET').toLowerCase())}">${esc(e.httpMethod || 'GET')}</span><code>${esc(e.path)}</code>${e.cnRegion ? '<span class="cn">Also in China</span>' : ''}</p>\n\n`;
      if (e.description) md += `${fixMdLinks(esc(e.description), p)}\n`;
      if (e.parameters?.length) md += params(e.parameters, p);
      md += '\n';
    }
  }
  return md;
}

fs.rmSync(OUT, { recursive: true, force: true });
for (const p of meta.keys()) save(`docs/${fileOf(p)}`, render(p));
fs.cpSync('theme', `${OUT}/docs/assets`, { recursive: true });

// Sidebar and tabs follow the portal's own navigation order and labels.
const label = p => meta.get(p).menuTitle || meta.get(p).title || p;
const navOf = p => kids.has(p) ? { [label(p)]: [fileOf(p), ...kids.get(p).map(navOf)] } : { [label(p)]: fileOf(p) };
const nav = [{ Home: 'index.md' }, ...kids.get('documentation').map(navOf)];
save('mkdocs.yml', `INHERIT: ../mkdocs.base.yml\nnav: ${JSON.stringify(nav)}\n`);
console.log('pages', meta.size);
