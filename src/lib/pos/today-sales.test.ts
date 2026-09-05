import { describe, expect, it } from "vitest";

import {
  mergeTodaySales,
  salesOnTruckDay,
  summariseTodaySales,
  type TodaySale,
} from "./today-sales";

function sale(over: Partial<TodaySale> = {}): TodaySale {
  return {
    total_amount: 100,
    status: "completed",
    created_at: "2026-09-05T10:00:00Z",
    ...over,
  };
}

describe("summariseTodaySales", () => {
  it("adds live tickets and skips cancelled ones", () => {
    const summary = summariseTodaySales([
      sale({ total_amount: 80 }),
      sale({ total_amount: 20.1 }),
      sale({ total_amount: 50, status: "cancelled" }),
    ]);

    expect(summary.orderCount).toBe(2);
    expect(summary.salesTotal).toBe(100.1);
  });

  it("counts a diyafa ticket even though it is 0", () => {
    const summary = summariseTodaySales([sale({ total_amount: 0 })]);

    expect(summary.orderCount).toBe(1);
    expect(summary.salesTotal).toBe(0);
  });
});

describe("mergeTodaySales", () => {
  it("adds a cloud total to the tablet's waiting sales", () => {
    const merged = mergeTodaySales(
      { orderCount: 2, salesTotal: 80 },
      { orderCount: 1, salesTotal: 20.05 },
    );

    expect(merged.orderCount).toBe(3);
    expect(merged.salesTotal).toBe(100.05);
  });
});

describe("salesOnTruckDay", () => {
  it("drops tickets from before midnight", () => {
    const kept = salesOnTruckDay(
      [
        sale({ created_at: "2026-09-04T20:00:00Z", total_amount: 10 }),
        sale({ created_at: "2026-09-05T08:00:00Z", total_amount: 20 }),
      ],
      "2026-09-05T00:00:00.000Z",
    );

    expect(kept).toHaveLength(1);
    expect(kept[0]?.total_amount).toBe(20);
  });
});
