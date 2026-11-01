// which sales belong on a closed (or still-open) drawer session.
//
// pure on purpose: the till report must be testable with fake rows and never
// needs supabase to prove that midnight does not split a shift.

export type ShiftWindowOrder = {
  id: string;
  shift_id?: string | null;
  created_at: string;
};

export function mergeShiftWindowOrders<T extends ShiftWindowOrder>(input: {
  shiftId: string;
  openedAt: string;
  closedAt: string | null;
  onShift: T[];
  orphans: T[];
  now?: string;
}): T[] {
  const opened = Date.parse(input.openedAt);
  const closed = Date.parse(input.closedAt ?? input.now ?? new Date().toISOString());

  const byId = new Map<string, T>();

  for (const order of input.onShift) {
    if (order.shift_id === input.shiftId) {
      byId.set(order.id, order);
    }
  }

  for (const order of input.orphans) {
    if (byId.has(order.id)) continue;
    if (order.shift_id != null && order.shift_id !== "") continue;

    const at = Date.parse(order.created_at);
    if (Number.isNaN(at) || Number.isNaN(opened) || Number.isNaN(closed)) {
      continue;
    }
    if (at < opened || at > closed) continue;

    byId.set(order.id, order);
  }

  return [...byId.values()];
}
