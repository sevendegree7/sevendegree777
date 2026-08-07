"use client";

import { applyReportPageSize } from "@/lib/pos/print-page";

// printing the report sheet.
//
// the page rule has to be written on the way to the dialog, not left in the
// stylesheet: the till drops @page margins so a receipt lands at the top left
// of a roll, and a report inheriting that would print its first column inside
// the strip an office printer cannot physically reach. this puts the margin
// back for the sheet, and the receipt puts its own rule back next time it
// prints - both write the same style element, so they cannot stack up.
export function PrintReportButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        applyReportPageSize(document);
        window.print();
      }}
      className="min-h-12 rounded-xl border border-line bg-raised px-5 py-3 text-sm font-medium"
    >
      {label}
    </button>
  );
}
