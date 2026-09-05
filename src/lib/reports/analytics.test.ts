import { describe, expect, it } from "vitest";

import { buildReportSummary, periodDays } from "./analytics";

describe("periodDays", () => {
  it("maps the report range buttons", () => {
    expect(periodDays("today")).toBe(0);
    expect(periodDays("7")).toBe(6);
    expect(periodDays("30")).toBe(29);
    expect(periodDays("90")).toBe(89);
  });
});

describe("buildReportSummary", () => {
  it("totals money and average ticket without float dust", () => {
    const summary = buildReportSummary({
      orders: [
        {
          id: "1",
          total_amount: 10.1,
          payment_method: "cash",
          order_type: "takeaway",
          status: "completed",
          created_at: "2026-08-05T12:00:00.000Z",
          created_by: "c1",
          created_by_name: "Sara",
        },
        {
          id: "2",
          total_amount: 20.2,
          payment_method: "card",
          order_type: "talabat",
          status: "completed",
          created_at: "2026-08-05T15:00:00.000Z",
          created_by: "c1",
          created_by_name: "Sara",
        },
        {
          id: "3",
          total_amount: 50,
          payment_method: "cash",
          order_type: "takeaway",
          status: "cancelled",
          created_at: "2026-08-05T16:00:00.000Z",
          created_by: "c1",
        },
      ],
      cancelledCount: 1,
      lines: [
        {
          product_name: "tiramisu umm ali",
          quantity: 2,
          unit_price: 220,
          order_id: "1",
        },
      ],
      cashierNames: { c1: "Sara" },
    });

    expect(summary.salesTotal).toBe(30.3);
    expect(summary.taxTotal).toBe(0);
    expect(summary.orderCount).toBe(2);
    expect(summary.averageTicket).toBe(15.15);
    expect(summary.cancelledCount).toBe(1);
    expect(summary.byCashier[0]?.label).toBe("Sara");
    expect(summary.topItems[0]?.qty).toBe(2);
  });

  it("names the cashier from the sale, not the live profile", () => {
    const summary = buildReportSummary({
      orders: [
        {
          id: "1",
          total_amount: 100,
          payment_method: "cash",
          order_type: "takeaway",
          status: "completed",
          created_at: "2026-09-05T12:00:00.000Z",
          created_by: "c1",
          created_by_name: "acashier",
        },
      ],
      cancelledCount: 0,
      lines: [],
      cashierNames: { c1: "moksha" },
    });

    expect(summary.byCashier[0]?.label).toBe("acashier");
  });
});
