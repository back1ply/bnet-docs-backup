# Battle.net API Docs Archive

An unofficial, browsable text archive of the [Battle.net Community Developer Portal](https://community.developer.battle.net/documentation) documentation.

The portal now requires a Battle.net login just to read the docs. This repo keeps a public, searchable copy of the text: every guide, every API endpoint, and every parameter. It is refreshed automatically each week.

**Browse it:** https://back1ply.github.io/bnet-docs-backup/

> Not affiliated with, endorsed by, or supported by Blizzard Entertainment. All documentation content is © Blizzard Entertainment. Using the APIs themselves is governed by the [Blizzard Developer API Terms of Use](https://www.blizzard.com/en-us/legal/a2989b50-5f16-43b1-abec-2ae17cc09dd6/blizzard-developer-api-terms-of-use).

## What's covered

| Section | Contents |
|---|---|
| Guides | Getting started, using OAuth (authorization code, client credentials, OIDC endpoints, example apps), community vs. game data APIs, regionality |
| Battle.net | OAuth APIs |
| World of Warcraft | Game Data APIs, Profile APIs, guides (namespaces, search, media, localization, character renders, known issues) |
| WoW Classic | Game Data APIs, Profile APIs, guides |
| Diablo III | Community APIs (including CN), Game Data APIs |
| Hearthstone | Game Data APIs, guides (card search, decks, card backs, metadata, game modes, localization) |
| StarCraft II | Community APIs, Game Data APIs |
| Streaming Provider Service | Overview |

The archive holds 49 pages in total. Every endpoint is listed with its HTTP method, path, description, and a table of its parameters: name, type, whether it is required, default value, and description.

Only text is archived. Images and links to portal pages outside the archive still point to Blizzard's servers.

### Notes on the source

- **Repeated text is upstream, not an archive bug.** The WoW and WoW Classic guides are near-identical: localization, media documents and search match word for word. Diablo III Community APIs and Community APIs (CN) list the same endpoints. Many API reference pages open with the same intro text. The archive mirrors the portal as it is and does not deduplicate.
- **English only.** The page API returns the same English content whatever locale you ask for.
- **Older URLs are gone.** Paths such as `/documentation/api-reference/*` and `/documentation/guides/migration-guide` return 404 on the portal and are not part of the current docs. Earlier copies may exist on the [Wayback Machine](https://web.archive.org/web/*/community.developer.battle.net/documentation/*).
- **Some odd formatting is upstream too.** A few portal pages contain malformed HTML, such as nested paragraphs, and it renders the same way here.

## Repository layout

```
data/                   source of truth: the portal's JSON, stored byte for byte
  navigation/...json    page tree (loaded lazily per section)
  content/...json       page content: { html, sections, resources[].methods[] }
fetch.mjs               portal API -> data/
build.mjs               data/ -> Markdown site sources in build/ (not committed)
mkdocs.base.yml         site config (theme, search, palette)
theme/extra.css         style tweaks on top of Material for MkDocs
requirements.txt        pinned MkDocs + Material versions
.github/workflows/      weekly refresh + deploy
```

Only `data/` holds content. Everything the site shows is generated from it, so `git log -p data/` is an exact history of how the upstream documentation changed.

## How it works

The portal is a single-page app. Its login wall only applies to the UI, while its page data comes from a public JSON API:

- `GET /api/pages/navigation/<path>.json` returns the page tree.
- `GET /api/pages/content/<path>.json` returns the guide HTML, the landing-page cards and the endpoint definitions.

1. `fetch.mjs` walks the navigation tree from `documentation` and saves every page's raw JSON into `data/`.
2. `build.mjs` reads `data/` and writes one Markdown page per portal page into `build/docs/`. It also writes `build/mkdocs.yml`, which inherits `mkdocs.base.yml` and adds a sidebar that follows the portal's own order and labels. Links between archived pages are rewritten to point at the local copies. Other portal links go to the live site.
3. [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/) turns that into the static site, with tabs per game, full-text search and a light/dark toggle.

## Building locally

This needs Node 18 or newer and Python 3.9 or newer.

```sh
node fetch.mjs                          # optional: pull fresh data
node build.mjs
pip install -r requirements.txt         # or: uvx --with-requirements requirements.txt mkdocs ...
mkdocs serve -f build/mkdocs.yml        # preview at http://127.0.0.1:8000
```

## Refreshing

Every `node fetch.mjs` run is a **full refresh**:

- **Full rebuild.** Pages are rediscovered from the navigation tree every time. New pages are picked up, and pages removed upstream disappear from the archive.
- **Atomic swap.** Data is written to `data.tmp/` and replaces `data/` only after every request succeeds. A failed run leaves the existing archive untouched.
- **Sanity check.** If fewer than 10 pages are found, for example because the API changed shape, the run aborts instead of wiping the archive.
- **Rate limiting.** There is a 300 ms pause between requests. Requests that fail with `429`, `5xx`, or a network error are retried up to 6 times with exponential backoff (2 s, 4 s, 8 s …). A `Retry-After` header is honoured when the server sends one. You can tune `DELAY_MS` and `RETRIES` at the top of `fetch.mjs`.

### Automation

`.github/workflows/refresh.yml` does two jobs:

- **Every Monday at 06:00 UTC, or on a manual run** (Actions → **Run workflow**): it fetches fresh data, commits `data/` only if something changed, then builds and deploys the site.
- **On every push to `main`:** it rebuilds and deploys from the committed data, without fetching.

The site build runs with `--strict`, so a broken internal link fails the deploy instead of shipping. If a run fails, GitHub emails the repo owner.

GitHub disables scheduled workflows in public repos after 60 days without repository activity. When the docs don't change, the job commits nothing, so after two quiet months GitHub will email you that the workflow was disabled. Re-enable it from the Actions tab.

## GitHub Pages setup

Open **Settings → Pages** and set **Source** to *GitHub Actions*. The workflow handles the rest.

## License

The scripts and config in this repo are provided as-is with no warranty. The archived documentation content is not covered by any license from this repo. It remains the property of Blizzard Entertainment and is mirrored here for reference only. If you are a rights holder and want it removed, open an issue.
