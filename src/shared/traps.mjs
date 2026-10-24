// Track colors supplied by the Isaszeg Park operator. These are trap numbers,
// never race numbers. Keep these mappings in all future artwork and overlays.
export const TRAPS = Object.freeze([
  Object.freeze({ number: 1, background: '#d71920', foreground: '#ffffff', pattern: 'solid', description: 'Red, white numeral' }),
  Object.freeze({ number: 2, background: '#1768c4', foreground: '#ffffff', pattern: 'solid', description: 'Blue, white numeral' }),
  Object.freeze({ number: 3, background: '#ffffff', foreground: '#111111', pattern: 'solid', description: 'White, black numeral' }),
  Object.freeze({ number: 4, background: '#111111', foreground: '#ffffff', pattern: 'solid', description: 'Black, white numeral' }),
  Object.freeze({ number: 5, background: '#f5d52c', foreground: '#111111', pattern: 'solid', description: 'Yellow, black numeral' }),
  Object.freeze({ number: 6, background: '#ffffff', stripe: '#111111', foreground: '#d71920', pattern: 'horizontal-stripes', description: 'Black and white horizontal stripes, red numeral' })
]);
