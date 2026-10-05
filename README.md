# rv-plans-assistant

Turn your own copy of the Van's Aircraft RV construction plans into a private, phone-friendly web app for the shop:

- **Page viewer**: pinch/double-tap zoom, full screen, tappable part numbers on the drawing, bookmarks, works offline.
- **Part lookup**: name, material and sub-kit from the plans' parts index, plus every page that uses the part in build order and what is done to it (drill, dimple, prime, rivet…). Standard AN/MS hardware is decoded (AN426AD3-3.5 → flush rivet, 3/32" x 7/32").
- **Search**: part numbers and text across steps, figures, notes and reference sections.
- **Ask**: chat with Claude, which searches your plans, reads pages and looks at the drawings, then answers with tappable page citations. Each answer shows the lookups it made and what it cost; on desktop the cited page appears alongside with the area Claude zoomed into outlined.

Desktop gets a three-pane workspace (sections · drawing · steps) with `/` to search; phones get one screen at a time with thumb-reach controls.

It runs on your own Cloudflare account, behind Cloudflare Access (email one-time-code login), using your own Anthropic API key.

> **Important**
> - **Not affiliated with or endorsed by Van's Aircraft.** You must own the plans you process.
> - **This repository contains no plan content.** The pipeline processes *your* PDFs into *your* private deployment. Plan PDFs, page images and Claude's transcriptions (`plans/`, `enrich/`, `build/`, `app/public/img|data`) are git-ignored. Don't commit them to a public fork, and keep your site behind Access.
> - **The plans are the authority.** The assistant can misread a drawing; it cites pages so you can check. Follow Van's current revisions and service bulletins.

