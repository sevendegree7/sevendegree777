import { describe, expect, it } from "vitest";

import type { KitchenOrder } from "@/lib/kds/orders";
import type { OrderItem } from "@/types/database.types";

import { lineUnitPrice } from "./cart";
import { basePriceOf, cartLinesFromOrder } from "./edit-order";

function item(over: Partial<OrderItem> = {}): OrderItem {
  return {
    id: "i1",
    order_id: "o1",
    product_id: "p1",
    product_name: "classic cinnabon",
    quantity: 1,
    unit_price: 45,
    selected_modifiers: [],
    box_contents: [],
    notes: null,
    created_at: "2026-08-05T10:00:00.000Z",
    ...over,
  };
}

function order(over: Partial<KitchenOrder> = {}): KitchenOrder {
  return {
    id: "b1cec0bb-3f10-4d85-b954-c051c2d6fce5",
    client_id: "c1",
    total_amount: 45,
    payment_method: "cash",
    order_type: "takeaway",
    status: "pending",
    notes: null,
    created_by: null,
    stock_deducted: false,
    created_at: "2026-08-05T10:00:00.000Z",
    updated_at: "2026-08-05T10:00:00.000Z",
    items: [item()],
    ...over,
  };
}

describe("basePriceOf", () => {
  it("takes the extras back off a stored unit price", () => {
    expect(
      basePriceOf(57, [
        { extra_price: 5 },
        { extra_price: 7 },
      ]),
    ).toBe(45);
  });

  it("leaves a line with no extras alone", () => {
    expect(basePriceOf(45, [])).toBe(45);
  });

  // the whole reason this is not `unitPrice - sum`
  it("does not leave float dust behind", () => {
    expect(20.05 - 12.25).toBe(7.800000000000001);
    expect(basePriceOf(20.05, [{ extra_price: 12.25 }])).toBe(7.8);
  });

  it("survives postgrest sending numeric as text", () => {
    expect(
      basePriceOf("57.00" as unknown as number, [
        { extra_price: "12.00" as unknown as number },
      ]),
    ).toBe(45);
  });
});

describe("cartLinesFromOrder", () => {
  it("puts the sale back in the cart the way it was rung up", () => {
    const lines = cartLinesFromOrder(
      order({ items: [item({ quantity: 2, notes: "no icing" })] }),
    );

    expect(lines).not.toBeNull();
    expect(lines).toHaveLength(1);
    expect(lines?.[0]).toMatchObject({
      productId: "p1",
      productName: "classic cinnabon",
      basePrice: 45,
      quantity: 2,
      notes: "no icing",
    });
  });

  // the round trip is the real test: split the price apart and put it back
  // together, and the cart must charge what the receipt did
  it("rebuilds the exact unit price it was given", () => {
    const stored = item({
      unit_price: 57,
      selected_modifiers: [
        { id: "m1", name: "extra icing", extra_price: 5 },
        { id: "m2", name: "walnuts", extra_price: 7 },
      ],
    });

    const line = cartLinesFromOrder(order({ items: [stored] }))?.[0];

    expect(line).toBeDefined();
    expect(lineUnitPrice(line!)).toBe(57);
  });

  it("keeps the extras so the cashier can see and remove them", () => {
    const line = cartLinesFromOrder(
      order({
        items: [
          item({
            selected_modifiers: [
              { id: "m1", name: "extra icing", extra_price: 5 },
            ],
          }),
        ],
      }),
    )?.[0];

    expect(line?.selectedModifiers).toEqual([
      { id: "m1", name: "extra icing", extra_price: 5 },
    ]);
  });

  it("gives every line its own key, even two of the same product", () => {
    const lines = cartLinesFromOrder(
      order({ items: [item({ id: "a" }), item({ id: "b" })] }),
    );

    expect(lines?.[0].lineId).not.toBe(lines?.[1].lineId);
  });

  // the product was deleted from the menu after the sale. the old receipt
  // still reads correctly because the name and price were snapshotted, but
  // there is nothing left to re-order.
  it("refuses the whole order when a line cannot be re-ordered", () => {
    expect(
      cartLinesFromOrder(
        order({ items: [item(), item({ product_id: null })] }),
      ),
    ).toBeNull();
  });

  it("handles an order with no lines", () => {
    expect(cartLinesFromOrder(order({ items: [] }))).toEqual([]);
  });
});
