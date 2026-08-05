import { describe, expect, it } from "vitest";

import type { Modifier, Product } from "@/types/database.types";

import {
  groupModifiersByProduct,
  modifierAppliesToProduct,
} from "./modifiers";

function modifier(
  id: string,
  productId: string | null,
  active = true,
): Modifier {
  return {
    id,
    product_id: productId,
    name: id,
    extra_price: 10,
    is_active: active,
    created_at: "2026-08-05T00:00:00.000Z",
  };
}

const products = [{ id: "p1" }, { id: "p2" }] as Product[];

describe("modifierAppliesToProduct", () => {
  it("offers a global extra on every product", () => {
    const global = modifier("chocolate", null);

    expect(modifierAppliesToProduct(global, "p1")).toBe(true);
    expect(modifierAppliesToProduct(global, "p2")).toBe(true);
  });

  it("keeps a product-only option on its owner", () => {
    const owned = modifier("no-nuts", "p1");

    expect(modifierAppliesToProduct(owned, "p1")).toBe(true);
    expect(modifierAppliesToProduct(owned, "p2")).toBe(false);
  });
});

describe("groupModifiersByProduct", () => {
  it("combines shared and product-only options", () => {
    const grouped = groupModifiersByProduct(products, [
      modifier("chocolate", null),
      modifier("no-nuts", "p1"),
    ]);

    expect(grouped.get("p1")?.map((item) => item.id)).toEqual([
      "chocolate",
      "no-nuts",
    ]);
    expect(grouped.get("p2")?.map((item) => item.id)).toEqual(["chocolate"]);
  });

  it("does not offer inactive extras", () => {
    const grouped = groupModifiersByProduct(products, [
      modifier("chocolate", null, false),
    ]);

    expect(grouped.size).toBe(0);
  });
});
