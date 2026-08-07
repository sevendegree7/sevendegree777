import { describe, expect, it } from "vitest";

import {
  pageHeightMm,
  parseMm,
  pxToMm,
  receiptPageRule,
  REPORT_PAGE_RULE,
} from "./print-page";

describe("pxToMm", () => {
  it("uses the css definition of a px, not the screen's", () => {
    // 96px is one inch by definition
    expect(pxToMm(96)).toBeCloseTo(25.4, 10);
    expect(pxToMm(0)).toBe(0);
  });
});

describe("parseMm", () => {
  it("reads the roll width off the custom property", () => {
    // getPropertyValue keeps the author's spacing, so both of these turn up
    expect(parseMm("80mm")).toBe(80);
    expect(parseMm(" 58mm ")).toBe(58);
  });

  it("refuses anything that is not a positive length in mm", () => {
    // a var() that never resolved, or a value in the wrong unit, must not be
    // read as millimetres - printing at "0mm" wide produces nothing at all
    expect(parseMm("")).toBeNull();
    expect(parseMm("80px")).toBeNull();
    expect(parseMm("0mm")).toBeNull();
    expect(parseMm("-80mm")).toBeNull();
    expect(parseMm("auto")).toBeNull();
  });
});

describe("pageHeightMm", () => {
  it("rounds up and adds slack, so the last line is never clipped", () => {
    // 400px = 105.83mm -> 106 rounded up, + 4mm slack
    expect(pageHeightMm(400)).toBe(110);
  });

  it("never returns a page shorter than a ticket number block", () => {
    expect(pageHeightMm(1)).toBe(40);
  });

  it("rejects a measurement that would feed the whole roll", () => {
    // measuring the scrolling modal instead of one copy
    expect(pageHeightMm(100_000)).toBeNull();
  });

  it("rejects a missing measurement rather than sizing a page to nothing", () => {
    expect(pageHeightMm(0)).toBeNull();
    expect(pageHeightMm(-10)).toBeNull();
    expect(pageHeightMm(Number.NaN)).toBeNull();
    expect(pageHeightMm(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("receiptPageRule", () => {
  it("sizes the page to the roll's width and the receipt's length", () => {
    expect(receiptPageRule(80, 400)).toBe(
      "@page { size: 80mm 110mm; margin: 0; }",
    );
  });

  it("still drops the margins when it cannot measure", () => {
    // the receipt lands top-left on whatever paper the browser picks, instead
    // of centred on an a4 sheet. losing the size is survivable; keeping the
    // default 10mm margins on a 80mm roll is not.
    expect(receiptPageRule(80, 0)).toBe("@page { margin: 0; }");
    expect(receiptPageRule(null, 400)).toBe("@page { margin: 0; }");
  });
});

describe("REPORT_PAGE_RULE", () => {
  it("keeps a margin, unlike the roll", () => {
    // the receipt rule drops margins so the paper starts at the top left of a
    // roll. a report on an office printer inheriting that would put its first
    // column inside the strip the hardware cannot reach.
    expect(REPORT_PAGE_RULE).toContain("margin: 12mm");
    expect(REPORT_PAGE_RULE).not.toMatch(/margin:\s*0/);
  });

  it("lets the browser choose the sheet", () => {
    // an office printer has a4 or letter in it and we do not know which
    expect(REPORT_PAGE_RULE).toContain("size: auto");
  });
});
