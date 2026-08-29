"use client";

import { useState } from "react";
import { flushSync } from "react-dom";

import { useTranslate, type Translator } from "@/lib/i18n/use-language";
import { formatMoney } from "@/lib/pos/money";
import { printCopies, waitForPrintEnd } from "@/lib/pos/print-job";
import { applyReceiptPageSize } from "@/lib/pos/print-page";
import type { Receipt } from "@/lib/pos/receipt";

type ReceiptViewProps = {
  receipt: Receipt;
  // shown on a re-print so nobody mistakes it for a second sale
  reprint?: boolean;
  // customer + baker copies by default; admin can change this in settings
  copies?: number;
  onClose: () => void;
};

// the two papers that come out of one sale.
//
// the customer copy carries the money. the baker copy carries the work: same
// order number, same items, no prices at all - the person plating a dessert has
// no reason to read the total, and a number on that paper is a number that gets
// quoted back to a customer by mistake.
//
// both lead with the order number at the size of a fast food screen, because
// that number is how the order is called out and how the customer knows the bag
// on the counter is theirs.
type CopyVariant = "customer" | "prep";

// each paper carries the receipt-paper class, and the print rules in
// globals.css hide everything else on the page. that is the whole trick - the
// browser's own print dialog does the rest, which is what makes this work on
// the tablet today without a thermal printer plugged in.
export function ReceiptView({
  receipt,
  reprint = false,
  copies = 2,
  onClose,
}: ReceiptViewProps) {
  const { t } = useTranslate();
  const safeCopies = Math.max(1, Math.min(3, Math.floor(copies)));

  // which copy is alone on the page right now, or null when all of them are.
  // null is the resting state, so the preview shows every paper and a Ctrl+P
  // from the browser's own menu still prints the lot.
  const [copyOnPage, setCopyOnPage] = useState<number | null>(null);
  const printing = copyOnPage !== null;

  // one print job per copy, so the printer's end-of-job cut falls between them.
  // see lib/pos/print-job.ts for why that is worth a second dialog.
  async function print() {
    if (printing) return;

    // measured once, here, while every copy is still on the page - so the page
    // is the tallest copy's length and all the slips from one sale come off the
    // roll the same size. measuring inside the loop would fit each page to its
    // own copy, which saves roll on the prep paper but hands the counter two
    // slips of different lengths for the same order.
    applyReceiptPageSize(document);

    try {
      await printCopies(
        safeCopies,
        {
          // flushSync, not a plain setState: the copy has to be on the page
          // before print() is called in the same turn, and react would
          // otherwise still be showing the previous one
          show: (index) => flushSync(() => setCopyOnPage(index)),
          // no re-measure. the rule written above is still in the head and
          // applies to every job in this sequence.
          send: () => window.print(),
        },
        () => waitForPrintEnd(window),
      );
    } finally {
      // whatever went wrong, the till must not be left showing one copy of a
      // two-copy sale with a dead print button
      setCopyOnPage(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy/60 p-4 print:static print:block print:overflow-visible print:bg-transparent print:p-0">
      <div className="my-auto w-full max-w-sm print:my-0 print:max-w-none">
        <div className="receipt-pages">
          {Array.from({ length: safeCopies }, (_, index) => {
            // first paper is always the customer's. everything after it is a
            // working copy for whoever is making the order.
            const variant: CopyVariant = index === 0 ? "customer" : "prep";

            return (
              <ReceiptPaper
                key={index}
                receipt={receipt}
                reprint={reprint}
                t={t}
                variant={variant}
                onPaper={copyOnPage === null || copyOnPage === index}
                copyLabel={
                  safeCopies === 1
                    ? null
                    : variant === "customer"
                      ? t("receipt.customerCopy")
                      : t("receipt.kitchenCopy")
                }
              />
            );
          })}
        </div>

        <div className="mt-4 flex gap-3 print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-line bg-raised px-4 py-3 text-base text-ink"
          >
            {t("receipt.close")}
          </button>
          <button
            type="button"
            // the page is sized to the receipt on the way to each dialog, so
            // what comes out is the paper's width and that copy's length
            disabled={printing}
            onClick={() => void print()}
            className="flex-[2] rounded-xl bg-navy px-4 py-3 text-base font-semibold text-cream disabled:opacity-60 dark:bg-accent-surface dark:text-accent-ink"
          >
            {printing
              ? t("receipt.printingCopy", {
                  done: (copyOnPage ?? 0) + 1,
                  total: safeCopies,
                })
              : t("receipt.print")}
          </button>
        </div>
      </div>
    </div>
  );
}

// paper is always black on white, whatever the tablet's theme is. a thermal
// roll has one ink and the screen preview should show what comes out of it.
function ReceiptPaper({
  receipt,
  reprint,
  copyLabel,
  variant,
  onPaper,
  t,
}: {
  receipt: Receipt;
  reprint: boolean;
  copyLabel: string | null;
  variant: CopyVariant;
  // false while a different copy is being sent. dropping the receipt-paper
  // class is all it takes: the print rules in globals.css keep whatever carries
  // it and take everything else out of the flow, so this copy stops being
  // printed *and* stops occupying roll ahead of the one that is.
  onPaper: boolean;
  t: Translator;
}) {
  const showPrices = variant === "customer";

  return (
    // the print padding is set in globals.css next to the roll width, so there
    // is no print:p-* here to override it
    <div
      className={`${onPaper ? "receipt-paper" : ""} mb-4 rounded-2xl bg-white p-6 font-mono text-sm text-black shadow-lg print:mb-0 print:rounded-none print:shadow-none`}
    >
      <div className="text-center">
        {/* the brand mark, customer copy only.
            not on the prep paper: the baker does not need branding, and every
            copy of it is another 8mm of roll and another second under the head.

            sized in mm rather than px on purpose - this is the one element on
            the paper whose printed size should not depend on how wide the
            preview happens to be. alt is empty because the wordmark directly
            below already says the name, and a reader announcing it twice is
            worse than not announcing it at all. */}
        {showPrices ? (
          // a plain img rather than next/image on purpose: this element is
          // measured for the page height and then sent to a print head, and
          // next/image's srcset can hand the printer a different candidate
          // than the one that was measured.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/brand/logo.png"
            alt=""
            loading="eager"
            decoding="sync"
            className="mx-auto mb-2 h-auto w-[20mm]"
          />
        ) : null}
        <p className="text-base font-semibold tracking-[0.2em]">
          SEVEN | DEGREES
        </p>
        {showPrices ? (
          <p className="text-[0.65rem] tracking-wide">{t("brand.tagline")}</p>
        ) : null}
        {copyLabel ? <p className="mt-1 text-xs">({copyLabel})</p> : null}
        {reprint ? <p className="text-xs">({t("receipt.reprint")})</p> : null}
      </div>

      {/* the order number, at the size it is read from across the counter */}
      <div className="mt-4 border-y-2 border-black py-3 text-center">
        <p className="text-[0.6rem] uppercase tracking-[0.3em]">
          {t("receipt.order")}
        </p>
        <p className="text-6xl font-bold leading-none tracking-tight">
          {receipt.ticket}
        </p>
      </div>

      <div className="mt-3">
        <div className="flex justify-between">
          <span>{t("receipt.time")}</span>
          <span>{receipt.takenAt}</span>
        </div>
        <div className="flex justify-between">
          <span>{t("receipt.type")}</span>
          <span>{t(`orderType.${receipt.orderType}`)}</span>
        </div>
        {showPrices ? (
          <div className="flex justify-between">
            <span>{t("receipt.payment")}</span>
            <span>
              {receipt.paymentMethod
                ? t(`payment.${receipt.paymentMethod}`)
                : "-"}
            </span>
          </div>
        ) : null}
        {/* on both papers. the customer's copy is what comes back with a
            complaint, and the baker wants to know who to go and ask. */}
        {receipt.cashier ? (
          <div className="flex justify-between">
            <span>{t("receipt.servedBy")}</span>
            <span>{receipt.cashier}</span>
          </div>
        ) : null}
        {/* the customer's own details, on both papers: the counter calls the
            name, and the kitchen copy is what a delivery goes out with */}
        {receipt.customerName ? (
          <div className="flex justify-between">
            <span>{t("receipt.customer")}</span>
            <span>{receipt.customerName}</span>
          </div>
        ) : null}
        {receipt.customerPhone ? (
          <div className="flex justify-between">
            <span>{t("receipt.phone")}</span>
            <span className="tracking-tight">{receipt.customerPhone}</span>
          </div>
        ) : null}
        {receipt.replaces ? (
          <div className="mt-2 flex justify-between text-xs">
            <span>{t("receipt.replaces")}</span>
            <span>
              #{receipt.replaces} ({t("receipt.cancelled")})
            </span>
          </div>
        ) : null}
      </div>

      <ul className="mt-3 space-y-2 border-t border-dashed border-neutral-400 pt-3">
        {receipt.lines.map((line, index) => (
          <li key={`${line.name}-${index}`}>
            <div className="flex justify-between gap-3">
              {/* the quantity leads on the baker copy too, and at full weight -
                  "2" being missed is the one mistake this paper exists to stop */}
              <span className={showPrices ? "" : "text-base"}>
                <span className="font-bold">{line.quantity} ×</span> {line.name}
              </span>
              {showPrices ? <span>{formatMoney(line.lineTotal)}</span> : null}
            </div>
            {line.boxContents.length > 0 ? (
              <p
                className={`ps-4 ${showPrices ? "text-xs text-neutral-700" : "text-sm font-semibold"}`}
              >
                {line.boxContents.join(", ")}
              </p>
            ) : null}
            {line.extras.length > 0 ? (
              <p
                className={`ps-4 ${showPrices ? "text-xs text-neutral-700" : "text-sm font-semibold"}`}
              >
                + {line.extras.join(", ")}
              </p>
            ) : null}
            {line.notes ? (
              <p
                className={`ps-4 ${showPrices ? "text-xs text-neutral-700" : "text-sm font-semibold"}`}
              >
                {line.notes}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      {showPrices ? (
        <div className="mt-3 border-t border-dashed border-neutral-400 pt-3">
          {/* the split, only when something was actually charged. the two lines
              add up to the total in both tax modes - a price the tax was added
              to, and a price it was already inside - so the paper needs no
              extra wording to be honest either way. */}
          {receipt.tax ? (
            <div className="mb-2 space-y-0.5 text-xs">
              <div className="flex justify-between">
                <span>{t("receipt.subtotal")}</span>
                <span>{formatMoney(receipt.tax.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>
                  {receipt.tax.label} {receipt.tax.rate}%
                </span>
                <span>{formatMoney(receipt.tax.amount)}</span>
              </div>
            </div>
          ) : null}
          {receipt.discountAmount ? (
            <div className="mb-2 flex justify-between text-xs">
              <span>{t("receipt.discount")}</span>
              <span>- {formatMoney(receipt.discountAmount)}</span>
            </div>
          ) : null}
          {receipt.isDiyafa ? (
            <p className="mb-2 text-center text-xs font-semibold">
              {t("receipt.diyafa")}
              {receipt.diyafaReason ? ` · ${receipt.diyafaReason}` : ""}
            </p>
          ) : null}
          <div className="flex justify-between text-lg font-bold">
            <span>{t("receipt.total")}</span>
            <span>{formatMoney(receipt.total)}</span>
          </div>
        </div>
      ) : (
        <div className="mt-3 border-t border-dashed border-neutral-400 pt-2">
          {receipt.isDiyafa ? (
            <p className="text-center text-sm font-semibold">
              {t("receipt.diyafa")}
              {receipt.diyafaReason ? ` · ${receipt.diyafaReason}` : ""}
            </p>
          ) : null}
        </div>
      )}

      <p className="text-end text-xs text-neutral-700">
        {receipt.itemCount}{" "}
        {receipt.itemCount === 1 ? t("receipt.item") : t("receipt.items")}
      </p>

      {receipt.notes ? (
        <p
          className={`mt-3 border-t border-dashed border-neutral-400 pt-3 ${showPrices ? "text-xs" : "text-sm font-semibold"}`}
        >
          {receipt.notes}
        </p>
      ) : null}

      {showPrices ? (
        <p className="mt-4 text-center text-xs">شكراً / Thank you</p>
      ) : null}

      {/* the feed that carries the last line past the cutter. it has to be the
          final thing on the paper and it has to print something, or the print
          service trims it away as blank and the cut lands inside the receipt -
          see .receipt-cut-tail in globals.css. nothing to read, nothing to
          announce. */}
      <div className="receipt-cut-tail" aria-hidden="true" />
    </div>
  );
}
