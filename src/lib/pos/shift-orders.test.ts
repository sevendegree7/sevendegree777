import { describe, expect, it } from "vitest";

import { buildShiftReport } from "./shift-report";
import { mergeShiftWindowOrders } from "./shift-orders";

describe("overnight shift close report (fake data, no supabase)", () => {
  const shiftId = "shift-overnight";
  // evening open → close after midnight. one drawer session.
  const openedAt = "2026-10-31T15:00:00.000Z";
  const closedAt = "2026-11-01T01:30:00.000Z";

  it("counts every sale from open to close, including after midnight", () => {
    const merged = mergeShiftWindowOrders({
      shiftId,
      openedAt,
      closedAt,
      onShift: [
        {
          id: "pre-midnight",
          shift_id: shiftId,
          created_at: "2026-10-31T18:00:00.000Z",
          total_amount: 200,
          payment_method: "cash",
          status: "completed",
        },
        {
          id: "post-midnight",
          shift_id: shiftId,
          created_at: "2026-11-01T00:30:00.000Z",
          total_amount: 150,
          payment_method: "card",
          status: "completed",
        },
      ],
      orphans: [],
    });

    const report = buildShiftReport({
      orders: merged,
      openingFloat: 0,
      countedCash: 200,
    });

    expect(merged.map((order) => order.id).sort()).toEqual([
      "post-midnight",
      "pre-midnight",
    ]);
    expect(report.orderCount).toBe(2);
    expect(report.salesTotal).toBe(350);
    expect(report.cashSales).toBe(200);
  });

  it("also picks up unattached sales that happened during the same window", () => {
    const merged = mergeShiftWindowOrders({
      shiftId,
      openedAt,
      closedAt,
      onShift: [
        {
          id: "on-shift",
          shift_id: shiftId,
          created_at: "2026-10-31T16:00:00.000Z",
          total_amount: 100,
          payment_method: "cash",
          status: "completed",
        },
      ],
      orphans: [
        {
          id: "orphan-in-window",
          shift_id: null,
          created_at: "2026-10-31T20:00:00.000Z",
          total_amount: 80,
          payment_method: "cash",
          status: "completed",
        },
        {
          id: "orphan-before-open",
          shift_id: null,
          created_at: "2026-10-31T10:00:00.000Z",
          total_amount: 999,
          payment_method: "cash",
          status: "completed",
        },
        {
          id: "orphan-after-close",
          shift_id: null,
          created_at: "2026-11-01T03:00:00.000Z",
          total_amount: 999,
          payment_method: "cash",
          status: "completed",
        },
      ],
    });

    expect(merged.map((order) => order.id).sort()).toEqual([
      "on-shift",
      "orphan-in-window",
    ]);

    const report = buildShiftReport({
      orders: merged,
      openingFloat: 0,
      countedCash: null,
    });
    expect(report.salesTotal).toBe(180);
    expect(report.orderCount).toBe(2);
  });
});
