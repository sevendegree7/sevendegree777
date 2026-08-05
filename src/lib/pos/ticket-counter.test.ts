import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  nextLocalTicketNumber,
  primeTicketCounter,
} from "./ticket-counter";

describe("offline daily ticket counter", () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("continues after the highest cloud ticket seen", () => {
    primeTicketCounter("2026-08-05", 12);

    expect(
      nextLocalTicketNumber(new Date("2026-08-05T18:00:00.000Z")),
    ).toEqual({ date: "2026-08-05", number: 13 });
  });

  it("starts from one again at midnight in Egypt", () => {
    expect(
      nextLocalTicketNumber(new Date("2026-08-05T20:59:59.000Z")),
    ).toEqual({ date: "2026-08-05", number: 1 });

    expect(
      nextLocalTicketNumber(new Date("2026-08-05T21:00:00.000Z")),
    ).toEqual({ date: "2026-08-06", number: 1 });
  });
});
