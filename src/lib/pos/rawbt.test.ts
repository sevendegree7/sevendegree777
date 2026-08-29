import { describe, expect, it } from "vitest";

import {
  CUT,
  FEED,
  FEED_AND_CUT,
  OPEN_DRAWER,
  rawbtIntentUrl,
  toBase64,
} from "./rawbt";

describe("the command bytes", () => {
  // these are the printer's language, not ours. a typo here is a drawer that
  // never opens or a blade that fires mid-receipt, and neither shows up in a
  // browser - so they are pinned against the ESC/POS spec rather than against
  // whatever the code happens to produce.
  it("kicks the drawer with ESC p 0 25 250", () => {
    expect(OPEN_DRAWER).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa]);
  });

  it("cuts with GS V 66 0, a partial cut", () => {
    // function B, and a partial cut on purpose: a full cut drops the slip
    expect(CUT).toEqual([0x1d, 0x56, 0x42, 0x00]);
  });

  it("feeds with ESC d 4 before it cuts, never after", () => {
    expect(FEED).toEqual([0x1b, 0x64, 0x04]);
    expect(FEED_AND_CUT).toEqual([...FEED, ...CUT]);
  });
});

describe("toBase64", () => {
  it("encodes raw bytes, not text", () => {
    // 0x1b is an escape character and 0xfa is not valid utf-8 on its own.
    // anything that treats these as a string mangles them before the printer
    // ever sees them, which is the whole failure mode this guards.
    expect(toBase64([0x1b, 0x70, 0x00, 0x19, 0xfa])).toBe("G3AAGfo=");
  });

  it("survives a payload the size of a real raster", () => {
    // a receipt sent as an image is tens of thousands of bytes. building the
    // string by spreading it into fromCharCode throws here; a loop does not.
    const big = Array.from({ length: 200_000 }, (_, i) => i & 0xff);
    expect(() => toBase64(big)).not.toThrow();
    expect(toBase64(big).length).toBeGreaterThan(200_000);
  });

  it("has nothing to encode for nothing", () => {
    expect(toBase64([])).toBe("");
  });
});

describe("rawbtIntentUrl", () => {
  it("builds the intent url RawBT answers to", () => {
    expect(rawbtIntentUrl(OPEN_DRAWER)).toBe(
      "intent:base64,G3AAGfo=#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;",
    );
  });

  it("names the package, so a tablet without RawBT is sent to install it", () => {
    // without this the browser has nothing to hand the link to and does
    // nothing at all, which looks exactly like a broken printer
    expect(rawbtIntentUrl(CUT)).toContain("package=ru.a402d.rawbtprinter");
  });
});
