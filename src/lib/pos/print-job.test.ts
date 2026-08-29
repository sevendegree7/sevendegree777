import { describe, expect, it, vi } from "vitest";

import {
  PRINT_END_TIMEOUT_MS,
  printCopies,
  waitForPrintEnd,
  type PrintTarget,
} from "./print-job";

// a window with a print dialog nobody can open in a test. `print()` records the
// call and `fire()` stands in for the dialog being dismissed.
function fakeTarget(): PrintTarget & {
  prints: number;
  fire: () => void;
  listeners: number;
} {
  let listeners: (() => void)[] = [];

  return {
    prints: 0,
    get listeners() {
      return listeners.length;
    },
    print() {
      this.prints += 1;
    },
    addEventListener(_type, listener) {
      listeners = [...listeners, listener];
    },
    removeEventListener(_type, listener) {
      listeners = listeners.filter((entry) => entry !== listener);
    },
    fire() {
      for (const listener of [...listeners]) listener();
    },
  };
}

describe("waitForPrintEnd", () => {
  it("resolves when the dialog closes", async () => {
    const target = fakeTarget();
    const ended = waitForPrintEnd(target);

    target.fire();

    await expect(ended).resolves.toBeUndefined();
  });

  it("lets go of the listener, so a reprint does not stack them", async () => {
    const target = fakeTarget();

    await Promise.all([waitForPrintEnd(target), Promise.resolve(target.fire())]);
    expect(target.listeners).toBe(0);

    await Promise.all([waitForPrintEnd(target), Promise.resolve(target.fire())]);
    expect(target.listeners).toBe(0);
  });

  it("gives up rather than leaving the till stuck", async () => {
    vi.useFakeTimers();
    try {
      const target = fakeTarget();
      const ended = waitForPrintEnd(target);

      // a browser that never fires afterprint would otherwise hold the print
      // button disabled for the rest of the shift
      vi.advanceTimersByTime(PRINT_END_TIMEOUT_MS);

      await expect(ended).resolves.toBeUndefined();
      expect(target.listeners).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("settles once when the dialog closes and the timer lands too", async () => {
    vi.useFakeTimers();
    try {
      const target = fakeTarget();
      const ended = waitForPrintEnd(target, 10);

      target.fire();
      vi.advanceTimersByTime(50);
      target.fire();

      await expect(ended).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("printCopies", () => {
  it("sends one job per copy, each showing only its own paper", async () => {
    const order: string[] = [];

    await printCopies(
      2,
      {
        show: (index) => order.push(`show ${index}`),
        send: () => order.push("send"),
      },
      async () => {
        order.push("wait");
      },
    );

    expect(order).toEqual([
      "show 0",
      "wait",
      "send",
      "show 1",
      "wait",
      "send",
    ]);
  });

  it("arms the wait before printing", async () => {
    // desktop chrome fires afterprint from inside print(). listening after the
    // call would miss it and hold the second copy back until the timeout.
    const order: string[] = [];
    let armed = false;

    await printCopies(
      1,
      {
        show: () => {},
        send: () => {
          order.push(armed ? "armed first" : "printed unheard");
        },
      },
      async () => {
        armed = true;
      },
    );

    expect(order).toEqual(["armed first"]);
  });

  it("waits for each copy before starting the next", async () => {
    // the whole point of the split. if the second dialog opened while the first
    // was still up, the two copies would race into one job again.
    const order: string[] = [];
    const dialogs: (() => void)[] = [];

    const running = printCopies(
      2,
      {
        show: (index) => order.push(`show ${index}`),
        send: () => order.push("send"),
      },
      () => new Promise<void>((resolve) => dialogs.push(resolve)),
    );

    await Promise.resolve();
    expect(order).toEqual(["show 0", "send"]);

    // the first dialog closes
    dialogs[0]?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(["show 0", "send", "show 1", "send"]);

    dialogs[1]?.();
    await running;
  });

  it("still prints once when the settings say one copy", async () => {
    const shown: number[] = [];

    await printCopies(
      1,
      { show: (index) => shown.push(index), send: () => {} },
      async () => {},
    );

    expect(shown).toEqual([0]);
  });

  it("never sends nothing", async () => {
    // receipt_copies is checked in the admin action, but a stale settings row
    // reaching here must not leave the counter with no paper at all
    for (const copies of [0, -3, 0.5, Number.NaN]) {
      let prints = 0;

      await printCopies(
        copies,
        { show: () => {}, send: () => (prints += 1) },
        async () => {},
      );

      expect(prints).toBe(1);
    }
  });
});
