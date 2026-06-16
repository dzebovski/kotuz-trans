import { describe, expect, it } from "vitest";
import { parseDurationToSeconds } from "@/utils/duration";

describe("duration", () => {
  it("parses hh:mm:ss", () => {
    expect(parseDurationToSeconds("2:51:57")).toBe(10317);
  });

  it("parses mm:ss", () => {
    expect(parseDurationToSeconds("35:00")).toBe(2100);
  });

  it("parses N days HH:MM:SS", () => {
    expect(parseDurationToSeconds("1 days 21:44:31")).toBe(164671);
  });

  it("parses singular day HH:MM:SS", () => {
    expect(parseDurationToSeconds("1 day 0:30:00")).toBe(88200);
  });
});
