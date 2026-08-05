import type { Modifier, Product } from "@/types/database.types";

// a shared extra has no owner. product-owned options remain valid for cases
// like "no nuts" that make sense on one recipe but not the whole menu.
export function modifierAppliesToProduct(
  modifier: Pick<Modifier, "product_id">,
  productId: string,
): boolean {
  return modifier.product_id === null || modifier.product_id === productId;
}

export function groupModifiersByProduct(
  products: Pick<Product, "id">[],
  modifiers: Modifier[],
): Map<string, Modifier[]> {
  const active = modifiers.filter((modifier) => modifier.is_active !== false);
  const grouped = new Map<string, Modifier[]>();

  for (const product of products) {
    const available = active.filter((modifier) =>
      modifierAppliesToProduct(modifier, product.id),
    );

    if (available.length > 0) {
      grouped.set(product.id, available);
    }
  }

  return grouped;
}
