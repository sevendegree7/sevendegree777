"use client";

import { useMemo, useState, useTransition } from "react";

import { ConnectionBanner } from "@/components/connection-banner";
import { checkConnection, useConnection } from "@/lib/connection/use-connection";
import {
  cartTotal,
  modifierSignature,
  saleSignature,
  type CartLine,
} from "@/lib/pos/cart";
import { formatMoney } from "@/lib/pos/money";
import type {
  Category,
  Modifier,
  OrderType,
  PaymentMethod,
  Product,
  SelectedModifier,
} from "@/types/database.types";

import { createOrder, type CheckoutLine } from "./actions";
import { CartPanel } from "./components/cart-panel";
import { CategoryTabs } from "./components/category-tabs";
import { ConfirmDialog } from "./components/confirm-dialog";
import { ModifierModal } from "./components/modifier-modal";
import { ProductGrid } from "./components/product-grid";

type PosScreenProps = {
  categories: Category[];
  products: Product[];
  modifiers: Modifier[];
};

type Feedback = { kind: "success" | "error"; text: string } | null;

export function PosScreen({ categories, products, modifiers }: PosScreenProps) {
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

  const connection = useConnection();
  const offline = connection === "offline";
  // card and instapay need the terminal / the app on the phone, both online
  const paymentBlocked =
    offline && (paymentMethod === "card" || paymentMethod === "instapay");

  // modifiers grouped once so tapping a product is instant
  const modifiersByProduct = useMemo(() => {
    const grouped = new Map<string, Modifier[]>();

    for (const modifier of modifiers) {
      const existing = grouped.get(modifier.product_id);
      if (existing) {
        existing.push(modifier);
      } else {
        grouped.set(modifier.product_id, [modifier]);
      }
    }

    return grouped;
  }, [modifiers]);

  const visibleProducts = useMemo(
    () =>
      activeCategoryId === null
        ? products
        : products.filter((product) => product.category_id === activeCategoryId),
    [products, activeCategoryId],
  );

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
      try {
        const result = await createOrder({
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
          text: `order ${result.orderId.slice(0, 8)} sent to kitchen · ${formatMoney(result.total)}`,
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
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <ConnectionBanner />
          {offline ? (
            <span className="text-sm text-stone-600">
              cash only until the connection is back
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

        <CategoryTabs
          categories={categories}
          activeCategoryId={activeCategoryId}
          onSelect={setActiveCategoryId}
        />

        <ProductGrid
          products={visibleProducts}
          hasModifiers={(productId) => modifiersByProduct.has(productId)}
          onSelect={onProductSelect}
        />
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
