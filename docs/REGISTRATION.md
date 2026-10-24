# Race and dog registration

Open **Races & dogs** in the operator sidebar. Add races before importing their recordings, register dogs in the meeting's dog registry, and assign a dog to each occupied trap. **Save meeting** persists the whole race card. **Discard changes** restores the last saved registration. Drafts survive navigation and date changes while the app remains open; save them before closing.

**Open reference meeting** opens 4 October 2026 and seeds the scraped data only if that meeting has no saved registration. Existing registration is preserved. The reference contains 14 published races and 75 dogs/entries; the source skips race number 13. It includes non-runners, which are entries but did not race.

Race fields: meeting title, venue, race number/title, grade, distance, track type, breed and up to six trap assignments. Dog fields: name, breed, owner, trainer, standing country, origin, birth month, sex, coat code, sire, dam and I/M/W running preference. Weight, finish/status, split, final split, going, time, estimated time and remarks belong to each race entry. Results are optional. Non-runners, DNF and DQ cannot have finish times. Changing the dog in a trap clears the previous dog's weigh-in and results.

Desktop registration is stored under `registration` in each dated `meeting.json` and uses the existing serialized, atomic storage. It does not add recordings to the replay playlist. Import the matching recording with the race number shown on the card to associate it automatically. Registration and media imports preserve one another. Browser registration is stored in localStorage by meeting date; imported media still lasts only for the tab.

## Linked replays and audience racecards

Recordings and registered races with the same programme number connect automatically within that meeting, whichever is added first. Links are saved by race ID, so changing a registered race's number or title retains the correct card. Older manifests with only race numbers are supported. A removed or explicitly unlinked card is never silently replaced by a different race.

Race desk shows **Linked race … · Edit race** under connected recordings. Click it to open that race's registration directly. **No linked race · Link race** opens the recording editor, where **Linked race** lets you select a registered race or remove the link. The displayed replay title comes from the linked registration; the media title remains the fallback for unlinked recordings.

Each linked replay starts with a generated racecard, then plays the recording with the race name, programme number, meeting, venue, date, grade, distance, breed and track type in a header. A side panel retains all six trap positions, runner names and national flags, owners/trainers, running preferences, weights, and any recorded results, splits, going and remarks. Empty traps are labelled. The video fits beside these details without cropping the recording. Trap colours follow the track's existing mapping.

The default racecard duration is 10 seconds, adjustable from 5–60 seconds in **Settings → Playback & display**. Pause and blackout freeze its countdown; replay speed affects the video only. **Play video now** skips the card and preserves the pause state. Every new play, loop return, Latest, Previous or Next entry into the recording shows its card. Updating registration during a video refreshes its details without rewinding it. Unlinked recordings play directly with their recording title.

National flags are local SVG assets from [lipis/flag-icons](https://github.com/lipis/flag-icons), version 7.5.0, with its MIT license in `assets/flags/LICENSE`. Country pickers use country names with a flag preview; the registry, assigned dogs, racecards and replay panels use the same bundled flags. No network connection or emoji font support is required.

## Source and local media

- Source: https://grwhracing.eu/result/219, detailed results, captured 24 October 2026.
- Raw extraction: `local-assets/result-219.json` (local working asset, ignored by Git).
- Bundled normalized data: `src/shared/reference-219.mjs`. This is an offline snapshot; the app does not contact the source website.
- Unknown values stay empty. Birth dates retain month precision. Original dog/race URLs are retained as provenance.
- `Std.` is retained as the dog's standing country; it can differ from the owner's nationality. The source coat codes and I/M/W running preferences are retained.
- The first three filenames match the supplied `local-assets` MP4s. Browser preview can play these files directly. Desktop use requires importing them through the normal file chooser; personal video files are not bundled in installers.
- Only the three named reference videos are served from `local-assets` by the demo server. Other local assets remain unavailable over HTTP.

Run `npm run demo`, open the printed URL, and select **Races & dogs → Open reference meeting**. The app also supports `#registration` to open this view directly.

Validation covers reference integrity, race/trap uniqueness, dog references and breeds, result statuses, disk persistence, meeting isolation and registration preservation during media imports. On a Windows sandbox that rejects atomic renames in the system temp directory, set `TEMP` and `TMP` to a writable workspace temporary folder before running the tests.
