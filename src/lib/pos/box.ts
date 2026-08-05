import type { BoxContent, Product } from "@/types/database.types";

// dunkin-style pack helpers. a box has a fixed piece count and a category of
// flavors; the cashier fills it, and stock burns those flavors, not the box.

export function isBoxProduct(
  product: Pick<Product, "piece_count" | "contents_category_id">,
): boolean {
  return (
    product.piece_count !== null &&
    product.piece_count > 0 &&
    product.contents_category_id !== null
  );
}

export function boxContentsTotal(contents: BoxContent[]): number {
  return contents.reduce((sum, piece) => sum + Math.max(0, piece.quantity), 0);
}

export function boxContentsSignature(contents: BoxContent[]): string {
  return [...contents]
    .map((piece) => `${piece.id}:${piece.quantity}`)
    .sort()
    .join("|");
}

// null when the pack is valid. a string when the cashier still has work to do.
export function validateBoxContents(input: {
  pieceCount: number;
  contentsCategoryId: string;
  contents: BoxContent[];
  allowedProductIds: Set<string>;
}): string | null {
  const total = boxContentsTotal(input.contents);

  if (total !== input.pieceCount) {
    return `pick exactly ${input.pieceCount} pieces (currently ${total})`;
  }

  for (const piece of input.contents) {
    if (!input.allowedProductIds.has(piece.id)) {
      return `${piece.name} is not in this box's category`;
    }

    if (!Number.isInteger(piece.quantity) || piece.quantity <= 0) {
      return "each flavor needs a positive whole quantity";
    }
  }

  return null;
}

export function mergeBoxContent(
  contents: BoxContent[],
  product: Pick<Product, "id" | "name">,
  delta: number,
): BoxContent[] {
  const next = contents.map((piece) => ({ ...piece }));
  const existing = next.find((piece) => piece.id === product.id);

  if (existing) {
    existing.quantity += delta;
  } else if (delta > 0) {
    next.push({ id: product.id, name: product.name, quantity: delta });
  }

  return next.filter((piece) => piece.quantity > 0);
}

export function formatBoxContents(contents: BoxContent[]): string {
  return contents
    .map((piece) => `${piece.quantity}× ${piece.name}`)
    .join(", ");
}
