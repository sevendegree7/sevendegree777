"use client";

import type { CheckoutLine } from "@/app/pos/actions";
import { checkConnection, setPendingSync } from "@/lib/connection/use-connection";
import {
  NEXT_STATUS,
  isKitchenStatus,
  type KitchenOrder,
} from "@/lib/kds/orders";
import type { OrderStatus } from "@/types/database.types";

import { getCloudSource } from "./index";
import {
  listLocalOrders,
  readLocalOrder,
  removeLocalOrder,
  updateLocalOrder,
  type LocalOrder,
} from "./order-store";

// the sync worker: the sales this tablet took with no internet, sent to
// supabase once there is a connection again.
//
// it decides nothing about the sale. it replays the checkout through the same
// server action the till uses, so the server prices it from the db and stamps
// the user exactly like an online sale - the tablet only says which products,
// how many, and which extras. `orders.client_id` is what makes that replay
// safe: the same checkout arriving twice returns the first order instead of
// charging the customer again, which is also why two tabs both running this
// cannot double a sale.

export type SyncRun = {
  // sales that reached supabase and left the tablet
  uploaded: number;
  // sales the server refused. they stay on the tablet, with the reason.
  failed: number;
  // the connection went away mid-run. what is left is still waiting.
  stopped: boolean;
};

// how far along the pipeline a status is. only used to know when the uploaded
// order has caught up with what the tablet already recorded.
const RANK: Record<OrderStatus, number> = {
  pending: 0,
  preparing: 1,
  ready: 2,
  completed: 3,
  // not a step on the way anywhere - `catchUp` deals with it before the walk
  // starts. it sits above the rest so that if it ever did reach the loop, the
  // loop would refuse to walk a cancelled ticket forward.
  cancelled: 4,
};

// pending -> preparing -> ready -> completed
const MAX_HOPS = 3;

// the stored ticket, back in the shape a checkout is sent in
function toLines(order: KitchenOrder): CheckoutLine[] | null {
  const lines: CheckoutLine[] = [];

  for (const item of order.items) {
    // every line written offline has one. this is the type guard, not a case
    // the till can actually produce.
    if (!item.product_id) {
      return null;
    }

    lines.push({
      productId: item.product_id,
      quantity: item.quantity,
      modifierIds: item.selected_modifiers.map((modifier) => modifier.id),
      notes: item.notes,
    });
  }

  return lines;
}

function noteFailure(clientId: string, message: string) {
  updateLocalOrder(clientId, (current) => ({ ...current, syncError: message }));
}

// `createOrder` always inserts a pending order, so a ticket the kitchen
// already started has to be walked to where it really is. one hop at a time
// through the same server action a kitchen tap uses, so a move the kitchen is
// not allowed to make is not allowed here either.
//
// returns null when it landed, or the reason it did not.
async function catchUp(
  orderId: string,
  target: OrderStatus,
): Promise<string | null> {
  // cancelled is not a step along the pipeline, so it is not walked to - it is
  // one move off it. that move is also the thing that gives back the stock the
  // upload just pulled, which is why this cannot be left to the loop below.
  if (target === "cancelled") {
    const result = await getCloudSource().moveStatus({
      orderId,
      from: "pending",
      to: "cancelled",
    });

    if (!result.ok) {
      return result.message;
    }

    // a kitchen screen got to the fresh upload before this did. say so rather
    // than report a cancel that did not happen - the stock is still out.
    return result.status === "cancelled"
      ? null
      : `the sale went up, but the ticket is on ${result.status} and was not cancelled`;
  }

  let current: OrderStatus = "pending";

  for (let hop = 0; hop < MAX_HOPS && RANK[current] < RANK[target]; hop += 1) {
    if (!isKitchenStatus(current)) {
      break;
    }

    const result = await getCloudSource().moveStatus({
      orderId,
      from: current,
      to: NEXT_STATUS[current],
    });

    if (!result.ok) {
      return result.message;
    }

    // the answer says where the ticket actually is, which may be further
    // along already if a kitchen screen got there first
    current = result.status;
  }

  return RANK[current] >= RANK[target]
    ? null
    : `the sale went up, but the kitchen ticket stayed on ${current}`;
}

