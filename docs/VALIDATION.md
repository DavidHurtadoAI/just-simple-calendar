# Validation for 1.0.0

Checked on September 21, 2026, in Obsidian 1.14.2 on Windows. This is an engineering validation record, not an Obsidian Community directory approval.

## Automated checks

- Clean `npm ci` from the committed lockfile; dependency audit reported zero known vulnerabilities.
- Official Obsidian ESLint recommended rules, with zero warnings, and strict TypeScript checking.
- Nine calendar tests cover inclusive ranges, invalid dates, leap years, timezone offsets, whole weeks, month/year boundaries, continuation segments, and overlapping lanes.
- Production bundle audit checks version alignment, the MIT license, screenshot paths, the absence of runtime dependencies and network calls, and a 25 KiB JavaScript budget.
- GitHub Actions repeats installation, linting, type checking, tests, compilation, and the release audit on Node.js 22.

## Actual Obsidian checks

The development build was installed into a real vault and exercised through the actual Bases view. During development, the interaction suite passed 22 assertions; the range/layout suite passed 34; the bar interaction suite passed 15.

Verified behavior includes selecting and clearing date properties, persistence, filtered results, file dates, missing and reversed dates, navigation, both week starts, inclusive ranges, continuation across weeks/months, distinct-note totals, and collision-free bars in a 360 px panel.

Note actions were exercised: native hover preview, double-click and keyboard opening, new-tab/context actions, opening to the right and reusing that pane. Disposable notes were created with the selected date prefilled and a blank body, then deleted through the calendar. Read-only file dates correctly blocked creation. Opening a note did not rewrite its contents.

For the release build, the English example Base displayed all 15 notes. The date selectors, both context menus, and the split-pane view were inspected and captured in the running app. The calendar was also inspected in light and dark modes, and a note was opened with Enter from a focused calendar entry in a secondary window.

## Limits of this validation

- No physical Android or iOS device was tested. Desktop mobile emulation was attempted, but the CLI evaluation command became unavailable in that mode, so no successful mobile interaction test is claimed.
- The plugin uses public, mobile-compatible APIs and has no Node.js, Electron, or desktop-only runtime imports. This supports mobile compatibility but does not replace device testing.
- The minimum version, 1.10.2, is the Bases custom-view API floor. Runtime verification used 1.14.2, not a separate installation of the minimum version.
- No large-vault performance benchmark or exhaustive third-party theme matrix is claimed.

The five README screenshots are actual application captures using the Border theme. Only the application content region was captured; calendar contents and menus were not composited or recreated.
