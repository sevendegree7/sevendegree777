"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { ConnectionBanner } from "@/components/connection-banner";
import { OfflineSync } from "@/components/offline-sync";
import { checkConnection, useConnection } from "@/lib/connection/use-connection";
import type { TranslationKey } from "@/lib/i18n/dictionary";
import { useTranslate } from "@/lib/i18n/use-language";
import { getDataSource, type MenuSnapshot } from "@/lib/data";
import { ticketNumber, type KitchenOrder } from "@/lib/kds/orders";
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
import { cartLinesFromOrder } from "@/lib/pos/edit-order";
import { formatMoney } from "@/lib/pos/money";
import { newOrderId } from "@/lib/pos/order-id";
import {
  boxContentsSignature,
  isBoxProduct,
} from "@/lib/pos/box";
import { groupModifiersByProduct } from "@/lib/pos/modifiers";
import { buildReceipt, type Receipt } from "@/lib/pos/receipt";
import type { ShiftReport } from "@/lib/pos/shift-report";
import { readTaxSettings } from "@/lib/pos/tax";
import { primeTicketCounter } from "@/lib/pos/ticket-counter";
import type {
  AppSettings,
  BoxContent,
  DiscountKind,
  OrderType,
  PaymentMethod,
  Product,
  SelectedModifier,
  Shift,
} from "@/types/database.types";

import { type CheckoutLine } from "./actions";
import { currentShift } from "./shift-actions";
import { CartPanel } from "./components/cart-panel";
import { BoxBuilderModal } from "./components/box-builder-modal";
import { CategoryTabs } from "./components/category-tabs";
import { ConfirmDialog } from "./components/confirm-dialog";
import { ModifierModal } from "./components/modifier-modal";
import { OrderHistory } from "./components/order-history";
import { ProductGrid } from "./components/product-grid";
import { ReceiptView } from "./components/receipt-view";
import { ShiftBar } from "./components/shift-bar";

type PosScreenProps = {
  // read on the server for a fast first paint. null means that read failed,
  // and the screen asks the data source for the menu itself.
  initialMenu: MenuSnapshot | null;
  initialSettings: AppSettings;
  initialTicketDate: string | null;
  initialTicketNumber: number;
  // the signed-in cashier, for the offline receipt only. an online sale gets
  // this name stamped on the server from the session's own profile.
  cashierName: string | null;
  // whether this account may void or edit a sale that has already been rung.
  // admin only - a cashier who can cancel their own sale can pocket the cash.
  // the server enforces it too; this only keeps the buttons off their screen.
  canVoid: boolean;
  // the drawer that is currently open, if any. null is the normal state first
  // thing in the morning, and also what a till with no shifts table answers.
  initialShift: Shift | null;
  initialShiftReport: ShiftReport | null;
};

// the message under the header.
//
// it holds a dictionary key rather than a finished sentence, so switching the
// till to arabic re-reads the last message instead of leaving english on the
// screen. server actions word their own errors and arrive as `text`.
type Feedback =
  | {
      kind: "success" | "error";
      key?: TranslationKey;
      values?: Record<string, string | number>;
      text?: string;
    }
  | null;

// how old a menu can be before we go and read it again. it only matters after
// a spell offline: a tablet that just sat there keeps whatever it had.
const MENU_MAX_AGE_MS = 5 * 60 * 1000;