// one sale: upload it if it is not up yet, put the cloud copy on the status
// this tablet has, then let go of the local record.
async function pushOne(record: LocalOrder, clientId: string): Promise<boolean> {
  let orderId = record.syncedOrderId;

  // a sale cancelled on the tablet before it ever went up never reached the
  // server at all: no row to cancel, no stock to return, no money to account
  // for. uploading it now would create a pending ticket, pull the ingredients
  // for it, and then have to cancel itself - so let it go instead.
  if (orderId === null && record.order.status === "cancelled") {
    removeLocalOrder(clientId);
    return true;
  }

  if (orderId === null) {
    const lines = toLines(record.order);

    if (!lines) {
      noteFailure(
        clientId,
        "this sale is missing a product id, so it cannot be uploaded.",
      );
      return false;
    }

    const result = await getCloudSource().submitOrder({
      clientId,
      // go up under the id this tablet already gave it. the kitchen has been
      // looking at that number since the sale was rung up, so it should not
      // change just because the internet came back.
      orderId: record.order.id,
      orderType: record.order.order_type,
      // the local source only ever takes cash, but send what was stored
      paymentMethod: record.order.payment_method ?? "cash",
      notes: record.order.notes,
      lines,
    });

    if (!result.ok) {
      noteFailure(clientId, result.message);
      return false;
    }

    orderId = result.orderId;

    // write the cloud id down before anything else can go wrong. from this
    // moment the money is in supabase, and the record must never be treated
    // as un-uploaded again.
    const uploadedId = orderId;

    updateLocalOrder(clientId, (current) => ({
      ...current,
      syncedOrderId: uploadedId,
      syncError: null,
    }));
  }

  // the kitchen can move the ticket while it is being uploaded, so the target
  // is re-read here instead of taken from the copy this run started with
  const target = readLocalOrder(clientId)?.order.status ?? record.order.status;
  const failure = await catchUp(orderId, target);

  if (failure) {
    noteFailure(clientId, failure);
    return false;
  }

  // the cloud copy is the real one now, and every screen can see it. a move
  // made during that last round trip is the one thing this can lose, and it
  // costs the kitchen one more tap on a ticket that is already safe.
  removeLocalOrder(clientId);

  return true;
}

async function run(): Promise<SyncRun> {
  // everything still on the tablet: sales not uploaded yet, and any whose
  // status could not be set last time round
  const waiting = listLocalOrders();

  let uploaded = 0;
  let failed = 0;
  let stopped = false;
  let remaining = waiting.length;

  setPendingSync(remaining);

  try {
    for (const record of waiting) {
      const clientId = record.order.client_id;

      if (clientId) {
        try {
          if (await pushOne(record, clientId)) {
            uploaded += 1;
          } else {
            failed += 1;
          }
        } catch {
          // the request never came back. what is left is still on the tablet,
          // and the same client_id makes the next attempt safe, so stop here
          // instead of throwing the rest at a dead connection.
          stopped = true;
          void checkConnection();
          break;
        }
      }

      remaining -= 1;
      setPendingSync(remaining);
    }
  } finally {
    // the banner says "syncing orders..." while this is above zero. a sale the
    // server refused is not syncing - the till says that part in words.
    setPendingSync(0);
  }

  return { uploaded, failed, stopped };
}

let running: Promise<SyncRun> | null = null;

// uploads every sale waiting on this tablet.
//
// safe to call from anywhere: one run at a time per tab, and a second call
// while one is going gets that same run instead of a second pass.
export function syncPendingOrders(): Promise<SyncRun> {
  if (running) {
    return running;
  }

  running = run().finally(() => {
    running = null;
  });

  return running;
}
