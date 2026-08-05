import { truckDayKey } from "@/lib/reports/dates";

const PREFIX = "seven-degree.ticket-counter.";

function keyFor(day: string): string {
  return `${PREFIX}${day}`;
}

function read(day: string): number {
  if (typeof window === "undefined") return 0;

  const value = Number(window.localStorage.getItem(keyFor(day)) ?? "0");
  return Number.isInteger(value) && value > 0 ? value : 0;
}

// remember the highest cloud ticket seen before the tablet loses internet
export function primeTicketCounter(day: string, highestNumber: number): void {
  if (typeof window === "undefined") return;

  const highest = Math.max(read(day), Math.floor(highestNumber));
  window.localStorage.setItem(keyFor(day), String(highest));
}

// one tablet owns offline sales, so this synchronous local increment is the
// visible 1..n sequence until the same number is reserved in postgres on sync
export function nextLocalTicketNumber(now = new Date()): {
  date: string;
  number: number;
} {
  const date = truckDayKey(now);
  const number = read(date) + 1;
  window.localStorage.setItem(keyFor(date), String(number));
  return { date, number };
}
