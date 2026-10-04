# Model profiles

A profile is a JSON map of section code to section title, referenced by `sectionsFile` in `plans.config.json`. Titles only label the app; any section missing here falls back to the title detected on its first page (e.g. "SECTION 6: VERTICAL STABILIZER"), then to "Section NN".

- `rv14.json` – RV-14 / RV-14A (tested end-to-end).

To add a model, copy a profile, rename it (e.g. `rv10.json`), fill in what you know, and point `sectionsFile` at it. Pull requests welcome. Profiles must contain section titles only, never plan content.
