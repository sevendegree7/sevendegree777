// handing raw ESC/POS to the printer, through RawBT.
//
// the till prints through android's print framework, which takes a picture of
// the page and sends that. a picture cannot say "cut here" or "open the
// drawer" - those are commands, and a picture has nowhere to put them. RawBT
// would normally send the cut itself, from a setting in its printer profile;
// the build on the truck's tablet has no such setting, and neither has it one
// for the drawer.
//
// RawBT accepts a job a second way: navigate to an `intent:` url carrying
// base64 ESC/POS and it hands those bytes to the printer unaltered. that is
// the only channel we have for a command. it is not stopped by the rule that
// blocks the till from reaching http://192.168.8.248 directly, because nothing
// here is an http request - it is a link handed to an app on the same device.
//
// the format is documented at rawbt.ru/start.html, and is the same url
// mike42/escpos-php builds in its RawbtPrintConnector.
//
// two things this cannot do. it is android + chrome only, so on a desktop the
// link does nothing. and chrome will not follow a custom scheme without a real
// user gesture, which is why these are anchors to be tapped rather than
// something fired from code after the fact.

// the android package. naming it means a tablet without RawBT installed opens
// the play store page instead of failing silently.
const RAWBT_PACKAGE = "ru.a402d.rawbtprinter";

const ESC = 0x1b;
const GS = 0x1d;

// ESC p 0 25 250 - pulse the drawer pin for ~50ms. the kick every till sends,
// and the same one behind the `Cash Open` button on the printer's own web page,
// which is how we know this printer answers it.
export const OPEN_DRAWER: readonly number[] = [ESC, 0x70, 0x00, 0x19, 0xfa];

// ESC d 4 - feed four lines. the blade sits downstream of the print head, so
// without this a cut lands above the last thing printed.
export const FEED: readonly number[] = [ESC, 0x64, 0x04];

// GS V 66 0 - partial cut. leaves a tab of paper holding the slip on, so it
// does not drop on the floor of the truck between the customer and the counter.
export const CUT: readonly number[] = [GS, 0x56, 0x42, 0x00];

// feed clear of the blade, then cut. the pair that is wanted in practice - a
// bare CUT slices through whatever was printed last.
export const FEED_AND_CUT: readonly number[] = [...FEED, ...CUT];

// base64 of raw bytes, built a character at a time rather than by spreading the
// array into fromCharCode: a receipt sent as a raster is tens of thousands of
// bytes and that spread is an argument list long enough to overflow the stack.
export function toBase64(bytes: readonly number[]): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte & 0xff);
  }

  return btoa(binary);
}

export function rawbtIntentUrl(bytes: readonly number[]): string {
  return `intent:base64,${toBase64(bytes)}#Intent;scheme=rawbt;package=${RAWBT_PACKAGE};end;`;
}
