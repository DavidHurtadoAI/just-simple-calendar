# Validation

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
