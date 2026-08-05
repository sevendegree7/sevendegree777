import { afterEach, describe, expect, it, vi } from "vitest";

import { isValidOrderId, newOrderId } from "./order-id";

// this guard sits in front of an insert where the browser chooses the primary
// key, so the interesting cases are the malformed ones.
describe("isValidOrderId", () => {
  it("accepts what crypto.randomUUID() produces", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(isValidOrderId(crypto.randomUUID())).toBe(true);
    }
  });

  it("accepts the ids the tablet has actually produced", () => {
    expect(isValidOrderId("b1cec0bb-3f10-4d85-b954-c051c2d6fce5")).toBe(true);
  });

  it("does not care about case", () => {
    expect(isValidOrderId("B1CEC0BB-3F10-4D85-B954-C051C2D6FCE5")).toBe(true);
  });

  it("refuses anything that is not a uuid", () => {
    for (const value of [
      "",
      " ",
      "not-a-uuid",
      "12345",
      // right shape, wrong characters
      "gggggggg-3f10-4d85-b954-c051c2d6fce5",
      // too short and too long
      "b1cec0bb-3f10-4d85-b954-c051c2d6fce",
      "b1cec0bb-3f10-4d85-b954-c051c2d6fce55",
      // no dashes
      "b1cec0bb3f104d85b954c051c2d6fce5",
    ]) {
      expect(isValidOrderId(value), value).toBe(false);
    }
  });

  it("refuses a uuid with anything appended or prepended", () => {
    expect(isValidOrderId("b1cec0bb-3f10-4d85-b954-c051c2d6fce5 ")).toBe(false);
    expect(
      isValidOrderId("b1cec0bb-3f10-4d85-b954-c051c2d6fce5'; drop table"),
    ).toBe(false);
    expect(
      isValidOrderId("\nb1cec0bb-3f10-4d85-b954-c051c2d6fce5"),
    ).toBe(false);
  });
});

// the till is opened over plain http on the truck's own network, where
// randomUUID is not defined at all. every branch has to produce an id the
// guard above accepts, or the cashier cannot ring anything up.
describe("newOrderId", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("produces valid ids from randomUUID", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(isValidOrderId(newOrderId())).toBe(true);
    }
  });

  it("produces valid ids when only getRandomValues exists", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        for (let i = 0; i < bytes.length; i += 1) {
          bytes[i] = i * 11;
        }
        return bytes;
      },
    });

    const ids = new Set<string>();

    for (let i = 0; i < 50; i += 1) {
      const id = newOrderId();
      expect(isValidOrderId(id)).toBe(true);
      ids.add(id);
    }

    // version 4 and variant bits are forced even when the bytes are not random
    expect([...ids][0]?.[14]).toBe("4");
    expect("89ab").toContain([...ids][0]?.[19]);
  });

  it("produces valid unique ids with no crypto at all", () => {
    vi.stubGlobal("crypto", undefined);

    const ids = new Set<string>();

    for (let i = 0; i < 200; i += 1) {
      const id = newOrderId();
      expect(isValidOrderId(id)).toBe(true);
      ids.add(id);
    }

    expect(ids.size).toBe(200);
  });
});
