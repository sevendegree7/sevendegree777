import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/pos/money";
import type { Category, Modifier, Product } from "@/types/database.types";

// refresh often so sold-out toggles show up for qr guests
export const revalidate = 30;

type MenuCategory = Category & {
  products: (Product & { modifiers: Modifier[] })[];
};

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

  const modifiersByProduct = new Map<string, Modifier[]>();
  for (const modifier of modifiers) {
    const list = modifiersByProduct.get(modifier.product_id) ?? [];
    list.push(modifier);
    modifiersByProduct.set(modifier.product_id, list);
  }

  const menu: MenuCategory[] = categories
    .map((category) => ({
      ...category,
      products: products
        .filter((product) => product.category_id === category.id)
        .map((product) => ({
          ...product,
          modifiers: modifiersByProduct.get(product.id) ?? [],
        })),
    }))
    .filter((category) => category.products.length > 0);

  const updatedLabel = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <main className="relative mx-auto min-h-screen w-full max-w-lg px-5 pb-16 pt-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-40"
        style={{
          backgroundImage:
            "repeating-linear-gradient(-12deg, transparent, transparent 12px, rgba(42,23,16,0.03) 12px, rgba(42,23,16,0.03) 13px)",
        }}
      />

      <header className="menu-rise relative text-center">
        <p className="text-xs font-medium uppercase tracking-[0.35em] text-[var(--menu-muted)]">
          bakery · food truck
        </p>
        <h1 className="menu-display mt-3 text-5xl font-semibold leading-none tracking-tight text-[var(--menu-ink)] sm:text-6xl">
          seven degree
        </h1>
        <p className="menu-rise menu-rise-delay-1 mx-auto mt-4 max-w-sm text-base text-[var(--menu-muted)]">
          what&apos;s available right now — prices update live from the truck.
        </p>
        <p className="menu-rise menu-rise-delay-2 mt-3 text-xs text-[var(--menu-muted)]">
          refreshed · {updatedLabel}
        </p>
      </header>

      {loadError ? (
        <div className="menu-rise menu-rise-delay-3 mt-10 rounded-3xl bg-[var(--menu-cream)]/80 px-5 py-6 text-sm text-[var(--menu-ink)] shadow-sm ring-1 ring-[var(--menu-line)]">
          <p className="font-medium">menu could not load</p>
          <p className="mt-2 text-[var(--menu-muted)]">{loadError.message}</p>
          <p className="mt-3 text-xs text-[var(--menu-muted)]">
            if this is a fresh setup, run{" "}
            <code className="rounded bg-black/5 px-1">supabase/public-menu.sql</code>{" "}
            so guests can read the menu.
          </p>
        </div>
      ) : menu.length === 0 ? (
        <div className="menu-rise menu-rise-delay-3 mt-10 rounded-3xl bg-[var(--menu-cream)]/80 px-5 py-8 text-center shadow-sm ring-1 ring-[var(--menu-line)]">
          <p className="menu-display text-2xl">kitchen is resetting the board</p>
          <p className="mt-2 text-sm text-[var(--menu-muted)]">
            no items are marked available right now. check back in a minute.
          </p>
        </div>
      ) : (
        <div className="menu-rise menu-rise-delay-3 relative mt-10 space-y-10">
          {menu.map((category, index) => (
            <section
              key={category.id}
              className="menu-rise"
              style={{ animationDelay: `${0.2 + index * 0.06}s` }}
            >
              <div className="mb-4 flex items-end justify-between gap-3 border-b border-[var(--menu-line)] pb-2">
                <h2 className="menu-display text-2xl font-semibold capitalize tracking-tight">
                  {category.name}
                </h2>
                <span
                  className="mb-1 h-2 w-2 rounded-full"
                  style={{ backgroundColor: category.color ?? "var(--menu-accent)" }}
                  aria-hidden
                />
              </div>

              <ul className="space-y-5">
                {category.products.map((product) => (
                  <li key={product.id} className="group">
                    <div className="flex items-baseline justify-between gap-4">
                      <h3 className="text-lg font-medium leading-snug capitalize">
                        {product.name}
                      </h3>
                      <span className="shrink-0 text-base font-semibold tabular-nums text-[var(--menu-accent)]">
                        {formatMoney(Number(product.base_price))}
                      </span>
                    </div>

                    {product.modifiers.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {product.modifiers.map((modifier) => (
                          <li
                            key={modifier.id}
                            className="flex justify-between gap-3 text-sm text-[var(--menu-muted)]"
                          >
                            <span className="capitalize">{modifier.name}</span>
                            <span className="tabular-nums">
                              {Number(modifier.extra_price) > 0
                                ? `+ ${formatMoney(Number(modifier.extra_price))}`
                                : "no charge"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <footer className="menu-rise relative mt-14 border-t border-[var(--menu-line)] pt-6 text-center">
        <p className="menu-display text-xl text-[var(--menu-ink)]">
          order at the window
        </p>
        <p className="mt-2 text-sm text-[var(--menu-muted)]">
          this page is view-only. tell the cashier what you want.
        </p>
      </footer>
    </main>
  );
}
