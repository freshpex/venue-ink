import { describe, expect, it } from "vitest";
import { estimateCosts } from "../src/lib/pricing";
describe("published pricing estimates", () => {
  it("includes subscription with zero volume", () => {
    expect(estimateCosts(0)).toEqual({ solo: 0, soloPro: 50, studioPro: 150 });
  });
  it("calculates the published fees and extra active artists", () => {
    expect(estimateCosts(2000, 7)).toEqual({
      solo: 200,
      soloPro: 150,
      studioPro: 320,
    });
  });
  it("handles invalid, negative and excessive inputs", () => {
    expect(estimateCosts(-10).solo).toBe(0);
    expect(estimateCosts(NaN).solo).toBe(0);
    expect(estimateCosts(Infinity).soloPro).toBe(50);
    expect(estimateCosts(1e9).solo).toBe(1000000);
  });
  it("rounds money to cents", () => {
    expect(estimateCosts(123.45).solo).toBe(12.35);
  });
});
