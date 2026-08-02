import type { SelectedModifier } from "@/types/database.types";

import { toPiastres, toPounds } from "./money";

// the smallest shape we can price. the browser cart and the server action
// both build this so totals are calculated by the exact same code.
export type PricedLine = {
  basePrice: number;
  quantity: number;
  selectedModifiers: SelectedModifier[];
};

// one row in the cashier cart, lives in the browser only until checkout
export type CartLine = PricedLine & {
  // local key for react, never sent to the db
  lineId: string;
  productId: string;
  productName: string;
  notes: string | null;
};

// price of a single unit including its chosen modifiers
export function lineUnitPrice(line: PricedLine): number {
  const piastres = line.selectedModifiers.reduce(
    (sum, modifier) => sum + toPiastres(modifier.extra_price),
    toPiastres(line.basePrice),
  );

  return toPounds(piastres);
}

// unit price times quantity
export function lineTotal(line: PricedLine): number {
  return toPounds(toPiastres(lineUnitPrice(line)) * line.quantity);
}

// what the customer pays for the whole cart
export function cartTotal(lines: PricedLine[]): number {
  const piastres = lines.reduce(
    (sum, line) => sum + toPiastres(lineTotal(line)),
    0,
  );

  return toPounds(piastres);
}

// identifies "same product with the same extras" so repeat taps merge
export function modifierSignature(modifiers: SelectedModifier[]): string {
  return modifiers
    .map((modifier) => modifier.id)
    .sort()
    .join("|");
}

// a fingerprint of exactly what is being sold right now.
// the checkout id is this plus a per-sale seed, so pressing pay again after a
// network wobble sends the same client_id and the db returns the first order
// instead of charging twice - while any edit to the sale changes the id, so a
// changed cart can never come back as the old order's total.
export function saleSignature(input: {
  lines: CartLine[];
  orderType: string;
  paymentMethod: string;
  notes: string;
}): string {
  const body = input.lines
    .map((line) =>
      [
        line.productId,
        line.quantity,
        modifierSignature(line.selectedModifiers),
        line.notes ?? "",
      ].join("~"),
    )
    .join(",");

  return [input.orderType, input.paymentMethod, input.notes.trim(), body].join(
    "#",
  );
}
