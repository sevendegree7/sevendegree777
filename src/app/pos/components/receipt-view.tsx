"use client";

import { formatMoney } from "@/lib/pos/money";
import type { Receipt } from "@/lib/pos/receipt";

type ReceiptViewProps = {
  receipt: Receipt;
  // shown on a re-print so nobody mistakes it for a second sale
  reprint?: boolean;
  onClose: () => void;
};

// the printable ticket.
//
// the paper itself carries `id="receipt-paper"`, and the print rules in
// globals.css hide everything else on the page. that is the whole trick - the
// browser's own print dialog does the rest, which is what makes this work on
// the tablet today without a thermal printer plugged in.
export function ReceiptView({ receipt, reprint = false, onClose }: ReceiptViewProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-900/40 p-4 print:static print:block print:overflow-visible print:bg-transparent print:p-0">
      <div className="my-auto w-full max-w-sm print:my-0 print:max-w-none">
        <div
          id="receipt-paper"
          className="rounded-2xl bg-white p-6 font-mono text-sm text-stone-900 shadow-lg print:rounded-none print:p-0 print:shadow-none"
        >
          <div className="text-center">
            <p className="text-base font-semibold tracking-wide">
              seven degree
            </p>
            {reprint ? <p className="text-xs">— re-print —</p> : null}
          </div>

          <div className="mt-4 border-t border-dashed border-stone-300 pt-3">
            <div className="flex justify-between">
              <span>ticket</span>
              <span className="font-semibold">#{receipt.ticket}</span>
            </div>
            <div className="flex justify-between">
              <span>time</span>
              <span>{receipt.takenAt}</span>
            </div>
            <div className="flex justify-between">
              <span>type</span>
              <span>{receipt.orderType.replace("_", " ")}</span>
            </div>
            <div className="flex justify-between">
              <span>payment</span>
              <span>{receipt.paymentMethod ?? "—"}</span>
            </div>
            {receipt.replaces ? (
              // the customer may still be holding the old paper. say which one
              // stopped counting rather than leave two live tickets about.
              <div className="mt-2 flex justify-between text-xs">
                <span>replaces</span>
                <span>#{receipt.replaces} (cancelled)</span>
              </div>
            ) : null}
          </div>

          <ul className="mt-3 space-y-2 border-t border-dashed border-stone-300 pt-3">
            {receipt.lines.map((line, index) => (
              <li key={`${line.name}-${index}`}>
                <div className="flex justify-between gap-3">
                  <span>
                    {line.quantity} × {line.name}
                  </span>
                  <span>{formatMoney(line.lineTotal)}</span>
                </div>
                {line.extras.length > 0 ? (
                  <p className="pl-4 text-xs text-stone-600">
                    + {line.extras.join(", ")}
                  </p>
                ) : null}
                {line.notes ? (
                  <p className="pl-4 text-xs text-stone-600">{line.notes}</p>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="mt-3 flex justify-between border-t border-dashed border-stone-300 pt-3 text-base font-semibold">
            <span>total</span>
            <span>{formatMoney(receipt.total)}</span>
          </div>

          <p className="text-right text-xs text-stone-600">
            {receipt.itemCount} {receipt.itemCount === 1 ? "item" : "items"}
          </p>

          {receipt.notes ? (
            <p className="mt-3 border-t border-dashed border-stone-300 pt-3 text-xs">
              {receipt.notes}
            </p>
          ) : null}

          <p className="mt-4 text-center text-xs">شكراً · thank you</p>
        </div>

        <div className="mt-4 flex gap-3 print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-stone-300 bg-white px-4 py-3 text-base"
          >
            close
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex-[2] rounded-xl bg-stone-900 px-4 py-3 text-base font-medium text-white"
          >
            print
          </button>
        </div>
      </div>
    </div>
  );
}
