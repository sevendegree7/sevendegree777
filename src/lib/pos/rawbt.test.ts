import { describe, expect, it } from "vitest";

import {
  CUT,
  FEED,
  FEED_AND_CUT,
  OPEN_DRAWER,
  rawbtIntentUrl,
  receiptEscPos,
  rawBtAvailable,
  shiftReportEscPos,
  toBase64,
} from "./rawbt";
import type { Receipt } from "./receipt";
import type { ShiftReport } from "./shift-report";
import type { Shift } from "@/types/database.types";

const receipt: Receipt = {
  ticket: "13",
  takenAt: "31/08/2026, 18:00",
  orderType: "takeaway",
  paymentMethod: "cash",
  cashier: "Cashier",
  customerName: null,
  customerPhone: null,
  lines: [
    {
      name: "Tiramisu",
      extras: [],
      boxContents: [],
      quantity: 1,
      unitPrice: 220,
      lineTotal: 220,
      notes: null,
    },
  ],
  itemCount: 1,
  tax: null,
  discountAmount: null,
  isDiyafa: false,
  diyafaReason: null,
  total: 220,
  notes: null,
  replaces: null,
};

describe("the RawBT command bytes", () => {
  it("kicks both drawer pins with a 120ms pulse", () => {
    expect(OPEN_DRAWER).toEqual([
      0x1b, 0x70, 0x00, 0x3c, 0x78, 0x1b, 0x70, 0x01, 0x3c, 0x78,
    ]);
  });

  it("feeds then fully cuts, so two copies become two papers", () => {
    expect(CUT).toEqual([0x1d, 0x56, 0x00]);
    expect(FEED).toEqual([0x1b, 0x64, 0x0a]);
    expect(FEED_AND_CUT).toEqual([...FEED, ...CUT]);
  });

  it("creates one cut command per printed copy", () => {
    const output = Array.from(receiptEscPos(receipt, 2));
    let cuts = 0;

    for (let index = 0; index < output.length - 2; index += 1) {
      if (output[index] === 0x1d && output[index + 1] === 0x56) cuts += 1;
    }

    expect(cuts).toBe(2);
    expect(new TextDecoder().decode(Uint8Array.from(output))).toContain(
      "SEVEN | DEGREES",
    );
  });
});

describe("RawBT encoding", () => {
  it("encodes raw bytes without corrupting ESC/POS commands", () => {
    const encoded = toBase64(OPEN_DRAWER);
    expect(encoded.length).toBeGreaterThan(0);
    expect(rawbtIntentUrl(OPEN_DRAWER)).toBe(
      `intent:base64,${encoded}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`,
    );
  });

  it("does not claim RawBT support outside Android", () => {
    expect(rawBtAvailable()).toBe(false);
  });
});

describe("daily sales ESC/POS", () => {
  it("prints net sales, categories and cash/visa then cuts once", () => {
    const shift = {
      id: "s1",
      opened_by: null,
      opened_by_name: "Mona",
      opened_at: "2026-10-31T07:00:00.000Z",
      closed_by: null,
      closed_by_name: "Mona",
      closed_at: "2026-10-31T22:00:00.000Z",
      opening_float: 500,
      counted_cash: 710,
      notes: null,
      created_at: "2026-10-31T07:00:00.000Z",
    } satisfies Shift;

    const report: ShiftReport = {
      orderCount: 2,
      averageTicket: 205,
      cancelledCount: 1,
      cancelledAmount: 50,
      salesTotal: 410,
      byPayment: [
        { key: "card", label: "Visa", amount: 200, count: 1 },
        { key: "cash", label: "Cash", amount: 210, count: 1 },
      ],
      byCategory: [
        { key: "d", label: "Desserts", amount: 300, count: 2 },
        { key: "b", label: "Beverages", amount: 110, count: 1 },
      ],
      byCashier: [{ name: "Mona", amount: 410, count: 2 }],
      cashSales: 210,
      openingFloat: 500,
      expectedCash: 710,
      countedCash: 710,
      variance: 0,
    };

    const text = new TextDecoder().decode(shiftReportEscPos(shift, report));
    expect(text).toContain("DAILY SALES");
    expect(text).toContain("Net sales");
    expect(text).toContain("Desserts");
    expect(text).toContain("Visa");
    expect(text).toContain("Cancel");

    const output = Array.from(shiftReportEscPos(shift, report));
    let cuts = 0;
    for (let index = 0; index < output.length - 2; index += 1) {
      if (output[index] === 0x1d && output[index + 1] === 0x56) cuts += 1;
    }
    expect(cuts).toBe(1);
  });
});
