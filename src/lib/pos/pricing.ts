import { applyTax, type TaxBreakdown, type TaxSettings } from "./tax";
import { toPiastres, toPounds } from "./money";

// the money on a sale, after tax and then after any discount or hospitality.
//
// order of operations (client asked for discount AFTER tax):
//   1. add the lines
//   2. apply tax
//   3. take the discount off that taxed total
//   4. diyafa zeros the payable amount and clears the discount
//
// tax still shows on the paper when there was tax and it is not diyafa, so the
// split stays honest. the customer pays `payable`.

export type DiscountKind = "percent" | "fixed";

export type DiscountInput = {
  kind: DiscountKind | null;
  // percent: 10 means 10%. fixed: pounds.
  value: number;
};

export type SalePricing = TaxBreakdown & {
  discountAmount: number;
  discountKind: DiscountKind | null;
  discountValue: number;
  isDiyafa: boolean;
  // what the customer actually owes / pays
  payable: number;
};

export function isDiscountKind(value: unknown): value is DiscountKind {
  return value === "percent" || value === "fixed";
}

// how much to take off a taxed total. never more than the total, never negative.
export function discountAmountOf(
  taxedTotal: number,
  discount: DiscountInput | null | undefined,
): number {
  if (!discount || !discount.kind) return 0;

  const total = toPiastres(taxedTotal);
  if (total <= 0) return 0;

  const raw = Number(discount.value);
  if (!Number.isFinite(raw) || raw <= 0) return 0;

  let off = 0;

  if (discount.kind === "percent") {
    if (raw > 100) return toPounds(total);
    off = Math.round((total * raw) / 100);
  } else {
    off = toPiastres(raw);
  }

  return toPounds(Math.min(Math.max(off, 0), total));
}

export function priceSale(input: {
  lineTotal: number;
  tax: TaxSettings;
  discount?: DiscountInput | null;
  isDiyafa?: boolean;
}): SalePricing {
  const taxed = applyTax(input.lineTotal, input.tax);
  const isDiyafa = input.isDiyafa === true;

  if (isDiyafa) {
    return {
      ...taxed,
      subtotal: 0,
      tax: 0,
      total: 0,
      rate: 0,
      discountAmount: 0,
      discountKind: null,
      discountValue: 0,
      isDiyafa: true,
      payable: 0,
    };
  }

  const kind = input.discount?.kind ?? null;
  const value =
    kind && Number.isFinite(Number(input.discount?.value))
      ? Number(input.discount?.value)
      : 0;
  const discountAmount = discountAmountOf(
    taxed.total,
    kind ? { kind, value } : null,
  );
  const payable = toPounds(toPiastres(taxed.total) - toPiastres(discountAmount));

  return {
    ...taxed,
    discountAmount,
    discountKind: discountAmount > 0 ? kind : null,
    discountValue: discountAmount > 0 ? value : 0,
    isDiyafa: false,
    payable,
  };
}
