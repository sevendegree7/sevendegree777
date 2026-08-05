import type { KitchenOrder } from "@/lib/kds/orders";

import type { CartLine } from "./cart";
import { toPiastres, toPounds } from "./money";

// turning a sale that was already rung up back into a cashier's cart, so it
// can be corrected and rung up again.
//
// the prices here are only what the cashier sees while editing. the server
// re-reads every price from the db on submit, exactly like a fresh sale, so
// nothing in this file can decide what anyone is charged.

// `order_items.unit_price` is the price of one unit **including** its extras,
// because that is what a receipt line needs. the cart works the other way
// round - a base price plus the extras on top - so the extras come back off.
export function basePriceOf(
  unitPrice: number,
  extras: { extra_price: number }[],
): number {
  const extrasPiastres = extras.reduce(
    (sum, extra) => sum + toPiastres(Number(extra.extra_price)),
    0,
  );

  return toPounds(toPiastres(Number(unitPrice)) - extrasPiastres);
}

// null when the order cannot be put back in a cart at all.
//
// that happens when a line has no `product_id` - the product was deleted after
// the sale. the line still has a name and a price on the old receipt, which is
// the point of snapshotting them, but there is nothing left to re-order.
export function cartLinesFromOrder(order: KitchenOrder): CartLine[] | null {
  const lines: CartLine[] = [];

  for (const item of order.items) {
    if (!item.product_id) {
      return null;
    }

    lines.push({
      lineId: crypto.randomUUID(),
      productId: item.product_id,
      productName: item.product_name,
      basePrice: basePriceOf(Number(item.unit_price), item.selected_modifiers),
      quantity: item.quantity,
      selectedModifiers: item.selected_modifiers,
      notes: item.notes,
    });
  }

  return lines;
}
