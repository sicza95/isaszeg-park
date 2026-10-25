# Validation record — 2026-10-25

Completed in the development workspace:

- `npm test`: 56 passing tests covering storage, duplicate handling, import failures, numbering, serialization, dates, registration, race links, offline flag assets, playlist scheduling, keyboard guards, reverse playback and racecard/player transport decisions.
- `npm run check`: source and test JavaScript syntax checks pass; all three bundled artworks are present.
- `git diff --check`: passes.
- The generated holding image was visually reviewed and corrected to a white trap-3 jacket with a black 3. Both sponsor concepts were visually reviewed. Trap 6 is documented as black-and-white horizontal stripes with a red 6.
- `npm run test:desktop`: passes on Windows with an isolated profile, real IPC and media decoding. Covers imports, duplicates, playback controls, removal, retained playback position, source preservation, disk persistence and the empty-loop fallback.
- `npm run test:layout`: passes on Windows with an isolated profile and long media lists. Covers the shared toolbar across all five views, date switching, display toggling, black media backgrounds, the borderless preview, following playing videos/sponsors/banners, manual list browsing, and layouts from 375px to 1480px. Screenshots are saved under `test-results/studio-*.png`.
- `npm run test:broadcast`: passes on Windows with external HTTP requests blocked. Covers automatic race linking, timed racecards, pause/skip behavior, audience/preview synchronization, loaded offline SVGs, the race editor shortcut, live title updates without rewinding, country picker previews, manual relinking and saved links after reload. The reference programme is checked for runner/header overflow in both card and video layouts. Screenshots are saved under `test-results/` for visual inspection.

The restricted execution sandbox blocks Electron startup and system-temp atomic renames on this Windows host. The checks were run with permission to launch the isolated test applications and rename temporary manifests. Physical camera cards, mounted-drive discovery and dual physical monitors still require the track-side acceptance checks in OPERATIONS.md. All three desktop smoke tests are configured to run under Xvfb in Linux CI.

The repository includes a Windows / macOS / Linux build workflow and a real desktop playback smoke test. Consult the GitHub Actions result for the specific commit before using its packaged application. Automated checks do not replace the physical-machine acceptance checklist in OPERATIONS.md.
