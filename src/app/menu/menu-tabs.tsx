"use client";

import { useState } from "react";

import { formatMoney } from "@/lib/pos/money";
import { readableInkOn } from "@/lib/ui/contrast";

// one priced line on the menu. a dessert and an add-on render the same way, so
// they share a shape - the only difference is that an add-on shows a "+" and
// can legitimately cost nothing.
export type MenuLine = {
  id: string;
  name: string;
  price: number;
  // the cuisine colour, shown as a dot. add-ons have none.
  color: string | null;
};

export type MenuTab = {
  id: string;
  name: string;
  color: string | null;
  kind: "product" | "extra";
  lines: MenuLine[];
};

export function MenuTabs({ tabs }: { tabs: MenuTab[] }) {
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? "");
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  if (!active) {
    return null;
  }

  return (
    <div>
      {/* the tab row scrolls sideways rather than wrapping, so the first tab
          stays where the thumb expects it on a narrow phone */}
      <div
        role="tablist"
        aria-label="Menu sections"
        className="-mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active.id;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveId(tab.id)}
              style={
                selected && tab.color
                  ? {
                      backgroundColor: tab.color,
                      borderColor: tab.color,
                      color: readableInkOn(tab.color),
                    }
                  : undefined
              }
              className={`shrink-0 snap-start rounded-full border px-4 py-2 font-mono text-[0.65rem] uppercase tracking-[0.18em] transition-colors ${
                selected
                  ? "border-navy bg-navy text-cream"
                  : "border-line bg-raised text-muted"
              }`}
            >
              {tab.name}
            </button>
          );
        })}
      </div>

      <ul key={active.id} className="menu-rise mt-8 space-y-5">
        {active.lines.map((line) => (
          <li key={line.id} className="flex items-baseline justify-between gap-4">
            <span className="flex items-baseline gap-2.5">
              {line.color ? (
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 translate-y-[-0.15rem] rounded-full"
                  style={{ backgroundColor: line.color }}
                />
              ) : null}
              <span className="text-lg font-medium capitalize leading-snug">
                {line.name}
              </span>
            </span>

            <span className="shrink-0 font-mono text-base font-semibold text-accent">
              {line.price === 0 && active.kind === "extra"
                ? "No charge"
                : `${active.kind === "extra" ? "+ " : ""}${formatMoney(line.price)}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
