# Isaszeg Park artwork

The supplied track photos establish the park identity, rural sand-track setting and sponsor names. Generated promotional scenes are illustrative concepts, not photographs of an actual recorded race. Do not use artwork as race evidence.

## Exact trap palette

| Trap | Background / jacket | Numeral |
| --- | --- | --- |
| 1 | Red | White |
| 2 | Blue | White |
| 3 | White | Black |
| 4 | Black | White |
| 5 | Yellow | Black |
| 6 | Black and white horizontal stripes | Red |

The owner corrected trap 6 to black-and-white stripes. This table is authoritative for future overlays, traps, jackets, banners and generated art. Approximate screen hex values live in `src/shared/traps.mjs`; the color names and stripe direction are authoritative. Race 03 is the third recording of the day and does not imply trap 3.

## Assets and prompts

Created with the built-in image generation tool from the attached track references. Optimized JPEGs are bundled under `assets/`. The holding screen animates its image very gently and adds a slow accent sweep; reduced-motion preferences disable both. The generated artwork is already at a 16:9 aspect ratio and is fitted without cropping.

- `park.jpg`: broadcast holding banner; the supplied finish-line photo guides the setting, and the park sign guides naming and the existing red / black / white identity. Cinematic side-on greyhound on the right, dark negative space left, warm rural sand-track light. Exact text: **ISASZEG PARK**, **GREYHOUND TRACK**, **RACE DAY**. Restrained scarlet graphic stripe. Final correction: change only the trap-3 racing jacket to **white fabric with a black 3**, retaining pose, track, typography and foreground stripes.
- `redmills.jpg`: premium warm-cream and scarlet sponsor concept, athletic greyhound at rest on the right, track and evening light. Exact copy: **Connolly’s**, **RED MILLS**, **RACE DAY PARTNER**, **MOCK AD · CONCEPT ONLY**. No prices, packaging, nutrition claims or invented contact details.
- `pedro.jpg`: sky-blue and navy sponsor concept with a friendly greyhound on the right, subtle white track curves. Exact copy: **PEDRO**, **SEE YOU AT THE TRACK**, **MOCK AD · CONCEPT ONLY**. No packaging, prices or product claims.

Both sponsor concepts are disabled by default. They are mockups for layout review, not approved sponsor campaigns. Replace them with approved artwork for production use.

## Future animation

Racecards use muted reverse footage with blur and dimming behind warm charcoal graphics. The last second slides the card left while restoring normal video brightness and focus, then compact transparent runner overlays enter from the left as forward playback starts. Forward race recordings retain their original framing and colour. Avoid flashing, intrusive particle overlays, overlays over the finish line, or decorative race jackets that violate the six-color mapping. Use high contrast and large text that can be read across the track.
