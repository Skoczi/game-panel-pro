# WWW 0.7.6 — browser acceptance

Read-only local fixture, actual production UI assets, no game commands or database writes.

Verified in the browser:

- MR15 sample match: selecting R8 changes team totals to 5:3 and Skoczi row to
  6/3/2, ADR75.0, HS33.3%; selecting final R25 restores 16:9 and 18/10/6,
  ADR70.4, HS27.8%. These values are synthetic, not claims about a real match.
- Earlier round hides final WIN/LOSS and ELO delta; heading identifies cumulative
  statistics through that round. Full match restores final table and ELO.
- MR12: first half contains rounds1–12, second13–24. The overtime fixture
  has rounds25–30; selecting R27 loads its own cumulative data.
- Wingman remains MR8: first half1–8, four-player scoreboard.
- LIVE: R4 shows historical K/D/A3/1/2, ADR75.0; Back to LIVE restores the
  current completed-round data6/2/2, ADR85.7. No active-round data is requested.
- Missing-snapshot fixture: explicit Polish unavailable message, dashes instead
  of final totals. Profile links and roster remain available.
- Mobile390x844: no document overflow; selected R15 remains highlighted, the
  half scroll offset is retained during click-triggered refresh.
- Admin and full-test selectors both offer MR12/MR15 independently; new-match
  setting does not enable public queues. Backend authorization tested separately.
- A clean admin selector follows a changed server value after polling. An explicit
  unsaved choice persists during polling; successful save clears the override.
  Verified with the read-only admin fixture (server value15→12, unsaved15 retained,
  no-op fixture save returns to server12).
- Original centered SVG geometry and premium two-column timeline retained.

Source locale generation and syntax checks pass (`npm run locales`, `npm run check`).
Screenshots: round8-desktop.png, round15-mobile.png, admin-formats.png.

These are browser/UI checks. Native gameplay and real Steam acceptance are separate.
