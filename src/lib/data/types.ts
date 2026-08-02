import type { MoveStatusInput, MoveStatusResult } from "@/app/kds/actions";
import type { CheckoutInput, CheckoutResult } from "@/app/pos/actions";
import type { KitchenOrder } from "@/lib/kds/orders";
import type { Category, Modifier, Product } from "@/types/database.types";

// the one door between the screens and wherever the data actually lives.
//
// today there is a single implementation (cloud, supabase). phase 4 adds a
// local one for when the tablet has no internet, and `getDataSource()` picks.
// the screens must not care which one answered - that is the whole point of
// this file, so keep supabase calls out of components from here on.

// the menu as one object, so it can be cached and handed around whole
export type MenuSnapshot = {
  categories: Category[];
  products: Product[];
  modifiers: Modifier[];
  // when this copy was read. a cached menu can then say how old it is.
  fetchedAt: string;
};

// reads either answer with data or with a message the ui can show.
// writes keep the result shapes the server actions already return.
export type Loaded<T> = { data: T; error: null } | { data: null; error: string };

export type SourceKind = "cloud" | "local";

export type DataSource = {
  readonly kind: SourceKind;
  loadMenu(): Promise<Loaded<MenuSnapshot>>;
  loadKitchenOrders(): Promise<Loaded<KitchenOrder[]>>;
  loadKitchenOrder(orderId: string): Promise<Loaded<KitchenOrder | null>>;
  submitOrder(input: CheckoutInput): Promise<CheckoutResult>;
  moveStatus(input: MoveStatusInput): Promise<MoveStatusResult>;
};

export function loaded<T>(data: T): Loaded<T> {
  return { data, error: null };
}

export function loadFailed<T>(error: string): Loaded<T> {
  return { data: null, error };
}
