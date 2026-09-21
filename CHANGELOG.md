# Changelog

## 1.0.1

- Build and publish releases directly in GitHub Actions.
- Generate GitHub artifact attestations for `main.js`, `manifest.json`, and `styles.css` so users can verify their build provenance.
- Verify the downloaded release assets against both the build and their attestations.
- Document verification commands. Calendar behavior is unchanged.

## 1.0.0

First public release.

- A lightweight monthly calendar registered as a native Bases view.
- Selectable start date and optional inclusive end date.
- Continuous multi-day bars with weekly continuation markers and separate lanes for overlapping notes.
- Native hover previews, double-click to open, and an Open to the right context action.
- Create a note from an empty day with its date already filled in.
- Delete notes using Obsidian's configured trash preference.
- Monday or Sunday week start, English UI, and theme-aware styling.
- No runtime libraries, external services, or community plugin dependencies.
