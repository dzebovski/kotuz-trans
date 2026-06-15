import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "@/utils/concurrency";

describe("fleet resilience", () => {
  it("does not fail whole fleet when one vehicle fails", async () => {
    const results = await mapWithConcurrency(
      [1, 2, 3],
      2,
      async (value) => {
        if (value === 2) {
          throw new Error("vehicle failed");
        }
        return value * 10;
      },
    );
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(1);
  });
});
