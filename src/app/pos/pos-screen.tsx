"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { ConnectionBanner } from "@/components/connection-banner";
import { OfflineSync } from "@/components/offline-sync";
import { checkConnection, useConnection } from "@/lib/connection/use-connection";
import { getDataSource, type MenuSnapshot } from "@/lib/data";
import { writeCachedMenu } from "@/lib/data/menu-cache";
import { syncPendingOrders } from "@/lib/data/sync";
import {
  useUnsyncedSales,
  useUploadError,
} from "@/lib/data/use-unsynced-sales";
import {
  cartTotal,
  modifierSignature,
  saleSignature,
  type CartLine,
} from "@/lib/pos/cart";
import { formatMoney } from "@/lib/pos/money";
import type {
  Modifier,
  OrderType,
  PaymentMethod,
  Product,
  SelectedModifier,
} from "@/types/database.types";

import { type CheckoutLine } from "./actions";
import { CartPanel } from "./components/cart-panel";
import { CategoryTabs } from "./components/category-tabs";
import { ConfirmDialog } from "./components/confirm-dialog";
import { ModifierModal } from "./components/modifier-modal";
import { ProductGrid } from "./components/product-grid";

type PosScreenProps = {
  // read on the server for a fast first paint. null means that read failed,
  // and the screen asks the data source for the menu itself.
  initialMenu: MenuSnapshot | null;
};

type Feedback = { kind: "success" | "error"; text: string } | null;

// how old a menu can be before we go and read it again. it only matters after
// a spell offline: a tablet that just sat there keeps whatever it had.
const MENU_MAX_AGE_MS = 5 * 60 * 1000;

