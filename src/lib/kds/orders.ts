import type { Order, OrderItem, OrderStatus } from "@/types/database.types";

// the only statuses that belong on the kitchen board.
// completed and cancelled tickets leave the screen.
export const KITCHEN_STATUSES = ["pending", "preparing", "ready"] as const;

export type KitchenStatus = (typeof KITCHEN_STATUSES)[number];

// one ticket: the order row plus the lines the kitchen has to make
export type KitchenOrder = Order & { items: OrderItem[] };

export function isKitchenStatus(status: OrderStatus): status is KitchenStatus {
  return (KITCHEN_STATUSES as readonly string[]).includes(status);
}

// the big button on each card. ready -> completed clears it off the board.
export const NEXT_STATUS: Record<KitchenStatus, OrderStatus> = {
  pending: "preparing",
  preparing: "ready",
  ready: "completed",
};

export const NEXT_STATUS_LABEL: Record<KitchenStatus, string> = {
  pending: "Start",
  preparing: "Mark ready",
  ready: "Picked up",
};

// small undo for mis-taps, kitchens tap the wrong card all the time
export const PREVIOUS_STATUS: Partial<Record<KitchenStatus, KitchenStatus>> = {
  preparing: "pending",
  ready: "preparing",
};

// every move the kds is allowed to make, checked again on the server.
//
// `cancelled` is on every row and is not a step along the pipeline - it is a
// jump off it. the customer walks away, or the ticket was rung up wrong, and
// that can happen while the ticket is waiting, being made, or sitting ready.
// the server turns this move into two things, not one: the status, and the
// raw materials going back on the shelf.
export const ALLOWED_MOVES: Record<KitchenStatus, OrderStatus[]> = {
  pending: ["preparing", "cancelled"],
  preparing: ["ready", "pending", "cancelled"],
  ready: ["completed", "preparing", "cancelled"],
};

export function canMove(from: OrderStatus, to: OrderStatus): boolean {
  return isKitchenStatus(from) && ALLOWED_MOVES[from].includes(to);
}

// the daily number is what staff and customers say out loud. accepting a
// string keeps old/offline records readable until they are migrated.
export function ticketNumber(
  order: string | Pick<Order, "id" | "ticket_number">,
): string {
  if (typeof order === "string") return order.slice(0, 8);
  return Number.isInteger(order.ticket_number)
    ? String(order.ticket_number)
    : order.id.slice(0, 8);
}

// how long the ticket has been waiting, in whole minutes
export function minutesSince(iso: string, now: number): number {
  const started = new Date(iso).getTime();

  if (Number.isNaN(started)) {
    return 0;
  }

  return Math.max(0, Math.floor((now - started) / 60000));
}

// oldest ticket first so the kitchen works fifo
export function sortByOldest(orders: KitchenOrder[]): KitchenOrder[] {
  return [...orders].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

// one board out of two stores: what supabase has, plus the sales this tablet
// took with no internet.
//
// a local ticket whose `client_id` is already in the cloud list has been
// uploaded, so the cloud copy wins - it is the one every screen can see, and
// showing both would put the same ticket on the board twice.
export function mergeBoard(
  cloud: KitchenOrder[],
  local: KitchenOrder[],
): KitchenOrder[] {
  const uploaded = new Set(
    cloud
      .map((order) => order.client_id)
      .filter((clientId): clientId is string => clientId !== null),
  );

  return sortByOldest([
    ...cloud,
    ...local.filter(
      (order) => order.client_id === null || !uploaded.has(order.client_id),
    ),
  ]);
}
