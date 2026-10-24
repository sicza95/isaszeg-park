# Race and dog registration

Open **Races & dogs** in the operator sidebar. Add races before importing their recordings, register dogs in the meeting's dog registry, and assign a dog to each occupied trap. **Save meeting** persists the whole race card. **Discard changes** restores the last saved registration. Drafts survive navigation and date changes while the app remains open; save them before closing.

**Open reference meeting** opens 4 October 2026 and seeds the scraped data only if that meeting has no saved registration. Existing registration is preserved. The reference contains 14 published races and 75 dogs/entries; the source skips race number 13. It includes non-runners, which are entries but did not race.

Race fields: meeting title, venue, race number/title, grade, distance, track type, breed and up to six trap assignments. Dog fields: name, breed, owner, trainer, standing country, origin, birth month, sex, coat code, sire, dam and I/M/W running preference. Weight, finish/status, split, final split, going, time, estimated time and remarks belong to each race entry. Results are optional. Non-runners, DNF and DQ cannot have finish times. Changing the dog in a trap clears the previous dog's weigh-in and results.

Desktop registration is stored under `registration` in each dated `meeting.json` and uses the existing serialized, atomic storage. It does not add recordings to the replay playlist. Import the matching recording with the race number shown on the card to associate it automatically. Registration and media imports preserve one another. Browser registration is stored in localStorage by meeting date; imported media still lasts only for the tab.

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
