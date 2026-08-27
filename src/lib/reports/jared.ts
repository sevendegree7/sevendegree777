import { toPiastres, toPounds } from "@/lib/pos/money";

// sold qty + waste qty for a finished-goods jared (inventory count).

export type JaredSoldLine = {
  product_id: string | null;
  product_name: string;
  quantity: number;
};

export type JaredWasteLine = {
  product_id: string;
  quantity: number;
};

export type JaredRow = {
  productId: string;
  name: string;
  sold: number;
  waste: number;
  totalOut: number;
};

export function buildJared(input: {
  sold: JaredSoldLine[];
  waste: JaredWasteLine[];
  names: Record<string, string>;
}): JaredRow[] {
  const map = new Map<string, JaredRow>();

  for (const line of input.sold) {
    if (!line.product_id) continue;
    const current = map.get(line.product_id) ?? {
      productId: line.product_id,
      name: input.names[line.product_id] ?? line.product_name,
      sold: 0,
      waste: 0,
      totalOut: 0,
    };
    current.sold += line.quantity;
    map.set(line.product_id, current);
  }

  for (const line of input.waste) {
    const current = map.get(line.product_id) ?? {
      productId: line.product_id,
      name: input.names[line.product_id] ?? "Item",
      sold: 0,
      waste: 0,
      totalOut: 0,
    };
    current.waste += line.quantity;
    map.set(line.product_id, current);
  }

  return [...map.values()]
    .map((row) => ({
      ...row,
      totalOut: row.sold + row.waste,
    }))
    .sort((a, b) => b.totalOut - a.totalOut);
}

export function filterLinesByProducts(
  lines: { product_id: string | null; product_name: string; quantity: number; unit_price: number }[],
  productIds: Set<string> | null,
): { name: string; qty: number; revenue: number }[] {
  const counts: Record<string, { name: string; qty: number; revenue: number }> =
    {};

  for (const line of lines) {
    if (productIds && (!line.product_id || !productIds.has(line.product_id))) {
      continue;
    }

    const key = line.product_id ?? line.product_name;
    const current = counts[key] ?? {
      name: line.product_name,
      qty: 0,
      revenue: 0,
    };
    current.qty += line.quantity;
    current.revenue = toPounds(
      toPiastres(current.revenue) +
        toPiastres(Number(line.unit_price)) * line.quantity,
    );
    counts[key] = current;
  }

  return Object.values(counts).sort((a, b) => b.qty - a.qty);
}