export function PosScreen({ initialMenu }: PosScreenProps) {
  const [menu, setMenu] = useState<MenuSnapshot | null>(initialMenu);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [menuAttempt, setMenuAttempt] = useState(0);

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [orderType, setOrderType] = useState<OrderType>("takeaway");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [orderNotes, setOrderNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  // new seed after every sale that lands, so two identical carts in a row are
  // two orders. it survives a failed attempt, which is what makes a retry safe.
  const [saleSeed, setSaleSeed] = useState(() => crypto.randomUUID());
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [submitting, startSubmit] = useTransition();

  // sales taken with no internet that supabase has not seen yet
  const waitingSales = useUnsyncedSales();
  const uploadError = useUploadError();
  const connection = useConnection();
  const offline = connection === "offline";
  // card and instapay need the terminal / the app on the phone, both online
  const paymentBlocked =
    offline && (paymentMethod === "card" || paymentMethod === "instapay");

  // only runs when the server did not hand us a menu. later this is also the
  // path that serves the cached menu on a tablet with no internet.
  useEffect(() => {
    if (menu) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const result = await getDataSource().loadMenu();

      if (cancelled) {
        return;
      }

      if (result.error !== null) {
        setMenuError(result.error);
        return;
      }

      setMenuError(null);
      setMenu(result.data);
    })();

    return () => {
      cancelled = true;
    };
  }, [menu, menuAttempt]);

  // keep a copy on the device. the fast path is read on the server, which
  // never touches this tablet's storage, so the copy has to be made here.
  useEffect(() => {
    if (menu) {
      writeCachedMenu(menu);
    }
  }, [menu]);

  // the copy we sold from while offline can be days old. once the connection
  // is back, read the real one again.
  useEffect(() => {
    if (connection !== "online" || !menu) {
      return;
    }

    // an unreadable timestamp compares false here, so it counts as old
    if (Date.now() - Date.parse(menu.fetchedAt) < MENU_MAX_AGE_MS) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const result = await getDataSource().loadMenu();

      if (cancelled || result.error !== null) {
        return;
      }

      // only ever move forward. a read that failed hands back the saved copy,
      // and taking that would start this effect over and over.
      if (Date.parse(result.data.fetchedAt) > Date.parse(menu.fetchedAt)) {
        setMenu(result.data);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connection, menu]);

  // modifiers grouped once so tapping a product is instant
  const modifiersByProduct = useMemo(() => {
    const grouped = new Map<string, Modifier[]>();

    for (const modifier of menu?.modifiers ?? []) {
      const existing = grouped.get(modifier.product_id);
      if (existing) {
        existing.push(modifier);
      } else {
        grouped.set(modifier.product_id, [modifier]);
      }
    }

    return grouped;
  }, [menu]);

  const visibleProducts = useMemo(() => {
    const products = menu?.products ?? [];

    return activeCategoryId === null
      ? products
      : products.filter((product) => product.category_id === activeCategoryId);
  }, [menu, activeCategoryId]);

  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const total = cartTotal(cart);

  // same sale, same id. edit anything and the id changes on its own.
  const checkoutId = useMemo(
    () =>
      `${saleSeed}:${saleSignature({
        lines: cart,
        orderType,
        paymentMethod,
        notes: orderNotes,
      })}`,
    [saleSeed, cart, orderType, paymentMethod, orderNotes],
  );

  function addToCart(
    product: Product,
    selectedModifiers: SelectedModifier[],
    quantity: number,
    notes: string | null,
  ) {
    setFeedback(null);
    setCart((current) => {
      const signature = modifierSignature(selectedModifiers);
      const matchIndex = current.findIndex(
        (line) =>
          line.productId === product.id &&
          modifierSignature(line.selectedModifiers) === signature &&
          (line.notes ?? "") === (notes ?? ""),
      );

      // same product with the same extras and note just bumps quantity
      if (matchIndex >= 0) {
        const next = [...current];
        next[matchIndex] = {
          ...next[matchIndex],
          quantity: next[matchIndex].quantity + quantity,
        };
        return next;
      }

      return [
        ...current,
        {
          lineId: crypto.randomUUID(),
          productId: product.id,
          productName: product.name,
          basePrice: Number(product.base_price),
          quantity,
          selectedModifiers,
          notes,
        },
      ];
    });
  }

  function onProductSelect(product: Product) {
    const productModifiers = modifiersByProduct.get(product.id) ?? [];

    // nothing to choose, straight into the cart
    if (productModifiers.length === 0) {
      addToCart(product, [], 1, null);
      return;
    }

    setModalProduct(product);
  }

  function changeQuantity(lineId: string, quantity: number) {
    if (quantity < 1) {
      setCart((current) => current.filter((line) => line.lineId !== lineId));
      return;
    }

    setCart((current) =>
      current.map((line) =>
        line.lineId === lineId ? { ...line, quantity } : line,
      ),
    );
  }

  function openConfirm() {
    if (cart.length === 0 || paymentBlocked) {
      return;
    }

    setFeedback(null);
    setConfirmOpen(true);
  }

  function submitOrder() {
    const lines: CheckoutLine[] = cart.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      modifierIds: line.selectedModifiers.map((modifier) => modifier.id),
      notes: line.notes,
    }));

    startSubmit(async () => {
      // read once, before the await. the connection can flip while the sale is
      // in flight, and the message has to describe where it actually went.
      const source = getDataSource();

      try {
        const result = await source.submitOrder({
          clientId: checkoutId,
          orderType,
          paymentMethod,
          notes: orderNotes.trim() ? orderNotes.trim() : null,
          lines,
        });

        if (!result.ok) {
          setConfirmOpen(false);
          setFeedback({ kind: "error", text: result.message });
          return;
        }

        setCart([]);
        setOrderNotes("");
        setConfirmOpen(false);
        setSaleSeed(crypto.randomUUID());
        setFeedback({
          kind: "success",
          text:
            source.kind === "local"
              ? `order ${result.orderId.slice(0, 8)} saved on this tablet · ${formatMoney(result.total)} · it uploads when the internet is back`
              : `order ${result.orderId.slice(0, 8)} sent to kitchen · ${formatMoney(result.total)}`,
        });
      } catch {
        // the request never came back, so we do not know if the order landed.
        // the cart is kept exactly as it is: pressing pay again sends the same
        // client_id, so the db returns that first order instead of a second one.
        setConfirmOpen(false);
        setFeedback({
          kind: "error",
          text: "could not reach the server. press pay again - the same order cannot be charged twice.",
        });
        void checkConnection();
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_24rem] lg:items-start">
      <OfflineSync />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <ConnectionBanner />
          {offline ? (
            <span className="text-sm text-stone-600">
              cash only. every sale is saved on this tablet.
            </span>
          ) : null}
          {waitingSales > 0 ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-900">
              {waitingSales === 1
                ? "1 sale on this tablet"
                : `${waitingSales} sales on this tablet`}{" "}
              waiting to upload
            </span>
          ) : null}
          {waitingSales > 0 && !offline ? (
            // the worker already runs on its own when the connection returns.
            // this is for the cashier who can see sales waiting and wants them
            // gone now, before the shift is counted.
            <button
              type="button"
              onClick={() => void syncPendingOrders()}
              disabled={connection === "syncing"}
              className="rounded-full border border-amber-300 px-3 py-1 text-sm text-amber-900 disabled:opacity-50"
            >
              {connection === "syncing" ? "uploading..." : "upload now"}
            </button>
          ) : null}
          {uploadError ? (
            <span className="rounded-full bg-red-100 px-3 py-1 text-sm text-red-900">
              upload problem: {uploadError}
            </span>
          ) : null}
        </div>

        {feedback ? (
          <p
            className={`rounded-xl px-4 py-3 text-sm ${
              feedback.kind === "success"
                ? "bg-green-100 text-green-900"
                : "bg-red-100 text-red-900"
            }`}
          >
            {feedback.text}
          </p>
        ) : null}

        {menu === null ? (
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-medium">
              {menuError ? "menu did not load" : "loading the menu..."}
            </h2>

            {menuError ? (
              <>
                <p className="mt-2 text-stone-600">{menuError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setMenuError(null);
                    setMenuAttempt((count) => count + 1);
                  }}
                  className="mt-4 rounded-xl border border-stone-300 px-4 py-2 text-sm"
                >
                  try again
                </button>
              </>
            ) : null}
          </div>
        ) : (
          <>
            <CategoryTabs
              categories={menu.categories}
              activeCategoryId={activeCategoryId}
              onSelect={setActiveCategoryId}
            />

            <ProductGrid
              products={visibleProducts}
              hasModifiers={(productId) => modifiersByProduct.has(productId)}
              onSelect={onProductSelect}
            />
          </>
        )}
      </div>

      <div className="lg:sticky lg:top-6">
        <CartPanel
          lines={cart}
          orderType={orderType}
          paymentMethod={paymentMethod}
          orderNotes={orderNotes}
          submitting={submitting}
          offline={offline}
          paymentBlocked={paymentBlocked}
          onChangeQuantity={changeQuantity}
          onRemove={(lineId) =>
            setCart((current) =>
              current.filter((line) => line.lineId !== lineId),
            )
          }
          onClear={() => setCart([])}
          onOrderTypeChange={setOrderType}
          onPaymentMethodChange={setPaymentMethod}
          onOrderNotesChange={setOrderNotes}
          onCheckout={openConfirm}
        />
      </div>

      {modalProduct ? (
        <ModifierModal
          product={modalProduct}
          modifiers={modifiersByProduct.get(modalProduct.id) ?? []}
          onCancel={() => setModalProduct(null)}
          onAdd={(selectedModifiers, quantity, notes) => {
            addToCart(modalProduct, selectedModifiers, quantity, notes);
            setModalProduct(null);
          }}
        />
      ) : null}

      {confirmOpen ? (
        <ConfirmDialog
          itemCount={itemCount}
          total={total}
          orderType={orderType}
          paymentMethod={paymentMethod}
          submitting={submitting}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={submitOrder}
        />
      ) : null}
    </div>
  );
}
