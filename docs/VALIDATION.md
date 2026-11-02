# Validation

## 1.6.0 - Agenda and optional schedules - 2026-11-02

Verified in the canonical `@Nexus-dev` vault using Windows desktop Obsidian 1.15.0.

- `npm run check` passes official lint with zero warnings, strict TypeScript, 36 unit tests, the production build and release audit. The complete JavaScript remains below 40 KiB with zero runtime package dependencies or network calls.
- The central installer installs the build and `verify just-simple-calendar` confirms matching artifacts, keeping previous files in `.dev-backups/`.
- `node scripts/qa-scheduling.mjs` passes 16 live scenarios through Obsidian's CLI and actual Bases/DOM/Modal APIs. It guards the exact canonical vault path, creates additive Spanish QA fixtures only under `Pruebas/Just Simple Calendar/`, restores the fixture note bytes and returns to the original tab/window bounds.
- Coverage includes day/week navigation and native date input, full titles, recurrence end/exclusions, deduplication and distinct-note totals; absence of advanced actions when unconfigured; cancellation, empty-row validation and preservation of the main date/time, unrelated properties and Markdown body; refusal of concurrent schedule/mapping edits; retention of unrelated concurrent body changes; mapping-collision and malformed-value explanations; projection across all four real Base views; narrow-pane layout and action sizes; actual DOM drag/drop in the monthly view; and closing an unsaved date editor with its Base.
- Native screenshots at 360 and 800 CSS pixels were inspected. The 360 px agenda has no horizontal overflow and retains full titles, times, explicit creation and three-dot actions. The optional date editor uses native date inputs and explicit Save/Cancel.
- The maintainer capture script only uses the fictional fixtures from that QA run and restores the previous tab. Screenshots in the README are real application captures.
- Release screenshots also show the actual native Configure view panel with Optional scheduling expanded, the original note's Properties editor beside the calendar, and the Repeat options/additional-date dialogs. Their dates were selected and saved through those dialogs: the weekly meeting appears on November 2, 9 and 23 (skipping November 16, ending November 23), and the course appears on November 4, 12 and 20. The projected dates were asserted against the real rendered calendar before capturing it.
- `scripts/capture-release.mjs` guards the canonical vault, creates additive fictional fixtures under `Pruebas/Just Simple Calendar/`, and restores the original panes, sidebar visibility, window bounds/maximization and background throttling in its cleanup step. It captures actual application pixels, without compositing or annotations.

These are automated in-app checks with DOM events plus visual inspection of desktop captures. No physical phone/tablet, touch drag, exhaustive theme matrix or large-vault benchmark is claimed. Advanced lists are deliberately bounded to 128 values and projected repeats to 500 occurrences.

## 1.4.1 - Linear Calendar container styling

Verified in the Windows development vault on September 29, 2026:

- Thirty-six live assertions verify repeated switches between Linear Calendar, Simple Calendar, Infinite Calendar, and the native table view. The linear view keeps zero bottom padding, a hidden footer, and a working scroll viewport; other views retain their theme padding. Closing the view removes the container class.
- All 22 unit tests, ESLint, strict TypeScript checking, production build, and release audit pass. No `:has()` selectors remain in the plugin stylesheet, and no runtime dependencies were added.

## 1.4.0 - Moving, resizing, title links, and double-click actions

Verified in the Windows development vault on September 28, 2026:

- Twenty-two unit tests pass. New date-shifting and resizing cases cover leap days, month/year boundaries, DST transitions in four time zones, continuation offsets, unchanged datetime time/offset suffixes, invalid ranges, creating missing end dates, and shrinking a range to one day.
- `tests/obsidian-interactions.js` passes 137 assertions through real Bases views with disposable notes. It covers all three calendar types, drag feedback, single-day and multi-day moves, cancellation and same-day drops, readonly dates, custom titles/aliases/lists/formula links, native previews, colors, all three double-click actions, right-pane reuse, and saved settings after reopening.
- `tests/obsidian-native-input.js` passes 27 assertions using Chromium mouse input and native drag data in the actual app. Dragging a linked title moves the card, both date properties update, cancellation preserves the file, and Enter on the title follows its link in all three views.
- `tests/obsidian-resize.js` passes 77 assertions using native Chromium input across all three views. A configured end property enables resizing even when the note has no end value; an unset, read-only, or shared start/end property hides the handle. Tests cover range previews without writes, creating the selected end property, extending across rows/months, shrinking to one day, rejecting an end before the start, cancellation, timestamp preservation, and concurrent edits. Only the final segment has a handle, and the start and note body remain unchanged.
- `tests/obsidian-edge-cases.js` passes seven assertions covering duplicate filenames in different folders, wikilink headings and display aliases, a date edited during a drag, atomic cancellation without partial writes, and the default double-click action. The expected conflict logs a move-cancelled error and displays a notice.
- During a drag, Infinite Calendar retains its source DOM node when data changes or the viewport scrolls. Finishing or cancelling restores the same visible week and offset before bounded-window scrolling resumes.
- ESLint, strict TypeScript checking, production build, and dependency/bundle audit pass. The bundle remains under 25 KiB with no runtime package dependencies.

