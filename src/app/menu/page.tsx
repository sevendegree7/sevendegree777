import { BrandMark } from "@/components/brand-mark";
import { createClient } from "@/lib/supabase/server";

import { MenuTabs, type MenuLine, type MenuTab } from "./menu-tabs";

// refresh often so sold-out toggles show up for qr guests
export const revalidate = 30;

export default async function PublicMenuPage() {
  const supabase = await createClient();

  const [categoriesResult, productsResult, modifiersResult] = await Promise.all(
    [
      supabase.from("categories").select("*").order("sort_order"),
      supabase
        .from("products")
        .select("*")
        .eq("is_available", true)
        .order("sort_order"),
      supabase.from("modifiers").select("*").order("extra_price"),
    ],
  );

  const loadError =
    categoriesResult.error ?? productsResult.error ?? modifiersResult.error;

  const categories = categoriesResult.data ?? [];
  const products = productsResult.data ?? [];
  const modifiers = modifiersResult.data ?? [];

  // add-ons are shown as one flat price list rather than repeated under every
  // dessert they belong to. the same "extra pistachio" costs the same wherever
  // it is added, so printing it seven times only makes the page longer.
  const seenAddOn = new Set<string>();
  const addOns: MenuLine[] = [];

  for (const modifier of modifiers.filter(
    (modifier) => modifier.is_active !== false,
  )) {
    const price = Number(modifier.extra_price);
    const key = `${modifier.name.toLowerCase()}|${price}`;

    if (seenAddOn.has(key)) {
      continue;
    }

    seenAddOn.add(key);
    addOns.push({ id: modifier.id, name: modifier.name, price, color: null });
  }

  addOns.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));

  const tabs: MenuTab[] = categories
    .filter((category) => category.is_active !== false)
    .map((category) => {
      const isExtras = category.name.toLowerCase() === "extras";

      const lines: MenuLine[] = products
        .filter((product) => product.category_id === category.id)
        .map((product) => ({
          id: product.id,
          name: product.name,
          price: Number(product.base_price),
          color: product.color ?? null,
        }));

      return {
        id: category.id,
        name: category.name,
        color: category.color,
        kind: isExtras ? ("extra" as const) : ("product" as const),
        // the extras category holds no products of its own - its prices are the
        // add-ons. if admin ever does put a sellable item in there, it lists
        // above them rather than being hidden.
        lines: isExtras ? [...lines, ...addOns] : lines,
      };
    })
    .filter((tab) => tab.lines.length > 0);

  const updatedLabel = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <main className="relative mx-auto min-h-screen w-full max-w-lg px-5 pb-16 pt-12">
      <div
        aria-hidden
        className="menu-rings pointer-events-none absolute inset-x-0 top-0 h-80 opacity-30"
      />

      <header className="menu-rise relative text-center">
        <BrandMark size="hero" className="mx-auto" />

        <p className="mt-4 font-mono text-[0.65rem] uppercase tracking-[0.3em] text-muted">
          Seven cuisines, one Cairo
        </p>

        <h1 className="menu-display mt-3 text-4xl font-semibold leading-none tracking-tight sm:text-5xl">
          Seven Degrees
        </h1>

        <p className="menu-accent menu-rise menu-rise-delay-1 mt-3 text-lg text-accent">
          Cairo&apos;s cartographer of taste.
        </p>

        <p className="menu-rise menu-rise-delay-2 mt-5 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted">
          On the counter · {updatedLabel}
        </p>
      </header>

      {loadError ? (
        <div className="menu-rise menu-rise-delay-3 mt-10 rounded-2xl border border-line bg-raised px-5 py-6 text-sm">
          <p className="font-medium">Menu could not load</p>
          <p className="mt-2 text-muted">{loadError.message}</p>
          <p className="mt-3 text-xs text-muted">
            If this is a fresh setup, run{" "}
            <code className="rounded bg-sunken px-1">
              supabase/public-menu.sql
            </code>{" "}
            so guests can read the menu.
          </p>
        </div>
      ) : tabs.length === 0 ? (
        <div className="menu-rise menu-rise-delay-3 mt-10 rounded-2xl border border-line bg-raised px-5 py-8 text-center">
          <p className="menu-display text-2xl">The counter is being set</p>
          <p className="mt-2 text-sm text-muted">
            Nothing is out right now. Check back in a minute.
          </p>
        </div>
      ) : (
        <div className="menu-rise menu-rise-delay-3 relative mt-12">
          <MenuTabs tabs={tabs} />
        </div>
      )}

      <footer className="menu-rise relative mt-14 border-t border-line pt-6 text-center">
        <p className="menu-display text-xl">Order at the window</p>
        <p className="mt-2 text-sm text-muted">
          This page is view-only. Tell the cashier what you want.
        </p>
        <p className="menu-accent mt-4 text-base text-accent">
          Carried from Cairo, with love.
        </p>
      </footer>
    </main>
  );
}
