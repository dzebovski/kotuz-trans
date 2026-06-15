import { describe, expect, it } from "vitest";
import { isAuthorizedCronRequest } from "@/utils/cron-auth";

describe("cron authorization", () => {
  it("accepts valid bearer token", () => {
    expect(
      isAuthorizedCronRequest("Bearer secret-value", "secret-value"),
    ).toBe(true);
  });

  it("rejects invalid bearer token", () => {
    expect(isAuthorizedCronRequest("Bearer wrong", "secret-value")).toBe(false);
    expect(isAuthorizedCronRequest(null, "secret-value")).toBe(false);
  });
});
