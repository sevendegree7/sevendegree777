"use client";

import { useTranslate, type Translator } from "@/lib/i18n/use-language";
import { formatMoney } from "@/lib/pos/money";
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
            onClick={() => window.print()}
            className="flex-[2] rounded-xl bg-navy px-4 py-3 text-base font-semibold text-cream dark:bg-accent-surface dark:text-accent-ink"
          >
            {t("receipt.print")}
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
  t,
}: {
  receipt: Receipt;
  reprint: boolean;
  copyLabel: string | null;
  variant: CopyVariant;
  t: Translator;
}) {
  const showPrices = variant === "customer";

  return (
    <div className="receipt-paper mb-4 rounded-2xl bg-white p-6 font-mono text-sm text-black shadow-lg print:mb-0 print:rounded-none print:p-0 print:shadow-none">
      <div className="text-center">
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
        <div className="mt-3 flex justify-between border-t border-dashed border-neutral-400 pt-3 text-lg font-bold">
          <span>{t("receipt.total")}</span>
          <span>{formatMoney(receipt.total)}</span>
        </div>
      ) : (
        <div className="mt-3 border-t border-dashed border-neutral-400 pt-2" />
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
    </div>
  );
}
