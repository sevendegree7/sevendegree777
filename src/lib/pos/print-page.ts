// making the printed page the same size as the paper.
//
// a receipt roll is a fixed width and an endless length, which is not a shape
// css can express: `@page { size: 80mm auto }` is not valid grammar and chrome
// drops the whole declaration, and a single length like `size: 80mm` means an
// 80mm square. picking a tall fixed page instead (80mm x 297mm) prints one
// receipt per 30cm of roll.
//
// so the height is measured off the rendered receipt just before printing and
// written into an `@page` rule. the page then ends just past where the receipt
// ends - see `CUTTER_GAP_MM` for what "just past" is buying - on a thermal roll
// and on a desktop printer alike.

export const PAGE_STYLE_ID = "receipt-page-size";

// the class that forces the on-screen receipt to its printed width for one
// synchronous measurement. see `applyReceiptPageSize`.
export const MEASURING_CLASS = "measuring-receipt";

// a css px is defined as 1/96 inch, so this is an exact conversion rather than
// an approximation of whatever the screen happens to be
export function pxToMm(px: number): number {
  return (px * 25.4) / 96;
}

// reads "80mm" off a custom property. the roll width lives in globals.css so
// there is one number to change when the truck buys a 58mm printer.
export function parseMm(value: string): number | null {
  const match = /^\s*(-?[\d.]+)\s*mm\s*$/.exec(value);
  if (!match) return null;

  const mm = Number(match[1]);
  return Number.isFinite(mm) && mm > 0 ? mm : null;
}

// a couple of millimetres so a rounded-down measurement cannot clip the last
// line
const SLACK_MM = 4;

// clearing the cutter.
//
// the blade sits downstream of the print head, so the paper under the blade has
// already passed the head. cut the instant the last line is printed and the cut
// lands a blade's distance *before* the end of the receipt - the bottom of it
// stays inside the printer and comes out as a stub on top of the next sale.
//
// print-service apps normally solve this with a "feed lines before cut"
// setting. RawBT on the truck's tablet has no such field, so the feed is bought
// in the page instead: length the printer has to wind through before the job
// ends, which walks the end of the receipt out past the blade.
//
// that length cannot be blank. RawBT trims trailing white off a page before
// sending it, so empty tail is thrown away and the feed goes with it - which is
// why raising this number had no effect at all until the tail was given
// something to print. the ink is `.receipt-cut-tail` in globals.css and the
// height is its `--receipt-cut-tail`, read back here so one number sizes both
// the block and the page that has to hold it.
//
// only used when that property cannot be read. keep it equal to the css.
const FALLBACK_TAIL_MM = 35;

export const TAIL_PROPERTY = "--receipt-cut-tail";

// a receipt shorter than this is a measurement that went wrong, not a real
// sale. the ticket number block alone is taller.
const MIN_HEIGHT_MM = 40;

// ~1.5m of roll. past this something has measured the whole page instead of one
// copy, and honouring it would feed the entire roll onto the floor.
const MAX_HEIGHT_MM = 1500;

export function pageHeightMm(
  tallestPx: number,
  tailMm: number | null = FALLBACK_TAIL_MM,
): number | null {
  if (!Number.isFinite(tallestPx) || tallestPx <= 0) return null;

  // a tail that cannot be read is not a reason to print a receipt the printer
  // will cut in half. fall back rather than propagate the NaN.
  const tail =
    tailMm !== null && Number.isFinite(tailMm) && tailMm >= 0
      ? tailMm
      : FALLBACK_TAIL_MM;

  const height = Math.ceil(pxToMm(tallestPx)) + SLACK_MM + tail;
  if (height > MAX_HEIGHT_MM) return null;

  return Math.max(height, MIN_HEIGHT_MM);
}

export function receiptPageRule(
  widthMm: number | null,
  tallestPx: number,
  tailMm: number | null = FALLBACK_TAIL_MM,
): string {
  const height = pageHeightMm(tallestPx, tailMm);

  // no measurement worth trusting. drop the margins anyway - that alone is the
  // difference between a receipt in the middle of an a4 sheet and one at the
  // top left of it - but let the browser choose the paper rather than commit to
  // a size that could cut the total off.
  if (height === null || widthMm === null) {
    return "@page { margin: 0; }";
  }

  return `@page { size: ${widthMm}mm ${height}mm; margin: 0; }`;
}

// call this immediately before window.print().
//
// the receipt has to be measured at the width it prints at, not the width the
// modal shows it at: the modal is wider, the lines wrap less, and a page sized
// off that is short enough to push the total onto a second page. the class goes
// on, the layout is read back, and the class comes off inside one task, so the
// browser has no opportunity to paint the narrow version - there is no flicker.
export function applyReceiptPageSize(doc: Document): string {
  const root = doc.documentElement;
  const style = getComputedStyle(root);
  const widthMm = parseMm(style.getPropertyValue("--receipt-roll-width"));
  // the same property `.receipt-cut-tail` is sized from, so the page is always
  // long enough to hold the tail block rather than pushing it onto a second one
  const tailMm = parseMm(style.getPropertyValue(TAIL_PROPERTY));

  let tallestPx = 0;
  root.classList.add(MEASURING_CLASS);
  try {
    // every copy shares one page size, so the tallest wins. the prep copy
    // carries no prices and runs shorter, which costs a little blank roll after
    // it - the alternative is a printed total sliced in half, which costs a
    // customer.
    tallestPx = Array.from(
      doc.querySelectorAll<HTMLElement>(".receipt-paper"),
    ).reduce(
      (max, paper) => Math.max(max, paper.getBoundingClientRect().height),
      0,
    );
  } finally {
    // never leave this on. if measuring throws, the class survives the failure
    // and every receipt from then on is rendered at 80mm in the middle of the
    // tablet - the till would have to be reloaded to get its layout back.
    root.classList.remove(MEASURING_CLASS);
  }

  return writePageRule(doc, receiptPageRule(widthMm, tallestPx, tailMm));
}

// an admin report is the opposite problem to a receipt. it goes on whatever
// sheet is in the office printer rather than a roll of known width, so the size
// is left to the browser - and it needs a margin, because the global rule
// that drops margins for the roll would otherwise push the first column into
// the strip most printers physically cannot reach.
export const REPORT_PAGE_RULE = "@page { size: auto; margin: 12mm; }";

export function applyReportPageSize(doc: Document): string {
  return writePageRule(doc, REPORT_PAGE_RULE);
}

// one reused style element rather than one per print, so re-printing a ticket
// does not stack dead @page rules in the head - and so a report printed after
// a receipt does not inherit the roll's measured height.
function writePageRule(doc: Document, rule: string): string {
  let style = doc.getElementById(PAGE_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement("style");
    style.id = PAGE_STYLE_ID;
    doc.head.appendChild(style);
  }
  style.textContent = rule;

  return rule;
}
