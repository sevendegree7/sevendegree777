const NAVY = "#0e1b2c";
const CREAM = "#fbf8ef";

// #abc and #aabbcc both happen, and admin types these by hand
function parseHex(value: string): [number, number, number] | null {
  const hex = value.trim().replace(/^#/, "");

  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((character) => character + character)
          .join("")
      : hex;

  if (!/^[0-9a-f]{6}$/i.test(full)) {
    return null;
  }

  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function channel(value: number): number {
  const ratio = value / 255;

  return ratio <= 0.04045
    ? ratio / 12.92
    : Math.pow((ratio + 0.055) / 1.055, 2.4);
}

function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

// which of the two brand inks to put on a cuisine colour.
//
// the seven cuisine colours are not equally dark - cream reads well on madrid
// sangria and disappears on riyadh saffron - and admin can type any colour it
// likes into a category, so this is measured rather than hardcoded per cuisine.
export function readableInkOn(background: string | null): string {
  if (!background) {
    return CREAM;
  }

  const rgb = parseHex(background);

  if (!rgb) {
    return CREAM;
  }

  // 0.35 rather than the usual 0.5: saffron and the lighter cuisine chips
  // need navy ink, and cream on a mid tone washes out at till sizes
  return luminance(rgb) > 0.35 ? NAVY : CREAM;
}
