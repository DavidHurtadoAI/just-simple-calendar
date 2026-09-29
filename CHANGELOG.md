# Changelog

## 1.4.1

- Replace the `:has()` CSS selector with an explicit, lifecycle-managed container class to address the Obsidian community review warning. Linear Calendar keeps its full-height layout, and switching views restores their normal padding.

## 1.4.0

- Drag cards to another day on desktop in all three views. Update the selected frontmatter dates together, preserving multi-day duration, datetime time/offset, other property values, and note content. Read-only or invalid date ranges cannot be moved, and concurrent date edits cancel the move.
- Resize a card from its right edge to change only its inclusive end date. If the note has no end date, create it using the view's configured end property. Hide resize handles when no end property is configured; keep the start date fixed and reject ends before it.
- Render wikilinks, aliases, lists, and Bases link values in custom titles. Internal links resolve relative to the source note and support keyboard activation. Card actions still target the original note. Thanks to [u/HowlOfTheSun](https://www.reddit.com/user/HowlOfTheSun/) for the drag request and title-link report.
- Add a per-view **Double-click action** setting: **Open note**, **Open in new tab**, or **Open to the right**. The default remains the current pane; the right-hand pane is reused.
- Preserve Infinite Calendar's scroll position and native drag source during dragging. No runtime dependencies were added.

## 1.3.0

- Add **Color property (optional)** to Simple Calendar, Infinite Calendar, and Linear Calendar.
- Accept the eight native palette names (red, orange, yellow, green, cyan, blue, purple, pink) or three/six-digit hex colors. Names ignore case and surrounding whitespace.
- Apply a colored border and soft fill to single-day notes and every segment of multi-day notes, preserving theme text colors and native note actions.
- Retain the default appearance when no property is selected or the value is missing, blank, invalid, or not text. No runtime dependencies were added.
- Document setup, examples, and the need to quote hex values in YAML.

## 1.2.0

- Add **Linear Calendar**, a third native Bases view showing one month per row with aligned weekdays and previous-year, Today, and next-year navigation.
- Outline each month, keep headings and month labels visible while scrolling, and use the full available height without a footer.
- Display multi-day notes as continuous monthly bars with continuation markers, and single-day notes as colored blocks with titles available on hover and to screen readers.
- Reuse date and title properties, previews, note creation, and opening/deletion actions, with no runtime dependencies.
- Include a real Linear Calendar screenshot in the README. Thanks to [u/Quirky_Departure_409](https://www.reddit.com/user/Quirky_Departure_409/) for the suggestion and [Nick Milo's Linear Calendar video](https://www.youtube.com/watch?v=SQHYj7x-t3A) for the inspiration.

## 1.1.0

- Add **Infinite Calendar**, a second Bases view with continuous weeks, fixed weekday headings, month/year markers, and a Today button. Thanks to [u/DudPug](https://www.reddit.com/user/DudPug/) for the suggestion.
- Keep a bounded window of weeks and preserve the visible week and scroll position when loading more weeks, updating events, or resizing the panel.
- Add previous-year and next-year buttons to **Simple Calendar**, keeping the selected month. Thanks to [u/anchovybird](https://www.reddit.com/user/anchovybird/) for the suggestion.
- Add an optional **Title property** to both views, with filename fallback for missing or blank values. Thanks to [u/Nyrazoth](https://www.reddit.com/user/Nyrazoth/) for the suggestion.
- Document all three improvements with real screenshots. Both views share previews, multi-day bars, and note actions, without runtime package dependencies.

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
