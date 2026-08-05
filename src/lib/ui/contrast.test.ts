import { describe, expect, it } from "vitest";

import { readableInkOn } from "./contrast";

describe("readableInkOn", () => {
  it("puts cream on dark cuisine colours", () => {
    expect(readableInkOn("#0E1B2C")).toBe("#fbf8ef");
    expect(readableInkOn("#6C0F2A")).toBe("#fbf8ef");
    expect(readableInkOn("#7C2D26")).toBe("#fbf8ef");
  });

  it("puts navy on light cuisine colours", () => {
    expect(readableInkOn("#D4A24A")).toBe("#0e1b2c");
    expect(readableInkOn("#fbf8ef")).toBe("#0e1b2c");
  });

  it("puts cream on saturated cuisine colours", () => {
    expect(readableInkOn("#E04F3E")).toBe("#fbf8ef");
    expect(readableInkOn("#D27B8C")).toBe("#fbf8ef");
    expect(readableInkOn("#7BA05B")).toBe("#fbf8ef");
  });

  it("falls back to cream when the colour is missing or nonsense", () => {
    expect(readableInkOn(null)).toBe("#fbf8ef");
    expect(readableInkOn("not-a-colour")).toBe("#fbf8ef");
  });

  it("accepts the three-digit form", () => {
    expect(readableInkOn("#fff")).toBe("#0e1b2c");
    expect(readableInkOn("#000")).toBe("#fbf8ef");
  });
});
