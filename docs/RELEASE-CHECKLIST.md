# Release checks

This checklist records engineering checks. It does not claim approval by the Obsidian Community directory.

## Official requirements

- [Developer policies](https://docs.obsidian.md/community-directory/developer-policies).
- [Submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins).
- [Manifest reference](https://docs.obsidian.md/Reference/Manifest).
- [Release and submission process](https://docs.obsidian.md/plugins/releasing/submit-plugin).

## Before publishing

- Run `npm ci` and `npm run check` using the committed lockfile.
- Use the official `eslint-plugin-obsidianmd` recommended configuration with zero warnings.
- Keep manifest, package, release tag and `versions.json` consistent.
- Include the MIT license, an English README, source code and actual application screenshots.
- Verify that `main.js` requires only the host `obsidian` module and the package has no runtime dependencies.
- Verify there is no telemetry, remote code, network access, account requirement, advertising or self-updater.
- Use public APIs, registered event cleanup, theme CSS variables and vault-aware file operations.
- Test a real Base: filters, date selection, missing/invalid dates, single-day notes, overlapping bars and week/month boundaries.
- Test hover, double-click, keyboard opening, context actions, creation and deletion using disposable notes.
- Check a narrow panel, light/dark themes, a secondary window and mobile emulation. Identify any untested physical device behavior.
- Publish a tag matching the manifest exactly, with `main.js`, `manifest.json` and `styles.css` as release assets.
- Download published assets and compare them with the tested build.

The public release can be installed manually immediately. Listing in the Community plugins browser requires the separate directory review and publication process.
