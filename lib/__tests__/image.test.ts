import { describe, expect, it } from "vitest";
import { fitWithin } from "../image";

describe("fitWithin", () => {
  it("shrinks the longest side to the maximum and keeps the shape", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1500, height: 2000 });
  });

  it("never enlarges a small photo", () => {
    expect(fitWithin(1200, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it("keeps at least one pixel", () => {
    expect(fitWithin(10000, 1, 2000)).toEqual({ width: 2000, height: 1 });
  });
});
