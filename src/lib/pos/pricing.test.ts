import { describe, expect, it } from "vitest";

import { priceSale, discountAmountOf } from "./pricing";
import type { TaxSettings } from "./tax";

const TAX_OFF: TaxSettings = {
  enabled: false,
  label: "VAT",
  rate: 0,
  mode: "added",
};

const TAX_ADDED_14: TaxSettings = {
  enabled: true,
  label: "VAT",
  rate: 14,
  mode: "added",
};

describe("discountAmountOf", () => {
  it("takes a percent off the taxed total", () => {
    expect(discountAmountOf(114, { kind: "percent", value: 10 })).toBe(11.4);
  });

  it("takes a fixed amount without going past the total", () => {
    expect(discountAmountOf(50, { kind: "fixed", value: 20 })).toBe(20);
    expect(discountAmountOf(50, { kind: "fixed", value: 80 })).toBe(50);
  });

  it("ignores junk", () => {
    expect(discountAmountOf(50, { kind: "percent", value: 0 })).toBe(0);
    expect(discountAmountOf(50, null)).toBe(0);
  });
});

describe("priceSale", () => {
  it("applies discount after tax", () => {
    // 100 + 14% = 114, then 10% off 114 = 11.4, payable 102.6
    const priced = priceSale({
      lineTotal: 100,
      tax: TAX_ADDED_14,
      discount: { kind: "percent", value: 10 },
    });

    expect(priced.subtotal).toBe(100);
    expect(priced.tax).toBe(14);
    expect(priced.total).toBe(114);
    expect(priced.discountAmount).toBe(11.4);
    expect(priced.payable).toBe(102.6);
  });

  it("diyafa zeros the payable and clears discount", () => {
    const priced = priceSale({
      lineTotal: 100,
      tax: TAX_ADDED_14,
      discount: { kind: "fixed", value: 20 },
      isDiyafa: true,
    });

    expect(priced.payable).toBe(0);
    expect(priced.tax).toBe(0);
    expect(priced.discountAmount).toBe(0);
    expect(priced.isDiyafa).toBe(true);
  });

  it("with no tax and no discount, payable is the lines", () => {
    const priced = priceSale({ lineTotal: 45.5, tax: TAX_OFF });
    expect(priced.payable).toBe(45.5);
    expect(priced.discountAmount).toBe(0);
  });
});