export function PosScreen({
  initialMenu,
  initialSettings,
  initialTicketDate,
  initialTicketNumber,
  cashierName,
  canVoid,
  initialShift,
  initialShiftReport,
}: PosScreenProps) {
  // the tax rule as the server last handed it over. read once here rather than
  // in the cart, so the ticket the cashier reads out and the sale that gets
  // written are working off the same numbers.
  const taxSettings = useMemo(
    () => readTaxSettings(initialSettings),
    [initialSettings],
  );

  const [menu, setMenu] = useState<MenuSnapshot | null>(initialMenu);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [menuAttempt, setMenuAttempt] = useState(0);

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [boxProduct, setBoxProduct] = useState<Product | null>(null);
  const [orderType, setOrderType] = useState<OrderType>("takeaway");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [orderNotes, setOrderNotes] = useState("");
  // both optional, and never validated. a required field during a rush is a
  // column full of "-", and no sale is ever worth blocking for a phone number.
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discountKind, setDiscountKind] = useState<DiscountKind | null>(null);
  const [discountValue, setDiscountValue] = useState("");
  const [isDiyafa, setIsDiyafa] = useState(false);
  const [diyafaReason, setDiyafaReason] = useState("");
  const [shift, setShift] = useState<Shift | null>(initialShift);
  const [shiftReport, setShiftReport] = useState<ShiftReport | null>(
    initialShiftReport,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // the sale being corrected. the old ticket is not touched until the new one
  // is confirmed - backing out of an edit costs the customer nothing.
  const [editing, setEditing] = useState<{
    orderId: string;
    ticket: string;
  } | null>(null);
  // the ticket to print. shown after an edit, where the customer is holding a
  // piece of paper that has just stopped being valid.
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  // new seed after every sale that lands, so two identical carts in a row are
  // two orders. it survives a failed attempt, which is what makes a retry safe.
  const [saleSeed, setSaleSeed] = useState(() => newOrderId());
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [submitting, startSubmit] = useTransition();
  // useTransition's flag flips a beat late on a double tap. this ref closes
  // the door the moment Pay is pressed, so a second confirm cannot start.
  const checkoutLock = useRef(false);

  const { t } = useTranslate();

  // sales taken with no internet that supabase has not seen yet
  const waitingSales = useUnsyncedSales();
  const uploadError = useUploadError();
  const connection = useConnection();
  const offline = connection === "offline";

  useEffect(() => {
    if (initialTicketDate) {
      primeTicketCounter(initialTicketDate, initialTicketNumber);
    }
  }, [initialTicketDate, initialTicketNumber]);

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

  // extras grouped once so tapping a product is instant.
  //
  // a null product_id is a shared extra and is copied into every product's
  // list. non-null rows remain supported for any product-only option.
  const modifiersByProduct = useMemo(() => {
    return groupModifiersByProduct(
      menu?.products ?? [],
      menu?.modifiers ?? [],
    );
  }, [menu]);

  // only tabs the cashier can actually sell from.
  //
  // a retired category is filtered out even if something is still sitting in it,
  // and an active one with nothing on sale is dropped too - the old bakery
  // categories are both, and a tab that only ever says "nothing to sell here"
  // is a tab that gets pressed by mistake during a rush.
  const sellableCategories = useMemo(() => {
    const stocked = new Set(
      (menu?.products ?? []).map((product) => product.category_id),
    );

    return (menu?.categories ?? []).filter(
      (category) => category.is_active !== false && stocked.has(category.id),
    );
  }, [menu]);

  // a category the cashier had selected can disappear under them when admin
  // retires it and the menu refetches. fall back to showing everything rather
  // than an empty grid with no obvious way out.
  const shownCategoryId =
    activeCategoryId !== null &&
    sellableCategories.some((category) => category.id === activeCategoryId)
      ? activeCategoryId
      : null;

  const visibleProducts = useMemo(() => {
    const products = menu?.products ?? [];

    return shownCategoryId === null
      ? products
      : products.filter((product) => product.category_id === shownCategoryId);
  }, [menu, shownCategoryId]);

  // cuisine colour per category, kept as a fallback for products seeded before
  // the colour moved onto the product itself
  const colourByCategory = useMemo(() => {
    const colours = new Map<string, string>();

    for (const category of menu?.categories ?? []) {
      if (category.color) {
        colours.set(category.id, category.color);
      }
    }

    return colours;
  }, [menu]);

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
        discountKind,
        discountValue: Number(discountValue) || 0,
        isDiyafa,
        diyafaReason,
        customerName,
        customerPhone,
      })}`,
    [
      saleSeed,
      cart,
      orderType,
      paymentMethod,
      orderNotes,
      discountKind,
      discountValue,
      isDiyafa,
      diyafaReason,
      customerName,
      customerPhone,
    ],
  );

  // read the drawer again after a sale lands. the numbers on the bar have moved,
  // and a sale rung with no shift open will have opened one on the server.
  // failing quietly is right: the running total is a convenience, not the sale.
  async function refreshShift() {
    try {
      const next = await currentShift();
      setShift(next.shift);
      setShiftReport(next.report);
    } catch {
      // offline, or no shifts table yet. the bar keeps what it had.
    }
  }

  function addToCart(
    product: Product,
    selectedModifiers: SelectedModifier[],
    quantity: number,
    notes: string | null,
    boxContents: BoxContent[] = [],
  ) {
    setFeedback(null);
    setCart((current) => {
      const signature = modifierSignature(selectedModifiers);
      const boxSignature = boxContentsSignature(boxContents);
      const matchIndex = current.findIndex(
        (line) =>
          line.productId === product.id &&
          modifierSignature(line.selectedModifiers) === signature &&
          boxContentsSignature(line.boxContents) === boxSignature &&
          (line.notes ?? "") === (notes ?? ""),
      );

      // same product with the same extras, pack and note just bumps quantity
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
          lineId: newOrderId(),
          productId: product.id,
          productName: product.name,
          basePrice: Number(product.base_price),
          quantity,
          selectedModifiers,
          boxContents,
          notes,
        },
      ];
    });
  }

  function onProductSelect(product: Product) {
    if (isBoxProduct(product)) {
      setBoxProduct(product);
      return;
    }

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

  // hands a sale that was already rung up back to the cashier as a cart.
  // nothing has happened to the old ticket at this point - it is still live on
  // the kitchen screen, and stays live if the cashier backs out.
  function startEdit(order: KitchenOrder) {
    const lines = cartLinesFromOrder(order);

    if (!lines) {
      setHistoryOpen(false);
      setFeedback({ kind: "error", key: "pos.editUnavailable" });
      return;
    }

    setCart(lines);
    setOrderType(order.order_type);
    setPaymentMethod(order.payment_method ?? "cash");
    setOrderNotes(order.notes ?? "");
    // the customer's details came with the original sale and belong to the
    // corrected one too - retyping them is how they get lost
    setCustomerName(order.customer_name ?? "");
    setCustomerPhone(order.customer_phone ?? "");
    setEditing({ orderId: order.id, ticket: ticketNumber(order) });
    // a fresh seed: this is a different sale from the one being replaced, and
    // must not share a checkout id with it
    setSaleSeed(newOrderId());
    setHistoryOpen(false);
    setFeedback(null);
  }

  function cancelEdit() {
    setEditing(null);
    setCart([]);
    setOrderNotes("");
    setCustomerName("");
    setCustomerPhone("");
    setFeedback(null);
  }

  function openConfirm() {
    if (cart.length === 0 || checkoutLock.current || submitting) {
      return;
    }

    if (isDiyafa && !diyafaReason.trim()) {
      setFeedback({ kind: "error", text: t("cart.diyafaReasonNeeded") });
      return;
    }

    if (paymentMethod === "agel" && !isDiyafa && !customerName.trim()) {
      setFeedback({ kind: "error", text: t("cart.agelNameNeeded") });
      return;
    }

    setFeedback(null);
    setConfirmOpen(true);
  }

  function submitOrder() {
    if (checkoutLock.current || submitting) {
      return;
    }

    checkoutLock.current = true;

    const lines: CheckoutLine[] = cart.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      modifierIds: line.selectedModifiers.map((modifier) => modifier.id),
      boxContents: line.boxContents,
      notes: line.notes,
    }));

    const discountNumber = Number(discountValue);

    startSubmit(async () => {
      // read once, before the await. the connection can flip while the sale is
      // in flight, and the message has to describe where it actually went.
      const source = getDataSource();

      const checkout = {
        clientId: checkoutId,
        orderType,
        paymentMethod,
        notes: orderNotes.trim() ? orderNotes.trim() : null,
        kdsEnabled: initialSettings.kds_enabled,
        cashierName,
        // local-only, like the two above. the server re-reads the rule from
        // app_settings and ignores this - it is here so a sale rung with no
        // internet still charges and prints the same tax as one with.
        taxSettings,
        customerName: customerName.trim() ? customerName.trim() : null,
        customerPhone: customerPhone.trim() ? customerPhone.trim() : null,
        discountKind: isDiyafa ? null : discountKind,
        discountValue:
          !isDiyafa &&
          discountKind &&
          Number.isFinite(discountNumber) &&
          discountNumber > 0
            ? discountNumber
            : null,
        isDiyafa,
        diyafaReason: isDiyafa ? diyafaReason.trim() : null,
        lines,
      };

      try {
        // an edit is one call, not two: the server puts the new sale in and
        // voids the old ticket, so the browser cannot end up having done half
        // of it and then lost the connection.
        const result = editing
          ? await source.replaceOrder({
              ...checkout,
              replacesOrderId: editing.orderId,
            })
          : await source.submitOrder(checkout);

        if (!result.ok) {
          checkoutLock.current = false;
          setConfirmOpen(false);
          setFeedback({ kind: "error", text: result.message });
          return;
        }

        // only an edit answers with these two
        const replaced =
          "replaced" in result && typeof result.replaced === "string"
            ? result.replaced
            : null;
        const warning =
          "warning" in result && typeof result.warning === "string"
            ? result.warning
            : null;

        setCart([]);
        setOrderNotes("");
        setCustomerName("");
        setCustomerPhone("");
        setDiscountKind(null);
        setDiscountValue("");
        setIsDiyafa(false);
        setDiyafaReason("");
        setConfirmOpen(false);
        setEditing(null);
        setSaleSeed(newOrderId());
        checkoutLock.current = false;
        primeTicketCounter(result.ticketDate, result.ticketNumber);
        void refreshShift();
        setFeedback(
          warning
            ? { kind: "error", text: warning }
            : {
                kind: "success",
                key: replaced
                  ? "pos.saleReplaced"
                  : source.kind === "local"
                    ? "pos.saleOnTablet"
                    : initialSettings.kds_enabled
                      ? "pos.saleToKitchen"
                      : "pos.saleCompleted",
                values: {
                  ticket: result.ticketNumber,
                  replaced: replaced ?? "",
                  total: formatMoney(result.total),
                },
              },
        );

        // the corrected sale gets a fresh receipt, read back from the server so
        // the paper shows the prices that were actually charged rather than the
        // ones the browser was holding. print can fail; the sale stays and the
        // cashier reprints from history.
        {
          const reread = await source.loadKitchenOrder(result.orderId);

          if (reread.data) {
            setReceipt(buildReceipt(reread.data, { replaces: replaced }));
          }
        }
      } catch {
        // the request never came back, so we do not know if the order landed.
        // the cart is kept exactly as it is: pressing pay again sends the same
        // client_id, so the db returns that first order instead of a second one.
        checkoutLock.current = false;
        setConfirmOpen(false);
        setFeedback({ kind: "error", key: "pos.unreachable" });
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
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="rounded-full border border-line bg-raised px-3 py-1 text-sm"
          >
            {t("pos.orders")}
          </button>
          {offline ? (
            <span className="text-sm text-muted">{t("pos.offlineSaved")}</span>
          ) : null}
          {waitingSales > 0 ? (
            <span className="rounded-full bg-warn/15 px-3 py-1 text-sm text-warn">
              {waitingSales === 1
                ? t("pos.oneSaleWaiting")
                : t("pos.salesWaiting", { count: waitingSales })}
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
              className="rounded-full border border-warn px-3 py-1 text-sm text-warn disabled:opacity-50"
            >
              {connection === "syncing"
                ? t("pos.uploading")
                : t("pos.uploadNow")}
            </button>
          ) : null}
          {uploadError ? (
            <span className="rounded-full bg-danger/15 px-3 py-1 text-sm text-danger">
              {t("pos.uploadProblem", { message: uploadError })}
            </span>
          ) : null}
        </div>

        <ShiftBar
          shift={shift}
          report={shiftReport}
          offline={offline}
          onChanged={(next) => {
            setShift(next.shift);
            setShiftReport(next.report);
          }}
        />

        {editing ? (
          // the cart looks exactly like a normal sale, so the one thing that
          // makes this different has to be impossible to miss
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-info/15 px-4 py-3 text-sm text-info">
            <span>{t("pos.editingTicket", { ticket: editing.ticket })}</span>
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-full border border-info px-3 py-1"
            >
              {t("pos.leaveItAlone")}
            </button>
          </div>
        ) : null}

        {feedback ? (
          <p
            className={`rounded-xl px-4 py-3 text-sm ${
              feedback.kind === "success"
                ? "bg-ok/15 text-ok"
                : "bg-danger/15 text-danger"
            }`}
          >
            {feedback.key ? t(feedback.key, feedback.values) : feedback.text}
          </p>
        ) : null}

        {menu === null ? (
          <div className="rounded-2xl border border-line bg-raised p-6">
            <h2 className="font-display text-xl font-medium">
              {menuError ? t("pos.menuFailed") : t("pos.menuLoading")}
            </h2>

            {menuError ? (
              <>
                <p className="mt-2 text-muted">{menuError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setMenuError(null);
                    setMenuAttempt((count) => count + 1);
                  }}
                  className="mt-4 rounded-xl border border-line px-4 py-2 text-sm"
                >
                  {t("pos.tryAgain")}
                </button>
              </>
            ) : null}
          </div>
        ) : (
          <>
            <CategoryTabs
              categories={sellableCategories}
              activeCategoryId={shownCategoryId}
              onSelect={setActiveCategoryId}
            />

            <ProductGrid
              products={visibleProducts}
              hasModifiers={(productId) => {
                const product = menu.products.find(
                  (candidate) => candidate.id === productId,
                );
                return Boolean(
                  product &&
                    (isBoxProduct(product) ||
                      modifiersByProduct.has(productId)),
                );
              }}
              // the product's own cuisine colour wins. the category colour is
              // only a fallback for rows seeded before the colour moved.
              colourOf={(product) =>
                product.color ??
                (product.category_id
                  ? (colourByCategory.get(product.category_id) ?? null)
                  : null)
              }
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
          customerName={customerName}
          customerPhone={customerPhone}
          discountKind={discountKind}
          discountValue={discountValue}
          isDiyafa={isDiyafa}
          diyafaReason={diyafaReason}
          tax={taxSettings}
          submitting={submitting}
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
          onCustomerNameChange={setCustomerName}
          onCustomerPhoneChange={setCustomerPhone}
          onDiscountKindChange={setDiscountKind}
          onDiscountValueChange={setDiscountValue}
          onDiyafaChange={setIsDiyafa}
          onDiyafaReasonChange={setDiyafaReason}
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

      {boxProduct ? (
        <BoxBuilderModal
          product={boxProduct}
          flavors={(menu?.products ?? []).filter(
            (candidate) =>
              candidate.category_id === boxProduct.contents_category_id &&
              !isBoxProduct(candidate),
          )}
          modifiers={modifiersByProduct.get(boxProduct.id) ?? []}
          onCancel={() => setBoxProduct(null)}
          onAdd={(boxContents, selectedModifiers, quantity, notes) => {
            addToCart(
              boxProduct,
              selectedModifiers,
              quantity,
              notes,
              boxContents,
            );
            setBoxProduct(null);
          }}
        />
      ) : null}

      {historyOpen ? (
        <OrderHistory
          onClose={() => setHistoryOpen(false)}
          onEdit={startEdit}
          offline={offline}
          canVoid={canVoid}
        />
      ) : null}

      {receipt ? (
        <ReceiptView
          receipt={receipt}
          copies={initialSettings.receipt_copies}
          onClose={() => setReceipt(null)}
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
