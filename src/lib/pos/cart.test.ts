import { describe, expect, it } from "vitest";

import type { SelectedModifier } from "@/types/database.types";

import {
  cartTotal,
  lineTotal,
  lineUnitPrice,
  modifierSignature,
  saleSignature,
  type CartLine,
} from "./cart";

function modifier(
  id: string,
  extra_price: number,
  name = id,
): SelectedModifier {
  return { id, name, extra_price };
}

function cartLine(over: Partial<CartLine> = {}): CartLine {
  return {
    lineId: "l1",
    productId: "p1",
    productName: "turkish coffee",
    basePrice: 20,
    quantity: 1,
    selectedModifiers: [],
    boxContents: [],
    notes: null,
    ...over,
  };
}

describe("lineUnitPrice", () => {
  it("adds every chosen extra to the base price", () => {
    expect(
      lineUnitPrice({
        basePrice: 45,
        quantity: 1,
        selectedModifiers: [modifier("m1", 5), modifier("m2", 7.5)],
      }),
    ).toBe(57.5);
  });

  it("is the base price when nothing was added", () => {
    expect(
      lineUnitPrice({ basePrice: 20, quantity: 3, selectedModifiers: [] }),
    ).toBe(20);
  });

  it("does not drift on prices that float addition gets wrong", () => {
    // 10.1 + 20.2 is 30.299999999999997 in plain javascript
    expect(
      lineUnitPrice({
        basePrice: 10.1,
        quantity: 1,
        selectedModifiers: [modifier("m1", 20.2)],
      }),
    ).toBe(30.3);
  });
});

describe("lineTotal", () => {
  it("multiplies the unit price by the quantity", () => {
    expect(
      lineTotal({ basePrice: 20, quantity: 3, selectedModifiers: [] }),
    ).toBe(60);
  });

  it("counts the extras once per unit, not once per line", () => {
    expect(
      lineTotal({
        basePrice: 45,
        quantity: 2,
        selectedModifiers: [modifier("m1", 5)],
      }),
    ).toBe(100);
  });

  it("does not drift on a quantity that float multiplication gets wrong", () => {
    // 8.1 * 3 is 24.299999999999997 in plain javascript
    expect(
      lineTotal({ basePrice: 8.1, quantity: 3, selectedModifiers: [] }),
    ).toBe(24.3);
  });
});

describe("cartTotal", () => {
  it("is zero for an empty cart", () => {
    expect(cartTotal([])).toBe(0);
  });

  it("adds the lines up", () => {
    expect(
      cartTotal([
        { basePrice: 20, quantity: 2, selectedModifiers: [] },
        {
          basePrice: 45,
          quantity: 1,
          selectedModifiers: [modifier("m1", 5)],
        },
      ]),
    ).toBe(90);
  });

  it("does not drift across lines", () => {
    // the same 10.1 + 20.2 problem, one line each
    expect(
      cartTotal([
        { basePrice: 10.1, quantity: 1, selectedModifiers: [] },
        { basePrice: 20.2, quantity: 1, selectedModifiers: [] },
      ]),
    ).toBe(30.3);
  });
});

describe("modifierSignature", () => {
  it("does not care what order the extras were tapped in", () => {
    expect(modifierSignature([modifier("b", 1), modifier("a", 2)])).toBe(
      modifierSignature([modifier("a", 2), modifier("b", 1)]),
    );
  });

  it("tells different sets apart", () => {
    expect(modifierSignature([modifier("a", 1)])).not.toBe(
      modifierSignature([modifier("a", 1), modifier("b", 1)]),
    );
  });

  it("is empty when nothing was added", () => {
    expect(modifierSignature([])).toBe("");
  });
});

// this one is a double-charge guard, so the properties matter more than the
// exact string: the same sale must produce the same id, and any edit to what
// is being sold must produce a different one.
describe("saleSignature", () => {
  const base = {
    lines: [cartLine()],
    orderType: "takeaway",
    paymentMethod: "cash",
    notes: "",
  };

  it("is stable for the same sale, so a retry reuses the same client_id", () => {
    expect(saleSignature(base)).toBe(saleSignature({ ...base }));
  });

  it("changes when the quantity changes", () => {
    expect(saleSignature(base)).not.toBe(
      saleSignature({ ...base, lines: [cartLine({ quantity: 2 })] }),
    );
  });

  it("changes when an extra is added", () => {
    expect(saleSignature(base)).not.toBe(
      saleSignature({
        ...base,
        lines: [cartLine({ selectedModifiers: [modifier("m1", 5)] })],
      }),
    );
  });

  it("changes when a different product is sold", () => {
    expect(saleSignature(base)).not.toBe(
      saleSignature({ ...base, lines: [cartLine({ productId: "p2" })] }),
    );
  });

  it("changes with the order type and the payment method", () => {
    expect(saleSignature(base)).not.toBe(
      saleSignature({ ...base, orderType: "dine_in" }),
    );
    expect(saleSignature(base)).not.toBe(
      saleSignature({ ...base, paymentMethod: "card" }),
    );
  });

  it("changes when a line note changes", () => {
    expect(saleSignature(base)).not.toBe(
      saleSignature({ ...base, lines: [cartLine({ notes: "no sugar" })] }),
    );
  });

  it("treats an order note as the same sale once trimmed", () => {
    expect(saleSignature({ ...base, notes: "  " })).toBe(saleSignature(base));
    expect(saleSignature({ ...base, notes: " urgent " })).toBe(
      saleSignature({ ...base, notes: "urgent" }),
    );
  });

  it("ignores lineId, which is a react key and never leaves the browser", () => {
    expect(saleSignature(base)).toBe(
      saleSignature({ ...base, lines: [cartLine({ lineId: "different" })] }),
    );
  });

  // documenting real behaviour, not endorsing it: the lines are joined in
  // array order, so the same two products in a different order are a different
  // sale. the cart never reorders itself, so this is not reachable today.
  it("is sensitive to the order of the lines", () => {
    const a = cartLine({ lineId: "a", productId: "p1" });
    const b = cartLine({ lineId: "b", productId: "p2" });

    expect(saleSignature({ ...base, lines: [a, b] })).not.toBe(
      saleSignature({ ...base, lines: [b, a] }),
    );
  });
});
