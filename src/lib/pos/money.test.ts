import { describe, expect, it } from "vitest";

import { formatMoney, toPiastres, toPounds } from "./money";

// this module exists for one reason: floats cannot hold money. every test here
// is a receipt that would have been wrong.

describe("toPiastres", () => {
  it("turns pounds into whole piastres", () => {
    expect(toPiastres(20)).toBe(2000);
    expect(toPiastres(45.5)).toBe(4550);
    expect(toPiastres(0)).toBe(0);
  });

  it("does not leave a float tail behind", () => {
    // 19.99 * 100 is 1998.9999999999998 before rounding
    expect(toPiastres(19.99)).toBe(1999);
    expect(toPiastres(8.1)).toBe(810);
    expect(Number.isInteger(toPiastres(30.2))).toBe(true);
  });
});

describe("toPounds", () => {
  it("comes back to where it started", () => {
    for (const amount of [0, 5.5, 20, 30.3, 45.75, 1234.56]) {
      expect(toPounds(toPiastres(amount))).toBe(amount);
    }
  });
});

describe("formatMoney", () => {
  it("always shows two decimals", () => {
    expect(formatMoney(20)).toBe("20.00 egp");
    expect(formatMoney(45.5)).toBe("45.50 egp");
    expect(formatMoney(0)).toBe("0.00 egp");
  });
});
