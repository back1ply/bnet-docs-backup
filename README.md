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

## Repository layout

```
docs/                  static site served by GitHub Pages
  index.html           table of contents
  documentation/...    one HTML page per portal page
data/
  navigation/...json   raw page tree from the portal
  content/...json      raw page content ({ html, resources[].methods[] }), unmodified
fetch.mjs              rebuilds data/ and docs/
.github/workflows/     weekly refresh job
```

`data/` is the source of truth. It holds the portal's own JSON, stored byte for byte. `docs/` is generated from it. Use `git log -p data/` to see how the upstream documentation changed over time.

## How it works

The portal is a single-page app. Its login wall only applies to the UI, while its page data comes from a public JSON API:

- `GET /api/pages/navigation/<path>.json` returns the page tree, which is loaded lazily per section.
- `GET /api/pages/content/<path>.json` returns the guide HTML and the endpoint definitions.

`fetch.mjs` walks the navigation tree from `documentation`, fetches every page's content, and saves the raw JSON. It then renders a plain static HTML page for each one. Links between archived pages are rewritten to point at the local copies.

## Refreshing

The refresh needs Node 18 or newer. It has no dependencies.

```sh
node fetch.mjs
```

Each run is a **full refresh**:

- **Full rebuild.** Pages are rediscovered from the navigation tree every time. New pages are picked up, and pages removed upstream disappear from the archive.
- **Atomic swap.** Output is built in `data.tmp/` and `docs.tmp/`, and replaces `data/` and `docs/` only after every request succeeds. A failed run leaves the existing archive untouched.
- **Sanity check.** If fewer than 10 pages are found, for example because the API changed shape, the run aborts instead of wiping the archive.
- **Rate limiting.** There is a 300 ms pause between requests. Requests that fail with `429`, `5xx`, or a network error are retried up to 6 times with exponential backoff (2 s, 4 s, 8 s …). A `Retry-After` header is honoured when the server sends one. You can tune `DELAY_MS` and `RETRIES` at the top of `fetch.mjs`.

### Automatic refresh

`.github/workflows/refresh.yml` runs every Monday at 06:00 UTC. You can also start it by hand from the Actions tab with **Run workflow**. The job commits only when the raw data changed, so the history stays clean. If a refresh fails, GitHub emails the repo owner.

GitHub disables scheduled workflows in public repos after 60 days without repository activity. When the docs don't change, the job commits nothing, so after two quiet months GitHub will email you that the workflow was disabled. Re-enable it from the Actions tab.

## Publishing on GitHub Pages

1. Push this repo to GitHub.
2. Open **Settings → Pages → Build and deployment**.
3. Set **Source** to *Deploy from a branch*, pick the `main` branch, and set the folder to `/docs`.
4. Open **Settings → Actions → General → Workflow permissions** and make sure *Read and write permissions* is allowed, so the refresh job can push.

`docs/.nojekyll` makes Pages serve the files as they are, without running Jekyll.

## License

The scripts in this repo (`fetch.mjs`, the workflow) are provided as-is with no warranty. The archived documentation content is not covered by any license from this repo. It remains the property of Blizzard Entertainment and is mirrored here for reference only. If you are a rights holder and want it removed, open an issue.
