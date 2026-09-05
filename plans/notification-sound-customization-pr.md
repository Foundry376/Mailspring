# Add notification sound volume and custom sounds

## Summary

- Add a 0–100 new-mail notification volume slider in General > Notifications.
- Add a native custom-sound picker for MP3, OGG, WAV, M4A, AAC, and FLAC files,
  with Play Test Sound and reset-to-default actions.
- Keep both settings scoped to new-mail notifications so sent-message and other UI
  sounds retain their existing behavior.
- Resolve custom files at playback time and fall back to the bundled sound when a
  selection is missing, unsupported, or cannot be played.
- Extend `SoundRegistry` with reusable per-play volume and source options, keeping
  the preference UI, sound selection, and audio playback concerns separate.
- Add regression coverage for the silent Windows toast behavior established by
  #2619, which ensures native toast audio does not bypass Mailspring's playback
  settings.

The work is organized as two focused commits in this PR: the first introduces the
volume control and reusable playback option, and the second adds custom sound
selection on top of that foundation.

## Testing

- Added registry coverage for muted, intermediate, full, invalid, and out-of-range
  volume values, custom sources, and decode-error fallback.
- Added resolver coverage for supported extensions, file URLs, missing files, and
  unsupported selections.
- Added preference UI coverage for slider persistence and choose, reset, and test
  actions.
- Added new-mail integration coverage showing that configured sound options apply
  only to notification playback.
- Added regression coverage for silent individual and summary Windows toast XML.
- `npm run lint:check`
- Targeted Electron specs: 29 passing
- `npm run build` (produced the macOS arm64 app and ZIP)

`npm run typecheck` reaches the full project and reports three existing errors
outside this change: the `marginType` option in `print-window.ts` and two `inert`
attribute errors in `sheet-container.tsx`. It reports no errors in files changed by
this PR.

## Feature requests and related material

- Volume support request: https://community.getmailspring.com/t/how-do-i-reduce-the-volume-of-the-sound-when-receiving-new-mail/1639/2
- Custom notification sound discussion: https://community.getmailspring.com/t/custom-notification-sound/530
- Existing bundled-file replacement workaround: https://community.getmailspring.com/t/custom-notification-sound/530/2
- Windows/system-sound discussion: https://community.getmailspring.com/t/custom-notification-sound/530/5
- Original GitHub feature request: https://github.com/Foundry376/Mailspring/issues/415
- Related Windows sound-routing prior art: https://github.com/Foundry376/Mailspring/pull/2619

Per-filter notification sounds remain out of scope for this change.
