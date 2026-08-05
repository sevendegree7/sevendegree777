import { describe, expect, it } from "vitest";

import type { BoxContent, Product } from "@/types/database.types";

import {
  boxContentsTotal,
  formatBoxContents,
  isBoxProduct,
  mergeBoxContent,
  validateBoxContents,
} from "./box";

const dessertA = { id: "a", name: "tiramisu" } as Product;
const dessertB = { id: "b", name: "kunafa" } as Product;

describe("isBoxProduct", () => {
  it("needs both a pack size and a contents category", () => {
    expect(
      isBoxProduct({ piece_count: 6, contents_category_id: "desserts" }),
    ).toBe(true);
    expect(isBoxProduct({ piece_count: null, contents_category_id: null })).toBe(
      false,
    );
    expect(
      isBoxProduct({ piece_count: 6, contents_category_id: null }),
    ).toBe(false);
  });
});

describe("validateBoxContents", () => {
  const allowed = new Set(["a", "b"]);

  it("accepts an exact pack", () => {
    const contents: BoxContent[] = [
      { id: "a", name: "tiramisu", quantity: 2 },
      { id: "b", name: "kunafa", quantity: 4 },
    ];

    expect(
      validateBoxContents({
        pieceCount: 6,
        contentsCategoryId: "desserts",
        contents,
        allowedProductIds: allowed,
      }),
    ).toBeNull();
  });

  it("rejects the wrong total", () => {
    expect(
      validateBoxContents({
        pieceCount: 6,
        contentsCategoryId: "desserts",
        contents: [{ id: "a", name: "tiramisu", quantity: 3 }],
        allowedProductIds: allowed,
      }),
    ).toMatch(/exactly 6/);
  });

  it("rejects a flavor from outside the category", () => {
    expect(
      validateBoxContents({
        pieceCount: 1,
        contentsCategoryId: "desserts",
        contents: [{ id: "x", name: "coffee", quantity: 1 }],
        allowedProductIds: allowed,
      }),
    ).toMatch(/not in this box/);
  });
});

describe("mergeBoxContent", () => {
  it("adds and removes pieces", () => {
    let contents: BoxContent[] = [];
    contents = mergeBoxContent(contents, dessertA, 2);
    contents = mergeBoxContent(contents, dessertB, 1);
    contents = mergeBoxContent(contents, dessertA, -1);

    expect(boxContentsTotal(contents)).toBe(2);
    expect(formatBoxContents(contents)).toBe("1× tiramisu, 1× kunafa");
  });
});
