import { describe, expect, it } from "vitest";

import { buildShiftReport, type ShiftOrder } from "./shift-report";

function order(over: Partial<ShiftOrder> = {}): ShiftOrder {
  return {
    total_amount: 100,
    payment_method: "cash",
    status: "completed",
    created_by_name: "Mona",
    ...over,
  };
}

describe("buildShiftReport", () => {
  it("expects the float plus every cash sale to be in the drawer", () => {
    const report = buildShiftReport({
      orders: [order({ total_amount: 210 }), order({ total_amount: 190 })],
      openingFloat: 500,
      countedCash: null,
    });

    expect(report.cashSales).toBe(400);
    expect(report.expectedCash).toBe(900);
  });

  it("keeps card and instapay out of the cash the drawer should hold", () => {
    // this money never went in the drawer, so counting it as expected cash
    // would make an honest cashier look 400 short every single shift
    const report = buildShiftReport({
      orders: [
        order({ total_amount: 210, payment_method: "cash" }),
        order({ total_amount: 190, payment_method: "card" }),
        order({ total_amount: 210, payment_method: "instapay" }),
      ],
      openingFloat: 100,
      countedCash: null,
    });

    expect(report.salesTotal).toBe(610);
    expect(report.cashSales).toBe(210);
    expect(report.expectedCash).toBe(310);
  });

  it("reports a short drawer as a negative difference", () => {
    const report = buildShiftReport({
      orders: [order({ total_amount: 200 })],
      openingFloat: 500,
      countedCash: 650,
    });

    expect(report.expectedCash).toBe(700);
    expect(report.variance).toBe(-50);
  });

  it("reports an over drawer as a positive difference", () => {
    const report = buildShiftReport({
      orders: [order({ total_amount: 200 })],
      openingFloat: 500,
      countedCash: 720,
    });

    expect(report.variance).toBe(20);
  });

  it("leaves the difference unknown rather than calling an uncounted drawer balanced", () => {
    // a shift closed without counting is not a shift that came out level. a
    // zero here would quietly clear someone who never counted at all.
    const report = buildShiftReport({
      orders: [order()],
      openingFloat: 500,
      countedCash: null,
    });

    expect(report.countedCash).toBeNull();
    expect(report.variance).toBeNull();
  });

  it("counts cancelled tickets without putting them in the takings", () => {
    const report = buildShiftReport({
      orders: [
        order({ total_amount: 210 }),
        order({ total_amount: 190, status: "cancelled" }),
      ],
      openingFloat: 0,
      countedCash: null,
    });

    expect(report.orderCount).toBe(1);
    expect(report.cancelledCount).toBe(1);
    expect(report.salesTotal).toBe(210);
    expect(report.expectedCash).toBe(210);
  });

  it("splits one drawer between the people who sold from it", () => {
    // nobody closed the shift at handover, so two names are in one drawer
    const report = buildShiftReport({
      orders: [
        order({ total_amount: 210, created_by_name: "Mona" }),
        order({ total_amount: 190, created_by_name: "Karim" }),
        order({ total_amount: 100, created_by_name: "Mona" }),
      ],
      openingFloat: 0,
      countedCash: null,
    });

    expect(report.byCashier).toEqual([
      { name: "Mona", amount: 310, count: 2 },
      { name: "Karim", amount: 190, count: 1 },
    ]);
  });

  it("still counts a sale with no name against the drawer", () => {
    const report = buildShiftReport({
      orders: [
        order({ total_amount: 210, created_by_name: null }),
        order({ total_amount: 190, created_by_name: "   " }),
      ],
      openingFloat: 0,
      countedCash: null,
    });

    expect(report.byCashier).toEqual([{ name: "Unknown", amount: 400, count: 2 }]);
    expect(report.expectedCash).toBe(400);
  });

  it("does not let float drift into the drawer count", () => {
    // 8.10 three times is 24.299999999999997 in plain js
    const report = buildShiftReport({
      orders: [
        order({ total_amount: 8.1 }),
        order({ total_amount: 8.1 }),
        order({ total_amount: 8.1 }),
      ],
      openingFloat: 0.1,
      countedCash: 24.4,
    });

    expect(report.cashSales).toBe(24.3);
    expect(report.expectedCash).toBe(24.4);
    expect(report.variance).toBe(0);
  });

  it("survives a shift with no sales at all", () => {
    const report = buildShiftReport({
      orders: [],
      openingFloat: 500,
      countedCash: 500,
    });

    expect(report.orderCount).toBe(0);
    expect(report.salesTotal).toBe(0);
    expect(report.expectedCash).toBe(500);
    expect(report.variance).toBe(0);
    expect(report.byPayment).toEqual([]);
    expect(report.byCashier).toEqual([]);
  });
});
