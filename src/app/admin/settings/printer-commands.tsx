import {
  FEED_AND_CUT,
  OPEN_DRAWER,
  rawbtIntentUrl,
} from "@/lib/pos/rawbt";

// anchors, not buttons with an onClick.
//
// chrome will not follow a custom scheme unless a person tapped the thing that
// leads there, and a tap on a real link is the least arguable form of that.
// firing the same url from javascript after an await - which is where this
// would have to live to run on every sale - is where the browser starts
// refusing.
//
// so this is a bench test, on the setup page, not a feature on the till. if
// these two work on the tablet then the channel is open and the drawer can move
// to the sale itself. if they do nothing, no amount of code on the till will
// help and that is worth knowing before any is written.
const ACTIONS = [
  {
    label: "Open the cash drawer",
    detail: "Sends the drawer pulse. The drawer should open even with no sale.",
    href: rawbtIntentUrl(OPEN_DRAWER),
  },
  {
    label: "Feed and cut",
    detail: "Feeds the roll past the blade, then fully cuts.",
    href: rawbtIntentUrl(FEED_AND_CUT),
  },
];

export function PrinterCommands() {
  return (
    <section className="rounded-2xl bg-raised p-5 shadow-sm">
      <h2 className="font-medium">Printer commands</h2>
      <p className="mt-1 text-sm text-muted">
        Receipts print as a picture, which cannot carry a command — so the cut
        and the drawer are sent separately, straight to RawBT. Tap these on the
        tablet, next to the printer.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {ACTIONS.map((action) => (
          <a
            key={action.label}
            href={action.href}
            className="block rounded-xl border border-line px-4 py-3 text-sm"
          >
            <span className="block font-medium">{action.label}</span>
            <span className="mt-1 block text-xs text-muted">
              {action.detail}
            </span>
          </a>
        ))}
      </div>

      <p className="mt-4 text-xs text-muted">
        Android and Chrome only. On a desktop these links do nothing, and that
        is not a fault to chase.
      </p>
    </section>
  );
}
