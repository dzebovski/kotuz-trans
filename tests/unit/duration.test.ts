import { describe, expect, it } from "vitest";
import { parseDurationToSeconds } from "@/utils/duration";

describe("duration", () => {
  it("parses hh:mm:ss", () => {
    expect(parseDurationToSeconds("2:51:57")).toBe(10317);
  });

  it("parses mm:ss", () => {
    expect(parseDurationToSeconds("35:00")).toBe(2100);
  });
});
