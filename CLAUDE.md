# rv-plans-assistant

Processes a builder's own Van's RV plan PDFs into a private Cloudflare Worker PWA (see README.md). All aircraft-specific settings are in `plans.config.json` (template: `plans.config.example.json`); section titles in `models/*.json`.

- Never commit plan content: `plans/`, `enrich/`, `build/`, `app/public/{img,data}` and any PDF stay out of git. This repo is public.
- Never deploy without Cloudflare Access configured (`scripts/check_access.sh` enforces the vars; Access itself must be enabled on the workers.dev route).
- Ask before spending API money: `make estimate SECTIONS=..` shows the cost (actual batch cost ≈ 2/3 of the estimate).
- Answering plan questions locally: `app/public/data/parts.json` (part → uses in build order), `app/public/data/pages/{id}.json` (steps/figures/notes), images in `app/public/img/ai/{id}.webp` (+ `_q1.._q4`). Cite page ids.
- Python: `.venv/bin/python`. `cd app && npm run build` type-checks the PWA and the Worker.
- Keep README.md current when the workflow changes.
