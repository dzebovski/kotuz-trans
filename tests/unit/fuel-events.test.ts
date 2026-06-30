import { describe, expect, it } from "vitest";
import { parseFuelEvents } from "@/wialon/parsers/fuel-events";
import refillFixture from "../fixtures/fuel-refill-6222-2026-06-25.json";

describe("parseFuelEvents", () => {
  it("parses unit_fillings structured refill rows", () => {
    const { events, warnings } = parseFuelEvents(refillFixture.rows);

    expect(warnings).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "refill",
      eventTime: "2026-06-25 16:30:47",
      volumeL: 471,
      latitude: 51.6605533,
      longitude: 14.764155,
      address:
        "68-212 Olszyna, Poland, Żarski powiat, województwo lubuskie, Olszyna 2",
      rawEvent: {
        format: "unit_fillings",
        sequence: "1",
        fuelBeforeL: 531,
        fuelAfterL: 1002,
      },
    });
  });

  it("parses chronology refill rows with text event type", () => {
    const { events, warnings } = parseFuelEvents([
      {
        n: 3,
        c: [
          "Заправка",
          "2026-06-25 16:30:47\n51.6605533° N, 14.764155° E",
          "2026-06-25 16:35:00",
          "0:04:13",
          "68-212 Olszyna, Poland",
          "",
          "Volume: 471 l",
          "",
        ],
      },
    ]);

    expect(warnings).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("refill");
    expect(events[0]?.volumeL).toBe(471);
  });

  it("parses unit_fillings rows with Kyiv-local timestamps", () => {
    const { events } = parseFuelEvents([
      {
        n: 0,
        c: [
          "1",
          {
            t: "2026-06-25 13:30:47",
            v: 1782394247,
            y: 51.6605533,
            x: 14.764155,
            u: 6222,
          },
          {
            t: "68-212 Olszyna, Poland, Żarski powiat, województwo lubuskie, Olszyna 2",
            y: 51.6605533,
            x: 14.764155,
            u: 6222,
          },
          "531 l",
          "1002 l",
          "471 l",
        ],
      },
    ]);

    expect(events[0]?.address).toBe(
      "68-212 Olszyna, Poland, Żarski powiat, województwo lubuskie, Olszyna 2",
    );
  });

  it("skips trip rows from chronology without warnings", () => {
    const { events, warnings } = parseFuelEvents([
      {
        n: 0,
        c: [
          "Trip",
          { t: "2026-06-14 08:40:22", y: 52.31, x: 7.04 },
          { t: "2026-06-14 11:32:19", y: 51.41, x: 4.7 },
          "2:51:57",
          { t: "De Lutte, Netherlands" },
          { t: "Hoogstraten, Belgium" },
          "Mileage: 231 km",
          "",
        ],
      },
    ]);

    expect(events).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("does not treat trip rows with postal-code addresses as refills", () => {
    const { events, warnings } = parseFuelEvents([
      {
        n: 1,
        c: [
          "Trip",
          { t: "2026-06-24 21:41:00", y: 51.22, x: 2.92 },
          { t: "2026-06-25 07:58:00", y: 50.85, x: 3.27 },
          "10:17:00",
          { t: "4836 Oost-Vlaanderen, Belgium" },
          { t: "8400 Oostende, Belgium" },
          "Mileage: 312 km",
          "",
        ],
      },
    ]);

    expect(events).toEqual([]);
    expect(warnings).toEqual([]);
  });
});
