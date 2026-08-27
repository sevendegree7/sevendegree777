import { describe, expect, it } from "vitest";

import { buildJared, filterLinesByProducts } from "./jared";

describe("buildJared", () => {
  it("adds sold and waste per product", () => {
    const rows = buildJared({
      sold: [
        { product_id: "p1", product_name: "cookie", quantity: 3 },
        { product_id: "p1", product_name: "cookie", quantity: 2 },
      ],
      waste: [{ product_id: "p1", quantity: 1 }],
      names: { p1: "cookie" },
    });

    expect(rows).toEqual([
      {
        productId: "p1",
        name: "cookie",
        sold: 5,
        waste: 1,
        totalOut: 6,
      },
    ]);
  });
});

describe("filterLinesByProducts", () => {
  it("keeps only the selected product ids", () => {
    const rows = filterLinesByProducts(
      [
        {
          product_id: "a",
          product_name: "juice",
          quantity: 2,
          unit_price: 30,
        },
        {
          product_id: "b",
          product_name: "cookie",
          quantity: 1,
          unit_price: 40,
        },
      ],
      new Set(["a"]),
    );

    expect(rows).toEqual([{ name: "juice", qty: 2, revenue: 60 }]);
  });
});
