// Downloads the Battle.net dev portal docs from its public page API into data/.
// data/ is the single source of truth; build.mjs turns it into the site.
import fs from 'node:fs'; import path from 'node:path';
const BASE = 'https://community.developer.battle.net/api/pages/';
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

// Full refresh: write into data.tmp/ and swap it in only after every request succeeded,
// so a failed run never leaves a half-empty archive. Pages removed upstream disappear too.
const TMP = 'data.tmp';
fs.rmSync(TMP, { recursive: true, force: true });
const save = (f, s) => { f = path.join(TMP, f); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };

// Navigation is lazy: a collapsed node (expandable, no children) must be fetched on its own,
// and each response repeats the whole tree from the root. Merge them into one tree.
// Nav nodes of API pages also embed a copy of their endpoints (page.content); content/ has
// the full page, so that copy is dropped to keep one source of truth.
const find = (n, p) => n.path === p ? n : (n.children || []).reduce((hit, c) => hit || find(c, p), null);
const pages = new Set();
async function expand(node) {
  if (node.expandable && !(node.children || []).length) node = find(JSON.parse(await get('navigation/' + node.path)), node.path);
  pages.add(node.path);
  const children = [];
  for (const c of node.children || []) children.push(await expand(c));
  const { content, ...page } = node.page || {};
  return { ...node, page, children };
}
const tree = await expand(find(JSON.parse(await get('navigation/documentation')), 'documentation'));
save('navigation.json', JSON.stringify(tree, null, 2) + '\n');

for (const p of pages) save(`content/${p}.json`, await get('content/' + p));

if (pages.size < 10) throw new Error(`only ${pages.size} pages found, refusing to replace the archive`);
fs.rmSync('data', { recursive: true, force: true });
fs.renameSync(TMP, 'data');
console.log('pages', pages.size);
