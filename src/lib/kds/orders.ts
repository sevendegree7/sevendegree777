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
  pending: "start",
  preparing: "mark ready",
  ready: "picked up",
};

// small undo for mis-taps, kitchens tap the wrong card all the time
export const PREVIOUS_STATUS: Partial<Record<KitchenStatus, KitchenStatus>> = {
  preparing: "pending",
  ready: "preparing",
};

// every move the kds is allowed to make, checked again on the server
export const ALLOWED_MOVES: Record<KitchenStatus, OrderStatus[]> = {
  pending: ["preparing"],
  preparing: ["ready", "pending"],
  ready: ["completed", "preparing"],
};

export function canMove(from: OrderStatus, to: OrderStatus): boolean {
  return isKitchenStatus(from) && ALLOWED_MOVES[from].includes(to);
}

// short human handle for a ticket, same slice the pos shows the cashier
export function ticketNumber(orderId: string): string {
  return orderId.slice(0, 8);
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
