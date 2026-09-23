# Changelog

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