The interaction scripts run through Obsidian CLI `eval` in a development vault. They create and remove their own unique fixture folders; they are not Node unit tests. Touch dragging and physical mobile testing are not included.

## 1.3.0 - Event colors

Verified on Windows in the development vault on September 26, 2026:

- Fifteen automated calendar tests cover the eight palette names, normalization, three/six-digit hex values, and rejection of empty, non-text, malformed, and unsupported CSS values, in addition to existing date and layout coverage.
- 260 live assertions exercise all three views with eight palette colors, both hex lengths, mixed case/whitespace, and seven fallback cases. Every continuation segment retains the note's color.
- Computed borders, soft fills, and normal theme text colors match in light and dark mode. Linear single-day notes remain text-free; native previews and opening to the right still target the original note.
- Changing or clearing the selected property restores default styling, and Infinite Calendar retains its scroll anchor during the change. Editing frontmatter updates the color without reopening the view; the selected property persists in the Base.
- The local demos were inspected in the running application. During rapid temporary preview cleanup, Obsidian logged a native editor `onUnloadFile` RangeError; the rendering and note-opening assertions passed. Physical-device testing remains separate.

Physical mobile testing and an exhaustive community-theme matrix remain pending.

## 1.2.0 - Linear Calendar

Verified in the Windows development vault on September 23, 2026, using Obsidian 1.14.2:

- Twelve automated tests pass, including leap-century rules, complete years, 31-day lane collisions, and bars crossing months and years.
- Live annual-view checks verify all 365 weekday positions for both Monday and Sunday starts, leap February, year navigation, distinct-note totals, and cross-month continuation.
- At 430 px, horizontal scrolling works; month labels and weekday headings remain fixed. Data refresh preserves horizontal scroll position.
- Native hover dispatch, custom titles, context menus, opening to the right, double-click opening, and creation with a prefilled date were exercised. The disposable note was removed afterward.
- The existing 54-check Infinite Calendar suite passes, including variable-height rows and preservation of the visible week during scrolling, resizing, and data updates. The suite waits for Bases to index its temporary fixtures before measuring row height.
- Lint, strict type checking, build, and dependency/bundle audit pass. No runtime dependencies were added.
- All twelve single-day demo events render without visible text, with the same fill as multi-day bars and full tooltip/accessibility titles. Month outlines match their first and last day; the annual viewport reaches the bottom of its container without a footer.

Physical mobile testing and large-vault benchmarks remain pending.

## 1.1.0

Verified in the Windows development vault before release:

- Ten automated calendar tests, including continuous week windows across leap days, daylight-saving transitions, and year boundaries.
- Year buttons preserve the month, month navigation crosses year boundaries, and Today returns to the current month. The toolbar fits a 320 px panel.
- Fifteen live checks cover custom titles, missing/blank values, numbers and booleans, safe text rendering, weekly segments, accessible labels, and opening the original note.
- Fifty-four live Infinite Calendar checks cover bounded rendering, continuous dates, scrolling in both directions, variable-height weeks, adding/removing events above the viewport, resizing, week starts, custom titles, and note actions.
- Native mouse-wheel input moved content exactly 100 px in both directions while the rendered week window shifted, without an extra scroll jump. Keyboard focus survives rerendering, and the monthly view retains its existing navigation.
- The release workflow repeats a clean installation, lint, type checking, tests, build and audit, then attests the three installable assets and verifies their downloaded copies.

Physical mobile-device testing remains pending. These checks do not claim an exhaustive theme matrix or large-vault benchmark.

## 1.0.0

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
