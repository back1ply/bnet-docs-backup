// Turns data/ (raw portal JSON) into MkDocs Material sources under build/.
// Then: mkdocs build -f build/mkdocs.yml   (output lands in build/site/)
import fs from 'node:fs'; import path from 'node:path';
const SITE = 'https://community.developer.battle.net';
const OUT = 'build';
const read = f => JSON.parse(fs.readFileSync(path.join('data', f), 'utf8'));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const cell = s => esc(s).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
const save = (f, s) => { f = path.join(OUT, f); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };

// Page tree in portal order, from the merged navigation fetch.mjs saved.
const meta = new Map(), kids = new Map();
function walk(node) {
  meta.set(node.path, node.page || {});
  if (node.children.length) kids.set(node.path, node.children.map(c => c.path));
  node.children.forEach(walk);
}
walk(read('navigation.json'));

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
  `An unofficial copy of the [Battle.net Community Developer Portal](${SITE}/documentation) documentation. The portal now asks you to log in to read it; this archive doesn't. It covers every guide, endpoint and parameter, and is refreshed weekly. Press ++slash++ to search it.\n\nFor AI tools, the whole archive is also one compact Markdown file: [llms-full.txt](llms-full.txt) (index: [llms.txt](llms.txt)).\n\n` +
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

// ---- llms.txt / llms-full.txt: one token-lean Markdown file for AI lookups ----
const PAGES_URL = 'https://back1ply.github.io/bnet-docs-backup/';
const unesc = s => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
// Just enough HTML -> Markdown for the portal's guides. Internal links become plain text; external URLs stay.
const toMd = html => unesc(html
  .replace(/<pre[^>]*>\s*(?:<code[^>]*>)?([\s\S]*?)(?:<\/code>)?\s*<\/pre>/g, (m, c) => `\n\`\`\`\n${c.replace(/<[^>]+>/g, '')}\n\`\`\`\n`)
  .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g, (m, n, t) => `\n${'#'.repeat(Math.min(+n + 2, 6))} ${t.replace(/<[^>]+>/g, '').trim()}\n`)
  .replace(/<a [^>]*href="(https?:\/\/(?!community\.developer\.battle\.net)[^"]+)"[^>]*>([\s\S]*?)<\/a>/g, '[$2]($1)')
  .replace(/<code[^>]*>([\s\S]*?)<\/code>/g, '`$1`')
  .replace(/<li[^>]*>/g, '\n- ').replace(/<\/t[hd]>\s*<t[hd][^>]*>/g, ' | ').replace(/<tr[^>]*>\s*<t[hd][^>]*>/g, '\n| ').replace(/<\/t[hd]>\s*<\/tr>/g, ' |')
  .replace(/<br\s*\/?>/g, '\n').replace(/<\/?(p|div|ul|ol|table|thead|tbody)[^>]*>/g, '\n')
  .replace(/<[^>]+>/g, '')).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

// Parameters repeated 3+ times with the same description are defined once at the top.
const all = [...meta.keys()].map(p => [p, read(`content/${p}.json`)]);
const seenParam = new Map();
for (const [, c] of all) for (const r of c.resources || []) for (const e of r.methods) for (const q of e.parameters || []) {
  const k = `${q.name}\n${q.description}`; seenParam.set(k, (seenParam.get(k) || 0) + 1);
}
// Sorted rarest first so a name's most common description wins; printed most common first.
const shared = new Map([...seenParam].filter(([, n]) => n >= 3).sort((a, b) => a[1] - b[1]).map(([k]) => k.split('\n')));
const clean = s => toMd(s || '').replace(/\s+/g, ' ');
const param = q => {
  const def = q.defaultValue ?? q.default;
  let s = `${q.name}${q.required ? '*' : ''}${def ? `=${def}` : ''}`;
  if (shared.get(q.name) === q.description) return s;
  return `${s} (${q.type})${q.description ? ' ' + clean(q.description) : ''}${q.options?.length ? ` [${q.options.join('|')}]` : ''}`;
};

// Pages whose guide text or endpoint list matches an earlier page point to it instead of repeating it.
const firstSeen = new Map();
const sameAs = (kind, value, p) => { if (!value) return null; const k = kind + value; if (firstSeen.has(k)) return firstSeen.get(k); firstSeen.set(k, p); return null; };

let full = `# Battle.net API docs (archive)\n\nText of ${SITE}/documentation for AI lookups. Hosts: {region}.api.blizzard.com (us|eu|kr|tw), gateway.battlenet.com.cn (CN). OAuth: oauth.battle.net.\n` +
  `Endpoint format: METHOD path: description. Params: name* = required, =value = default or example.\n\n## Shared parameters\n\n` +
  [...shared].reverse().map(([n, d]) => `- ${n}: ${clean(d)}`).join('\n') + '\n';
for (const [p, c] of all) {
  if (!c.html && !c.resources?.length) continue; // landing pages only link to children
  full += `\n## ${meta.get(p).title} (${p})\n\n`;
  const text = c.html ? toMd(c.html) : '', dupText = sameAs('t', text, p);
  if (dupText) full += `Guide text same as ${dupText}.\n`; else if (text) full += text + '\n';
  const dupApi = c.resources?.length && sameAs('r', JSON.stringify(c.resources), p);
  if (dupApi) { full += `\nEndpoints same as ${dupApi}.\n`; continue; }
  for (const r of c.resources || []) {
    full += `\n### ${r.name}\n`;
    for (const e of r.methods) {
      full += `\n${e.httpMethod || 'GET'} ${e.path}${e.cnRegion ? ' (also CN)' : ''}: ${clean(e.description)}\n`;
      if (e.parameters?.length) full += `Params: ${e.parameters.map(param).join('; ')}\n`;
    }
  }
}
save('docs/llms-full.txt', full);
save('docs/llms.txt', `# Battle.net API docs (archive)\n\n> Unofficial text archive of the Battle.net Community Developer Portal API documentation.\n\nFull text in one file: ${PAGES_URL}llms-full.txt\n\n## Pages\n\n` +
  [...meta.keys()].map(p => `- [${meta.get(p).title}](${PAGES_URL}${fileOf(p).replace(/\.md$/, '.html')})`).join('\n') + '\n');
console.log('pages', meta.size, '| llms-full.txt', full.length, 'chars');
