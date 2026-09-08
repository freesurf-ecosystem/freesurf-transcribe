# Transcriber — Localization Map

Which user-facing text to localize, where it lives, and what can safely be left as icons/symbols to keep
the localization lift small.

## Guiding principle
Prefer **icons, symbols, and numbers** over text wherever possible (most primary controls already use
icons). Localize only the handful of meaningful strings below. Dates/times already localize automatically
via `toLocaleDateString` / `toLocaleTimeString`.

## Where the strings live
The app is a native-stack of screens: **Transcriber** (the hub), **Auth**, **About**. Nearly all runtime UI
is in `mobile/screens/TranscriberScreen.tsx`; the hamburger menu is `mobile/components/FloatingHamburger.tsx`.

### 1. Bottom action bar (TranscriberScreen)
- `Import` (button)
- `Record` (button) ↔ `Stop` (button while recording)
- `Transcribing…` (processing state)
- (icons: mic / stop-square / folder)

### 2. Empty state
- `Tap record to start transcribing, or import an audio file.`

### 3. Live result / history
- `Untitled transcript` (default card/result title)
- `Speaker {n}` (speaker label, built from `Speaker ${idx+1}` — localize the word "Speaker")
- `Tap to expand...` (appears on collapsed cards)
- `No text returned` (fallback when a result has no text)

### 4. Card "…" menu (per transcript)
- Share / Share audio (icon-driven) · Rename · Delete
- (icons: share, audio-lines, pencil, trash)

### 5. Dialogs / alerts
- `Permission needed`
- `Please tap the record button one more time.`
- `Error`
- `Could not start recording.`
- `Could not stop recording.`
- `Transcription failed.`
- `Could not import file.`
- `Could not play audio.`
- `No audio`
- `Original recording not available.`
- Delete confirm: `Delete this transcription?` / `Cancel` / `Delete`
- (the OS share sheet itself is localized by the system)

### 6. Hamburger menu
- `About Us`, `Support`, `Privacy`, `Terms`
- (theme light/dark toggle is icon/symbol based — no text)

## Lower-priority screens (separate pass)
- `AuthScreen.tsx`, `AboutScreen.tsx`, and the unused `Onboarding.tsx` contain their own copy; localize
  only if we ship those flows. For an anonymous-first tool the Auth screen may be less important.

## Recommended implementation approach
1. Extract all strings above into a single `strings` map (e.g. `mobile/src/i18n/en.ts`) keyed by
   locale, so adding a language is additive, not scattered edits.
2. Localize in priority order: bottom bar + empty state → history/result titles → menus/dialogs.
3. Let the device locale pick the language; fall back to English.
4. Keep numbers (durations `m:ss`, dates) as-is — they read fine cross-locale or are already localized.

## Estimated lift
Small — roughly 25 short strings across one screen + the hamburger menu, many already icon-driven.
