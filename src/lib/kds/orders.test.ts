import { describe, expect, it } from "vitest";

import {
  ALLOWED_MOVES,
  canMove,
  isKitchenStatus,
  KITCHEN_STATUSES,
  mergeBoard,
  minutesSince,
  sortByOldest,
  ticketNumber,
  type KitchenOrder,
} from "./orders";

function ticket(over: Partial<KitchenOrder> = {}): KitchenOrder {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    client_id: "c1",
    total_amount: 20,
    payment_method: "cash",
    order_type: "takeaway",
    status: "pending",
    notes: null,
    created_by: null,
    stock_deducted: false,
    created_at: "2026-08-05T10:00:00.000Z",
    updated_at: "2026-08-05T10:00:00.000Z",
    items: [],
    ...over,
  };
}

// the board is drawn from two stores at once - supabase, and the sales this
// tablet took with no internet. these tests are about the seam between them.
describe("mergeBoard", () => {
  it("drops the local copy once the sale is in the cloud", () => {
    const board = mergeBoard(
      [ticket({ id: "cloud-id", client_id: "c1" })],
      [ticket({ id: "local-id", client_id: "c1" })],
    );

    expect(board).toHaveLength(1);
    expect(board[0].id).toBe("cloud-id");
  });

  // this is what lets createOrder accept the tablet's own id. if the dedupe
  // were on `id`, matching ids would be the thing keeping the board correct;
  // because it is on client_id, the two copies of one sale collapse whether
  // the ids match or not.
  it("still drops it when the cloud copy kept the tablet's id", () => {
    const board = mergeBoard(
      [ticket({ id: "same-id", client_id: "c1" })],
      [ticket({ id: "same-id", client_id: "c1" })],
    );

    expect(board).toHaveLength(1);
  });

  it("keeps a local sale that has not been uploaded yet", () => {
    const board = mergeBoard(
      [ticket({ id: "cloud-id", client_id: "c1" })],
      [ticket({ id: "local-id", client_id: "c2" })],
    );

    expect(board).toHaveLength(2);
  });

  it("keeps a local sale with no client_id rather than guessing", () => {
    const board = mergeBoard(
      [ticket({ id: "cloud-id", client_id: null })],
      [ticket({ id: "local-id", client_id: null })],
    );

    expect(board).toHaveLength(2);
  });

  it("comes back oldest first", () => {
    const board = mergeBoard(
      [
        ticket({
          id: "newer",
          client_id: "c1",
          created_at: "2026-08-05T10:05:00.000Z",
        }),
      ],
      [
        ticket({
          id: "older",
          client_id: "c2",
          created_at: "2026-08-05T10:00:00.000Z",
        }),
      ],
    );

    expect(board.map((order) => order.id)).toEqual(["older", "newer"]);
  });
});

describe("canMove", () => {
  it("allows the moves a kitchen tap makes", () => {
    expect(canMove("pending", "preparing")).toBe(true);
    expect(canMove("preparing", "ready")).toBe(true);
    expect(canMove("ready", "completed")).toBe(true);
  });

  it("allows the undo taps for a mis-hit card", () => {
    expect(canMove("preparing", "pending")).toBe(true);
    expect(canMove("ready", "preparing")).toBe(true);
  });

  it("allows a void from anywhere on the board", () => {
    for (const status of KITCHEN_STATUSES) {
      expect(canMove(status, "cancelled")).toBe(true);
    }
  });

  it("refuses a jump past the middle of the pipeline", () => {
    expect(canMove("pending", "ready")).toBe(false);
    expect(canMove("pending", "completed")).toBe(false);
  });

  it("refuses to move a ticket that already left the board", () => {
    expect(canMove("completed", "preparing")).toBe(false);
    expect(canMove("cancelled", "pending")).toBe(false);
  });

  it("never lets a finished ticket be reopened", () => {
    for (const moves of Object.values(ALLOWED_MOVES)) {
      expect(moves).not.toContain("completed_and_reopened");
    }
    expect(isKitchenStatus("completed")).toBe(false);
    expect(isKitchenStatus("cancelled")).toBe(false);
  });
});

describe("ticketNumber", () => {
  it("is the same slice the till shows the cashier", () => {
    expect(ticketNumber("b1cec0bb-3f10-4d85-b954-c051c2d6fce5")).toBe(
      "b1cec0bb",
    );
  });
});

describe("minutesSince", () => {
  const now = Date.parse("2026-08-05T10:30:00.000Z");

  it("counts whole minutes of waiting", () => {
    expect(minutesSince("2026-08-05T10:00:00.000Z", now)).toBe(30);
    expect(minutesSince("2026-08-05T10:29:30.000Z", now)).toBe(0);
  });

  it("never goes negative on a tablet whose clock is ahead", () => {
    expect(minutesSince("2026-08-05T11:00:00.000Z", now)).toBe(0);
  });

  it("says zero rather than NaN on a bad timestamp", () => {
    expect(minutesSince("not a date", now)).toBe(0);
  });
});

describe("sortByOldest", () => {
  it("does not mutate what it was given", () => {
    const input = [
      ticket({ id: "b", created_at: "2026-08-05T10:05:00.000Z" }),
      ticket({ id: "a", created_at: "2026-08-05T10:00:00.000Z" }),
    ];

    sortByOldest(input);

    expect(input.map((order) => order.id)).toEqual(["b", "a"]);
  });
});
