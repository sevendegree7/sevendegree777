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

// midnight on the truck's clock, n days back, as an instant to filter on
export function startOfTruckDayIso(daysAgo = 0, now = new Date()): string {
  const wall = wallClock(now);
  const midnightAsUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day - daysAgo,
    0,
    0,
    0,
  );

  // first guess uses today's offset, then correct it with the offset that is
  // actually in force on that day, so a dst switch does not shift the boundary
  const guess = new Date(midnightAsUtc - offsetMs(now));
  return new Date(midnightAsUtc - offsetMs(guess)).toISOString();
}
