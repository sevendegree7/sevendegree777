import { describe, expect, it } from "vitest";

import { parseDayKey, truckDateRange, truckDayKey } from "./dates";

// cairo is utc+2 in winter and utc+3 under dst. every boundary below is checked
// against that, because an hour in the wrong direction moves a whole evening's
// takings onto the wrong day - and this truck's busiest hours are after 8pm.

describe("parseDayKey", () => {
  it("reads a plain yyyy-mm-dd", () => {
    expect(parseDayKey("2026-08-07")).toEqual({
      year: 2026,
      month: 8,
      day: 7,
    });
  });

  it("refuses a day that does not exist", () => {
    // Date.UTC would roll this to march. a report is not allowed to guess.
    expect(parseDayKey("2026-02-31")).toBeNull();
    expect(parseDayKey("2026-13-01")).toBeNull();
  });

  it("takes the leap day in a leap year and refuses it otherwise", () => {
    expect(parseDayKey("2024-02-29")).toEqual({
      year: 2024,
      month: 2,
      day: 29,
    });
    expect(parseDayKey("2026-02-29")).toBeNull();
  });

  it("refuses anything that is not the exact shape", () => {
    expect(parseDayKey("")).toBeNull();
    expect(parseDayKey(null)).toBeNull();
    expect(parseDayKey(undefined)).toBeNull();
    expect(parseDayKey("7/8/2026")).toBeNull();
    expect(parseDayKey("2026-8-7")).toBeNull();
    expect(parseDayKey("2026-08-07T10:00:00Z")).toBeNull();
  });
});

describe("truckDateRange", () => {
  it("starts at midnight cairo on the first day", () => {
    const range = truckDateRange("2026-08-01", "2026-08-07");

    // august is dst, so cairo midnight is 21:00 utc the evening before
    expect(range?.since).toBe("2026-07-31T21:00:00.000Z");
  });

  it("includes the whole of the last day", () => {
    const range = truckDateRange("2026-08-01", "2026-08-07");

    // the bound is the top of the 8th, so a sale at 23:59 on the 7th is in
    expect(range?.until).toBe("2026-08-07T21:00:00.000Z");
    expect(truckDayKey(new Date("2026-08-07T20:59:00.000Z"))).toBe("2026-08-07");
  });

  it("handles a single day", () => {
    const range = truckDateRange("2026-08-07", "2026-08-07");

    expect(range?.since).toBe("2026-08-06T21:00:00.000Z");
    expect(range?.until).toBe("2026-08-07T21:00:00.000Z");
  });

  it("uses the winter offset for a winter range", () => {
    // january is utc+2, so midnight cairo is 22:00 utc the night before
    const range = truckDateRange("2026-01-05", "2026-01-05");

    expect(range?.since).toBe("2026-01-04T22:00:00.000Z");
    expect(range?.until).toBe("2026-01-05T22:00:00.000Z");
  });

  it("keeps each end on its own offset across a dst switch", () => {
    // cairo moves to dst in april. the two ends must not share one offset.
    const range = truckDateRange("2026-04-01", "2026-05-01");

    expect(range?.since).toBe("2026-03-31T22:00:00.000Z");
    expect(range?.until).toBe("2026-05-01T21:00:00.000Z");
  });

  it("rolls over a month end", () => {
    const range = truckDateRange("2026-08-31", "2026-08-31");

    expect(range?.until).toBe("2026-08-31T21:00:00.000Z");
  });

  it("reads a backwards range in the order it was meant", () => {
    const range = truckDateRange("2026-08-07", "2026-08-01");

    expect(range?.from).toBe("2026-08-01");
    expect(range?.to).toBe("2026-08-07");
    expect(range?.since).toBe("2026-07-31T21:00:00.000Z");
  });

  it("answers null when either end is missing or junk", () => {
    expect(truckDateRange("2026-08-01", "")).toBeNull();
    expect(truckDateRange("", "2026-08-07")).toBeNull();
    expect(truckDateRange(null, null)).toBeNull();
    expect(truckDateRange("2026-08-01", "not a date")).toBeNull();
  });
});
