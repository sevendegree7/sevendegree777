// sending each copy of a receipt as its own print job.
//
// a sale prints two papers: the customer's and the baker's. as one job they
// reach the printer as two pages of one document, and a thermal printer cuts
// once at the end of a job - so both copies come off the roll joined in one
// long slip that somebody tears apart by hand at the window.
//
// the printer can be told to cut after every page instead, but that setting
// lives in the print-service app on the tablet rather than in the printer, and
// it is not in every build of every such app. one copy per job needs nothing
// from either: one job, one cut, every time.
//
// the cost is one print dialog per copy. that is the trade, and it is why this
// only splits when there is more than one copy to send.

// the print surface this needs. a real Window satisfies it, and so does a
// couple of lines in a test - which is the point, since a print dialog cannot
// be opened in one.
export type PrintTarget = {
  print: () => void;
  addEventListener: (type: "afterprint", listener: () => void) => void;
  removeEventListener: (type: "afterprint", listener: () => void) => void;
};

// the safety net, not the mechanism. `afterprint` is what actually moves this
// along; the timeout only exists so that a browser which never fires it leaves
// the till with a working print button instead of one stuck mid-sequence.
export const PRINT_END_TIMEOUT_MS = 60_000;

export function waitForPrintEnd(
  target: PrintTarget,
  timeoutMs: number = PRINT_END_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      // desktop chrome fires afterprint from inside print() and the timer can
      // still land later; whichever arrives first is the only one that counts
      if (settled) return;
      settled = true;

      target.removeEventListener("afterprint", finish);
      clearTimeout(timer);

      resolve();
    };

    target.addEventListener("afterprint", finish);
    // declared after the listener it clears: neither the event nor the timer
    // can reach finish before this line has run
    const timer = setTimeout(finish, timeoutMs);
  });
}

export type PrintSteps = {
  // put copy `index` alone on the page. everything else has to leave the flow,
  // not just turn invisible, or the roll feeds the height of the copies that
  // were skipped.
  show: (index: number) => void;
  // size the page to whatever `show` just left there, and send it
  send: () => void;
};

// one copy, one job, in order.
//
// the listener is armed before `send` on purpose. on the desktop `print()`
// blocks until the dialog closes and fires `afterprint` before it returns, so
// a listener attached afterwards would wait for a event that already happened
// and hold the sequence until the timeout.
export async function printCopies(
  copies: number,
  steps: PrintSteps,
  waitForEnd: () => Promise<void>,
): Promise<void> {
  // a bad copy count must still put a paper in the customer's hand. NaN is
  // checked separately because Math.max carries it straight through.
  const total = Number.isFinite(copies) ? Math.max(1, Math.floor(copies)) : 1;

  for (let index = 0; index < total; index += 1) {
    steps.show(index);

    const ended = waitForEnd();
    steps.send();
    await ended;
  }
}
