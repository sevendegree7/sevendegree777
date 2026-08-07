// day boundaries for reports.
// the truck sells past midnight utc, so a sale at 1am cairo time must not land
// on yesterday's row. everything here is pinned to the truck's timezone rather
// than the server's, because vercel runs in utc but the shop does not.

export const TRUCK_TIMEZONE = "Africa/Cairo";

const PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: TRUCK_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

type Wall = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

// what the clock on the truck wall reads at this instant
function wallClock(date: Date): Wall {
  const parts = PARTS.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  // en-CA gives 24 for midnight, which Date.UTC would roll to the next day
  const hour = read("hour") % 24;

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour,
    minute: read("minute"),
    second: read("second"),
  };
}

// how far the truck's clock is ahead of utc at this instant (dst aware)
function offsetMs(date: Date): number {
  const wall = wallClock(date);
  const asUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// the yyyy-mm-dd a sale belongs to, by the truck's clock
export function truckDayKey(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "unknown";

  const wall = wallClock(date);
  const month = String(wall.month).padStart(2, "0");
  const day = String(wall.day).padStart(2, "0");
  return `${wall.year}-${month}-${day}`;
}

// the hour on the truck wall (0-23), for peak-hour reports
export function truckHour(value: string | Date): number {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return 0;
  return wallClock(date).hour;
}

// midnight at the top of a given truck day, as an instant to filter on.
// the day is allowed to be out of range - Date.UTC rolls day 0 back into last
// month and day 32 forward, which is what makes "n days ago" arithmetic safe.
function truckMidnightIso(
  year: number,
  month: number,
  day: number,
  reference: Date,
): string {
  const midnightAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);

  // first guess uses the reference day's offset, then correct it with the
  // offset actually in force on that day, so a dst switch does not shift the
  // boundary by an hour
  const guess = new Date(midnightAsUtc - offsetMs(reference));
  return new Date(midnightAsUtc - offsetMs(guess)).toISOString();
}

// midnight on the truck's clock, n days back, as an instant to filter on
export function startOfTruckDayIso(daysAgo = 0, now = new Date()): string {
  const wall = wallClock(now);
  return truckMidnightIso(wall.year, wall.month, wall.day - daysAgo, now);
}

export type TruckDay = { year: number; month: number; day: number };

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

// a yyyy-mm-dd typed into a date box, or picked by the tablet's own calendar.
// rejects a date that does not exist rather than letting Date.UTC roll it -
// "2026-02-31" quietly becoming march the 3rd would report the wrong week.
export function parseDayKey(value: string | null | undefined): TruckDay | null {
  const match = DAY_KEY.exec((value ?? "").trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));

  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

// an explicit "from this day to that day", both ends inclusive on the truck's
// clock. `until` is the instant the day AFTER `to` starts, so the filter is
// `>= since` and `< until` - a sale rung at 23:59 on the last day is in.
export type TruckRange = {
  from: string;
  to: string;
  since: string;
  until: string;
};

export function truckDateRange(
  from: string | null | undefined,
  to: string | null | undefined,
  now = new Date(),
): TruckRange | null {
  const a = parseDayKey(from);
  const b = parseDayKey(to);

  if (!a || !b) return null;

  // a range typed backwards is a range, not an error. reading it in the order
  // it was meant beats an empty report and no explanation.
  const [start, end] =
    (from ?? "").trim() <= (to ?? "").trim() ? [a, b] : [b, a];

  return {
    from: `${start.year}-${String(start.month).padStart(2, "0")}-${String(start.day).padStart(2, "0")}`,
    to: `${end.year}-${String(end.month).padStart(2, "0")}-${String(end.day).padStart(2, "0")}`,
    since: truckMidnightIso(start.year, start.month, start.day, now),
    until: truckMidnightIso(end.year, end.month, end.day + 1, now),
  };
}