**Tested with:** RV-14/14A plans (vector PDFs, Van's standard page layout). Other models with similar PDFs should work with a config change; see [Other models](#other-models).

---

## What it costs

| | |
|---|---|
| Cloudflare | Workers Paid plan ($5/mo) recommended; the app uses Workers, static assets and KV |
| Reading the drawings (one-time) | ~$0.075/page with the Batch API (~$13 for the RV-14 empennage + reference sections, 178 pages) |
| Asking questions | ~5–10¢ for a text-only question; more when Claude looks at several drawings or the thread gets long |

---

## Setup

Requirements: Python 3.12+, Node 20+, a Cloudflare account, an [Anthropic API key](https://console.anthropic.com/) created **inside a workspace**.

```sh
git clone https://github.com/particlep/rv-plans-assistant && cd rv-plans-assistant
make setup
```

`make setup` creates a Python venv, installs npm packages, copies `plans.config.example.json` → `plans.config.json`, logs in to Cloudflare, creates a KV namespace for chat history, and writes `app/wrangler.jsonc`.

### 1. Your plans and config

- Put your plan PDFs in `plans/`, or set `plansDir` in `plans.config.json` to wherever they are.
- Check `plans.config.json` (see [Config](#config)). The defaults match the RV-14 file names (`06_14.pdf`, `Manual Section 5.pdf`, …).
- Create `.env` containing `ANTHROPIC_API_KEY=sk-ant-...`.

### 2. Create the Worker locked, then turn on Cloudflare Access

Cloudflare Access can only be enabled on a Worker that exists, and your plans must never be public, not even briefly. So:

```sh
make placeholder      # deploys a Worker that answers 403 to everything
```

Then in the Cloudflare dashboard:

1. **Workers & Pages → your worker → Settings → Domains & Routes → workers.dev → enable Cloudflare Access.** Add a policy that allows only your email address.
2. Copy the **team domain** (Zero Trust → Settings, e.g. `yourteam.cloudflareaccess.com`) and the **Application Audience (AUD) tag** (Zero Trust → Access → Applications → your app) into `app/wrangler.jsonc` → `vars`.
3. Give the Worker your API key: `cd app && npx wrangler secret put ANTHROPIC_API_KEY`.

`make deploy` refuses to run until those values are set. The Worker also re-verifies the Access token on every API call, so it fails closed. Preview URLs are disabled because Access doesn't cover them.

### 3. Process the plans and deploy

```sh
make extract          # free: text, part positions, page images (~1.3 s/page)
make estimate         # shows pages + estimated cost (actual is usually ~2/3 of the estimate)
make enrich-batch     # Claude reads every drawing via the Batch API, usually < 1 hour
make deploy
```

Open `https://<worker>.<subdomain>.workers.dev` on your phone, sign in, then Share → **Add to Home Screen**.

Paid runs always show the page list and estimate and ask before sending anything (`YES=1 make enrich-batch` skips that for new pages). Pages that already have a reading are never re-read silently: with `--force`, or after `PROMPT_VERSION` in `enrich.py` changes, you're asked to type `redo`, and non-interactive runs refuse.

Keep a private backup of `enrich/` (a private repo, a cloud drive). It's what you paid for, and it's plan content, so it can't go in a public repo.

---

## Adding sections later

```sh
cp ~/Downloads/13_14.pdf plans/
make extract SECTIONS=13
make estimate SECTIONS=13
make enrich-batch SECTIONS=13      # or `make enrich SECTIONS=13` for immediate results at ~2x the price
make deploy
```

Plan revision from Van's? Replace the PDF, run `make extract SECTIONS=NN`, then re-read only the changed pages: `cd pipeline && ../.venv/bin/python enrich.py --pages 13-04,13-05 --force`.

| Command | |
|---|---|
| `make data` | Rebuild the app data from `build/raw` + `enrich/` |
| `make dev` | Local server at http://localhost:8787. Create `app/.dev.vars` with `DEV_BYPASS_AUTH=1` (and `ANTHROPIC_API_KEY=` for chat) |
| `enrich.py --pages ID,ID --force` | Re-read specific pages |
| `extract.py --force-images` | Re-render page images |

---

## Config

`plans.config.json`:

| Key | Meaning | RV-14 default |
|---|---|---|
| `model` | Shown in the app and used in Claude's prompts | `"RV-14"` |
| `plansDir` | Folder with your PDFs (relative to the repo or absolute) | `"plans"` |
| `enrichDir` | Where Claude's page readings are stored (plan content, keep private) | `"enrich"` |
| `sectionsFile` | Section titles (see `models/`) | `"models/rv14.json"` |
| `partsIndexSection` | Section containing the parts index table | `"04"` |
| `firstBuildSection` | Sections before this are treated as reference material | `6` |
| `filePatterns` | Regexes matched against PDF file names. A string pattern needs a `(?P<section>…)` group; `{"pattern": …, "section": "00"}` maps one-off files | RV-14 names |

Page ids are `SS-PP` (`09-04`, `40A-03`): section from the file name, page from PDF order.

### Other models

The pipeline relies on what Van's plans have in common: vector PDFs with real text, a title block with `REVISION:`/`DATE:`, `Step N:` / `FIGURE N:` conventions, and Van's part numbering. For another model:

1. Set `model`, and adjust `filePatterns` to your file names.
2. Copy `models/rv14.json` to e.g. `models/rv10.json` and edit the titles (optional: titles are auto-detected from each section's first page).
3. Check `partsIndexSection` / `firstBuildSection`.
4. Run `make extract`, then `make data && make dev`, and look at a few pages and the parts list before paying for enrichment. Try `enrich.py --pages <one page>` first.

The parts-index parser (`pipeline/parts_index.py`) expects the RV-14 layout (a rotated table with PART NUMBER / NOMENCLATURE / … headers). If your model's index differs, it prints a warning and parts simply show without names until the parser is adapted. PRs with model profiles or parser fixes are welcome.

---

## How it works

```
PDFs ──extract.py──▶ build/raw/{id}.json   title block, text blocks, part numbers + positions
     │               app/public/img/{view,ai,thumb}/{id}.webp  (+ 2x quadrant crops for Claude)
     ├─parts_index.py▶ build/parts_index.json
     └─enrich.py─────▶ enrich/{id}.json    Claude reads the page image + quadrants + exact PDF text:
                                            ordered steps, figures, notes, what happens to each part
build_data.py ──▶ app/public/data/  meta, parts, search docs, one JSON per page
app/   Vite + Preact PWA (src/) and a Cloudflare Worker (worker/) serving it as static assets + /api
```

- **Search** uses one MiniSearch index shared by the browser and the Worker (`app/src/shared/search.ts`), so Claude searches exactly what you search. It's keyword search: part numbers match whole or in pieces, words match by prefix, with light typo tolerance.
- **Ask** (`app/worker/chat.ts`) runs a streaming Claude tool-use loop with five tools: `search_plans`, `lookup_part`, `get_page`, `view_page` (whole page or a quadrant at ~2x) and `list_section`. Conversations are stored in Workers KV in your account; drawings are stored as references and re-attached per request.
- **What leaves Cloudflare:** each chat round sends your question, the conversation and whatever the tools returned (text and drawing images) to the Anthropic API. Nothing else goes anywhere.
- **Offline:** a service worker caches the app, data and every page image you've viewed. "Save section for offline" pre-caches a whole section.

```
pipeline/   common.py (config) · extract.py · parts_index.py · enrich.py · build_data.py · make_icons.py
models/     section-title profiles
app/src/    PWA: views/, data.ts, router.ts, linkify.tsx, shared/search.ts
app/worker/ index.ts (routes) · auth.ts (Access JWT) · chat.ts · tools.ts · data.ts
scripts/    setup.sh · check_access.sh · placeholder/
```

---

## Troubleshooting

- **"must include the anthropic-workspace-id header":** your API key is org-level. Create one inside a workspace, or set `ANTHROPIC_WORKSPACE_ID` in `.env` and as a Worker secret.
- **"Your login session expired" in the app:** tap Reload / sign in.
- **Old data right after a deploy:** the offline cache serves the previous version once; reopen the app.
- **Interrupted batch:** the batch id is in `build/last_batch.txt`; results stay available for 29 days. Rerunning skips pages already in `enrich/`.
- **Worker logs:** `cd app && npx wrangler tail`.

## License

MIT for the code. Van's Aircraft plans and anything derived from them remain Van's copyright.
