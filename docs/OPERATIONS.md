# Operations and acceptance checks

## Components

`src/main/main.cjs` owns windows, monitor selection, mounted-drive polling, native folder selection and the IPC boundary. `store.cjs` owns dated meetings and serialized verified copies. `drives.cjs` owns mounted media discovery and the in-app file browser. The renderer uses plain HTML/CSS/ES modules; no runtime web server is involved in the Electron app.

The audience `Player` is authoritative. The operator sends commands, receives playback state four times per second and mirrors the frame in a muted preview. A meeting update retains the active media when its ID and URL are unchanged. The pure playlist scheduler inserts enabled sponsor slots around the race sequence. Only a full meeting change resets playback.

The built-in welcome screen is always available through Hold Banner, even if excluded from the automatic loop. A manually held banner does not time out. Next, Previous, Latest or clicking a playlist item resumes normal looping. Sponsor footer space reduces the fitted video area; it does not paint on top of the recorded frame.

## Before the first race day

These checks require the actual track PC, camera card and monitors. They are not claimed as completed by container-based tests.

1. Install the Windows artifact, connect two monitors in Extend mode and verify the selected output stays on the audience monitor after fullscreen. Test F to leave fullscreen and monitor disconnect / reconnect.
2. Import a recording from the real camera. Check sound, playback duration, aspect ratio and whether its codec decodes correctly. Exercise 1 / 2 / 3 / 4 speed shortcuts and seeking near the end of the file.
3. While a race is playing, insert the card again and import another clip. The previous clip must continue. Test a renamed duplicate: it should be skipped. Check the original card files are unchanged.
4. Safely eject and reinsert the card. Confirm the importer opens only when the mounted drive appears and does not copy without an explicit selection. Try manual Browse as a fallback.
5. Close and reopen the application. Confirm today’s folder and playlist reopen, previous days can be selected, and disabled media remain available.
6. Review sponsor mocks before enabling them. Test ads after two races, image durations, custom image / video ads and the optional footer. Confirm trap colors against ART-DIRECTION.md.
7. Test Pause, holding banner, Latest, Next and blackout from both focused windows. Confirm shortcuts do not fire while typing in an importer, editor or settings field.
8. Try a missing or unsupported clip and confirm the operator sees an error and the loop recovers. Test a card removal during import: no partially copied clip should appear in the loop. Keep the card until verification finishes.
9. Verify free disk space and a backup destination. Copy the complete race-day root to the backup after the meeting; keep camera originals until the backup is confirmed.

## Deliberate scope

This first version is a replay and signage utility. It does not ingest live cameras, resolve split camera files, concatenate recordings, edit finish-line results, generate standings, record streams or provide frame-accurate race adjudication. Additional metadata such as runner names or distances can be added later without changing the date-folder workflow.

The app writes a manifest using a staging file and rename. SHA-256 verifies copies before publishing them. This protects against incomplete imports but is not a substitute for backups or storage hardware durability. Interrupted imports may leave hidden `.part` files; they are never in the manifest or playlist and may be removed while the app is closed.
