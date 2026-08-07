import { describe, expect, it } from "vitest";

import {
  applyTax,
  normaliseLabel,
  normaliseRate,
  readTaxSettings,
  TAX_SETTINGS_OFF,
  type TaxSettings,
} from "./tax";

const added = (rate: number, label = "VAT"): TaxSettings => ({
  enabled: true,
  label,
  rate,
  mode: "added",
});

const included = (rate: number, label = "VAT"): TaxSettings => ({
  enabled: true,
  label,
  rate,
  mode: "included",
});

describe("applyTax - off", () => {
  it("charges the lines and nothing else", () => {
    const result = applyTax(100, TAX_SETTINGS_OFF);

    expect(result.subtotal).toBe(100);
    expect(result.tax).toBe(0);
    expect(result.total).toBe(100);
  });

  it("reports a rate of zero, so an old receipt cannot claim one", () => {
    // the label survives for the settings screen, but the rate must not: a
    // sale rung with tax off has no rate, whatever the switch was set to.
    const result = applyTax(100, { ...added(14), enabled: false });

    expect(result.rate).toBe(0);
    expect(result.tax).toBe(0);
    expect(result.total).toBe(100);
  });

  it("treats a zero rate as off even when enabled", () => {
    const result = applyTax(100, added(0));

    expect(result.tax).toBe(0);
    expect(result.total).toBe(100);
  });
});

describe("applyTax - added on top", () => {
  it("puts the rate on top of the lines", () => {
    const result = applyTax(100, added(14));

    expect(result.subtotal).toBe(100);
    expect(result.tax).toBe(14);
    expect(result.total).toBe(114);
  });

  it("keeps subtotal + tax equal to total on an awkward number", () => {
    // 14% of 35.55 is 4.977, which no till can charge
    const result = applyTax(35.55, added(14));

    expect(result.tax).toBe(4.98);
    expect(result.total).toBe(40.53);
    expect(result.subtotal + result.tax).toBe(result.total);
  });

  it("rounds a half piastre up rather than into a float", () => {
    // 10% of 0.05 is exactly half a piastre
    const result = applyTax(0.05, added(10));

    expect(result.tax).toBe(0.01);
    expect(result.total).toBe(0.06);
  });

  it("carries a fractional rate", () => {
    const result = applyTax(200, added(2.5));

    expect(result.tax).toBe(5);
    expect(result.total).toBe(205);
  });

  it("charges nothing on an empty amount", () => {
    const result = applyTax(0, added(14));

    expect(result.tax).toBe(0);
    expect(result.total).toBe(0);
  });
});

describe("applyTax - already included", () => {
  it("splits the price instead of adding to it", () => {
    // the customer still pays 114, because 114 is what the menu said
    const result = applyTax(114, included(14));

    expect(result.total).toBe(114);
    expect(result.tax).toBe(14);
    expect(result.subtotal).toBe(100);
  });

  it("never changes what the customer pays", () => {
    for (const amount of [35, 100, 235.5, 1440.75]) {
      expect(applyTax(amount, included(14)).total).toBe(amount);
    }
  });

  it("divides by 100 + rate, not by 100", () => {
    // the classic mistake reads 14.00 here. the tax inside 100 at 14% is
    // 100 * 14 / 114, not 100 * 14 / 100.
    const result = applyTax(100, included(14));

    expect(result.tax).toBe(12.28);
    expect(result.subtotal).toBe(87.72);
  });

  it("keeps the parts adding up to the whole", () => {
    for (const amount of [0.01, 7.77, 35.55, 999.99]) {
      const result = applyTax(amount, included(14));
      expect(result.subtotal + result.tax).toBeCloseTo(result.total, 10);
    }
  });
});

describe("normaliseRate", () => {
  it("takes a real rate", () => {
    expect(normaliseRate(14)).toBe(14);
    expect(normaliseRate("14")).toBe(14);
    expect(normaliseRate(2.5)).toBe(2.5);
  });

  it("refuses a rate that would be a typo", () => {
    // a negative rate would hand money back, and 1400 would take fourteen
    // times the bill. both become "no tax" rather than something invented.
    expect(normaliseRate(-14)).toBe(0);
    expect(normaliseRate(1400)).toBe(0);
    expect(normaliseRate(100.01)).toBe(0);
    expect(normaliseRate("abc")).toBe(0);
    expect(normaliseRate(null)).toBe(0);
    expect(normaliseRate(undefined)).toBe(0);
    expect(normaliseRate(Number.NaN)).toBe(0);
    expect(normaliseRate(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("holds the rate to two decimals like the column", () => {
    expect(normaliseRate(14.005)).toBe(14.01);
    expect(normaliseRate(14.004)).toBe(14);
  });

  it("allows exactly 100", () => {
    expect(normaliseRate(100)).toBe(100);
  });
});

describe("normaliseLabel", () => {
  it("trims and keeps arabic", () => {
    expect(normaliseLabel("  ضريبة  ")).toBe("ضريبة");
  });

  it("falls back rather than printing a nameless number", () => {
    expect(normaliseLabel("")).toBe("VAT");
    expect(normaliseLabel("   ")).toBe("VAT");
    expect(normaliseLabel(null)).toBe("VAT");
  });

  it("cuts a label that would wrap the total block", () => {
    expect(normaliseLabel("x".repeat(200))).toHaveLength(24);
  });
});

describe("readTaxSettings", () => {
  it("reads a configured row", () => {
    expect(
      readTaxSettings({
        tax_enabled: true,
        tax_label: "ضريبة",
        tax_rate: "14.00",
        tax_mode: "included",
      }),
    ).toEqual({ enabled: true, label: "ضريبة", rate: 14, mode: "included" });
  });

  it("is off on a database where the migration has not run", () => {
    // the till must still ring a sale against an older schema
    expect(readTaxSettings({})).toEqual(TAX_SETTINGS_OFF);
    expect(readTaxSettings(null)).toEqual(TAX_SETTINGS_OFF);
    expect(readTaxSettings(undefined)).toEqual(TAX_SETTINGS_OFF);
  });

  it("is off when enabled is set but the rate is not", () => {
    expect(readTaxSettings({ tax_enabled: true, tax_rate: 0 }).enabled).toBe(
      false,
    );
  });

  it("falls back to added for an unknown mode", () => {
    expect(
      readTaxSettings({ tax_enabled: true, tax_rate: 14, tax_mode: "vibes" })
        .mode,
    ).toBe("added");
  });
});
