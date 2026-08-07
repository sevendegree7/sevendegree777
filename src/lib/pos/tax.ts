import { toPiastres, toPounds } from "./money";

// working out the tax on a sale.
//
// two modes, and they are not two ways of writing the same thing - they charge
// the customer different amounts of money:
//
//   added    the menu says 100, the tax is 14, the customer pays 114.
//   included the menu says 100, the customer pays 100, and 12.28 of it was
//            always tax. the receipt only shows the split.
//
// most menus in egypt are written tax-inclusive, so getting this backwards
// silently overcharges every customer by the rate. that is why the mode is a
// setting the owner picks rather than a constant somebody has to remember.

export type TaxMode = "added" | "included";

export type TaxSettings = {
  enabled: boolean;
  label: string;
  // percent, not a fraction. 14 means 14%.
  rate: number;
  mode: TaxMode;
};

export type TaxBreakdown = {
  subtotal: number;
  tax: number;
  total: number;
  // what was actually applied, ready to be snapshotted onto the order. these
  // are the settled values, not what was asked for - a disabled tax reports a
  // rate of 0, so an old receipt cannot claim a rate it never charged.
  rate: number;
  label: string;
};

export const DEFAULT_TAX_LABEL = "VAT";

export const TAX_SETTINGS_OFF: TaxSettings = {
  enabled: false,
  label: DEFAULT_TAX_LABEL,
  rate: 0,
  mode: "added",
};

// a label long enough to read and short enough to fit an 80mm roll next to a
// number. past this the amount wraps onto its own line and the total block
// stops lining up.
export const TAX_LABEL_MAX = 24;

export function isTaxMode(value: unknown): value is TaxMode {
  return value === "added" || value === "included";
}

// a rate that is not a number, is negative, or is over 100 is a typo, and a
// typo here is money. it becomes "no tax" rather than something invented.
export function normaliseRate(value: unknown): number {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 100) return 0;

  // two decimals, same as the column. 14.005 is not a tax rate.
  return Math.round(rate * 100) / 100;
}

export function normaliseLabel(value: unknown): string {
  const label = String(value ?? "").trim();
  return label ? label.slice(0, TAX_LABEL_MAX) : DEFAULT_TAX_LABEL;
}

// reads whatever came back from app_settings into something safe to charge on.
// the columns are missing entirely on a database where the tax migration has
// not run yet, which must mean "no tax" and never "crash the till".
export function readTaxSettings(row: unknown): TaxSettings {
  const settings = (row ?? {}) as Record<string, unknown>;
  const rate = normaliseRate(settings.tax_rate);

  return {
    // a rate of zero is off however the switch is set. there is no such thing
    // as a 0% tax line on a receipt - it is just a line that says nothing.
    enabled: settings.tax_enabled === true && rate > 0,
    label: normaliseLabel(settings.tax_label),
    rate,
    mode: isTaxMode(settings.tax_mode) ? settings.tax_mode : "added",
  };
}

// the whole point of the file. `amount` is the lines added up - which is the
// pre-tax price in `added` mode and the final price in `included` mode.
//
// everything runs through integer piastres like the rest of the till, so a
// fourteen percent of an odd number cannot land a hundredth of a pound out and
// leave the drawer short at the end of the night.
export function applyTax(amount: number, settings: TaxSettings): TaxBreakdown {
  const base = toPiastres(amount);

  if (!settings.enabled || settings.rate <= 0 || !Number.isFinite(base)) {
    return {
      subtotal: toPounds(base),
      tax: 0,
      total: toPounds(base),
      rate: 0,
      label: settings.label,
    };
  }

  if (settings.mode === "included") {
    // the tax is already inside `base`. pulling it back out is
    // base * rate / (100 + rate), not base * rate / 100 - the common way to
    // get this wrong, and it overstates the tax on every single sale.
    const tax = Math.round((base * settings.rate) / (100 + settings.rate));

    return {
      subtotal: toPounds(base - tax),
      tax: toPounds(tax),
      total: toPounds(base),
      rate: settings.rate,
      label: settings.label,
    };
  }

  const tax = Math.round((base * settings.rate) / 100);

  return {
    subtotal: toPounds(base),
    tax: toPounds(tax),
    total: toPounds(base + tax),
    rate: settings.rate,
    label: settings.label,
  };
}
