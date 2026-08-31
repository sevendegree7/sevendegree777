import { describe, expect, it } from "vitest";

import {
  CUT,
  FEED,
  FEED_AND_CUT,
  OPEN_DRAWER,
  rawbtIntentUrl,
  receiptEscPos,
  rawBtAvailable,
  toBase64,
} from "./rawbt";
import type { Receipt } from "./receipt";

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
  it("kicks the drawer with ESC p 0 25 250", () => {
    expect(OPEN_DRAWER).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa]);
  });

  it("feeds before a partial cut", () => {
    expect(CUT).toEqual([0x1d, 0x56, 0x42, 0x00]);
    expect(FEED).toEqual([0x1b, 0x64, 0x04]);
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
    expect(toBase64(OPEN_DRAWER)).toBe("G3AAGfo=");
  });

  it("builds an Android intent URL with the RawBT package", () => {
    expect(rawbtIntentUrl(OPEN_DRAWER)).toBe(
      "intent:base64,G3AAGfo=#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;",
    );
  });

  it("does not claim RawBT support outside Android", () => {
    expect(rawBtAvailable()).toBe(false);
  });
});
