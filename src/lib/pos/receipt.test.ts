import { describe, expect, it } from "vitest";

import type { KitchenOrder } from "@/lib/kds/orders";
import type { OrderItem } from "@/types/database.types";

import {
  buildReceipt,
  formatTruckTime,
  receiptLineTotal,
  receiptLinesTotal,
} from "./receipt";

function item(over: Partial<OrderItem> = {}): OrderItem {
  return {
    id: "i1",
    order_id: "o1",
    product_id: "p1",
    product_name: "coffee",
    quantity: 1,
    unit_price: 20,
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
    total_amount: 20,
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

describe("buildReceipt", () => {
  it("prints the same ticket handle the kitchen reads", () => {
    expect(buildReceipt(order()).ticket).toBe("b1cec0bb");
  });

  it("charges what the order says, not what the lines re-add to", () => {
    // if these two ever disagree the order row wins, because that is the
    // number the customer actually paid
    const receipt = buildReceipt(
      order({ total_amount: 55, items: [item({ unit_price: 20 })] }),
    );

    expect(receipt.total).toBe(55);
    expect(receiptLinesTotal(receipt)).toBe(20);
  });

  it("carries the extras through by name", () => {
    const receipt = buildReceipt(
      order({
        items: [
          item({
            selected_modifiers: [
              { id: "m1", name: "extra shot", extra_price: 5 },
              { id: "m2", name: "oat milk", extra_price: 7 },
            ],
          }),
        ],
      }),
    );

    expect(receipt.lines[0].extras).toEqual(["extra shot", "oat milk"]);
  });

  it("counts every unit, not every line", () => {
    const receipt = buildReceipt(
      order({ items: [item({ quantity: 3 }), item({ quantity: 2 })] }),
    );

    expect(receipt.lines).toHaveLength(2);
    expect(receipt.itemCount).toBe(5);
  });

  it("says which ticket it replaced when an order was edited", () => {
    expect(buildReceipt(order(), { replaces: "76b93f62" }).replaces).toBe(
      "76b93f62",
    );
    expect(buildReceipt(order()).replaces).toBeNull();
  });

  it("survives an order with no lines rather than throwing", () => {
    const receipt = buildReceipt(order({ items: [], total_amount: 0 }));

    expect(receipt.lines).toEqual([]);
    expect(receipt.itemCount).toBe(0);
  });

  it("forces prices to numbers, because postgrest sends numeric as text", () => {
    const receipt = buildReceipt(
      order({
        total_amount: "30.00" as unknown as number,
        items: [item({ unit_price: "10.00" as unknown as number, quantity: 3 })],
      }),
    );

    expect(receipt.total).toBe(30);
    expect(receipt.lines[0].unitPrice).toBe(10);
    expect(receipt.lines[0].lineTotal).toBe(30);
  });
});

// the reason this goes through piastres instead of `unitPrice * quantity`
describe("receiptLineTotal", () => {
  it("does not let float drift onto a printed line", () => {
    expect(8.1 * 3).toBe(24.299999999999997);
    expect(receiptLineTotal(8.1, 3)).toBe(24.3);

    expect(0.1 * 3).toBe(0.30000000000000004);
    expect(receiptLineTotal(0.1, 3)).toBe(0.3);
  });

  it("is zero for a zero quantity", () => {
    expect(receiptLineTotal(20, 0)).toBe(0);
  });
});

describe("formatTruckTime", () => {
  // cairo runs ahead of utc, so a late sale must not print yesterday's date
  it("prints the clock on the truck wall, not utc", () => {
    expect(formatTruckTime("2026-08-05T22:30:00.000Z")).toBe(
      "06/08/2026, 01:30",
    );
  });

  it("prints an empty string rather than Invalid Date", () => {
    expect(formatTruckTime("not a date")).toBe("");
  });
});
