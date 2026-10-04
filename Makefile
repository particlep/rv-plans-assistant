# rv-plans-assistant pipeline. SECTIONS is a comma list like 06,07,08 (default: all PDFs found).
PY := .venv/bin/python
SECTIONS ?=
SEC_ARG := $(if $(SECTIONS),--sections $(SECTIONS),)
YES_ARG := $(if $(YES),--yes,)
WORKER_NAME = $(shell grep -m1 '"name"' app/wrangler.jsonc | sed -E 's/.*"name": "([^"]+)".*/\1/')

.PHONY: setup placeholder parts extract enrich enrich-batch estimate data build dev deploy

setup:            ## one-time: venv, npm, config files, KV namespace
	./scripts/setup.sh

placeholder:      ## deploy a locked placeholder so you can enable Access before any content goes up
	cd scripts/placeholder && npx --prefix ../../app wrangler deploy index.js --name $(WORKER_NAME) --compatibility-date 2026-09-01

parts:            ## parse the parts index section
	cd pipeline && ../$(PY) parts_index.py

extract: parts    ## text, part positions and page images from the PDFs (free)
	cd pipeline && ../$(PY) extract.py $(SEC_ARG)

estimate:         ## show which pages would be enriched and the estimated cost
	cd pipeline && ../$(PY) enrich.py $(if $(SECTIONS),--sections $(SECTIONS),--all) --batch --dry-run

enrich:           ## Claude reads the drawings now (~$0.15/page; needs .env)
	cd pipeline && ../$(PY) enrich.py $(if $(SECTIONS),--sections $(SECTIONS),--all) $(YES_ARG)

enrich-batch:     ## same via the Batches API (~half price, usually < 1 hour)
	cd pipeline && ../$(PY) enrich.py $(if $(SECTIONS),--sections $(SECTIONS),--all) --batch $(YES_ARG)

data:             ## merge everything into app/public/data
	cd pipeline && ../$(PY) build_data.py

build: data
	cd app && npm run build

dev: data         ## local server at http://localhost:8787 (needs app/.dev.vars with DEV_BYPASS_AUTH=1)
	cd app && npm run build && npx wrangler dev

deploy: data      ## build and publish (refuses unless Access is configured)
	./scripts/check_access.sh
	cd app && npm run deploy
