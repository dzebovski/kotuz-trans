import { describe, expect, it } from "vitest";
import { buildEnsureRunStatusMessage } from "@/lib/report/format";

describe("buildEnsureRunStatusMessage", () => {
  it("describes queued dates", () => {
    expect(
      buildEnsureRunStatusMessage({
        queued: ["2026-06-30"],
        skipped: [],
      }),
    ).toBe("У черзі 1 дат. Запускаю обробку…");
  });

  it("describes already final skips", () => {
    expect(
      buildEnsureRunStatusMessage({
        queued: [],
        skipped: [{ date: "2026-06-30", reason: "already_final" }],
      }),
    ).toBe("Дані вже завантажені. Оновлюю звіт…");
  });

  it("describes queue failures", () => {
    expect(
      buildEnsureRunStatusMessage({
        queued: [],
        skipped: [
          { date: "2026-06-30", reason: "queue_failed_needs_retry" },
        ],
      }),
    ).toBe("Є дати з помилкою. Спробуйте «Довантажити дані» або повтор…");
  });
});
