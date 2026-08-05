import { describe, expect, it } from "vitest";

import { isValidOrderId } from "./order-id";

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
