import { describe, expect, it } from "vitest";
import {
  parseFuelEvents,
  parseFuelEventsFromReport,
} from "@/wialon/parsers/fuel-events";
import drainFixture from "../fixtures/fuel-drain-ac2096-2026-06-25.json";
import drainRangeFixture from "../fixtures/fuel-drains-ac2096-range-2026-06-22-28.json";
import refillFixture from "../fixtures/fuel-refill-6222-2026-06-25.json";

describe("parseFuelEvents", () => {
  it("parses unit_fillings structured refill rows", () => {
    const { events, warnings } = parseFuelEvents(
      refillFixture.rows,
      "unit_fillings",
    );

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
    expect(events[0]).toMatchObject({
      eventType: "refill",
      eventTime: "2026-06-25 16:30:47",
      volumeL: 471,
      latitude: 51.6605533,
      longitude: 14.764155,
      address: "68-212 Olszyna, Poland",
    });
  });

  it("parses chronology refill rows with Ukrainian address in start position", () => {
    const { events, warnings } = parseFuelEvents([
      {
        n: 4,
        c: [
          "Заправка",
          "2026-06-28 14:22:10\n49.1234567° N, 23.9876543° E",
          "2026-06-28 14:35:00",
          "0:12:50",
          "Україна, Новояричівська ТГ, Львівський р-н, Львівська обл., Київська, 80461",
          "",
          "Volume: 320 l",
          "",
        ],
      },
    ]);

    expect(warnings).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "refill",
      volumeL: 320,
      address:
        "Україна, Новояричівська ТГ, Львівський р-н, Львівська обл., Київська, 80461",
    });
  });

  it("parses chronology drain rows with text event type", () => {
    const { events, warnings } = parseFuelEvents([
      {
        n: 5,
        c: [
          "Слив",
          "2026-06-26 03:15:22\n50.1234567° N, 30.7654321° E",
          "2026-06-26 03:20:00",
          "0:04:38",
          "Україна, Київська обл., Бориспіль",
          "Україна, Київська обл., Бориспіль, вул. Центральна",
          "Volume: 85 l",
          "",
        ],
      },
    ]);

    expect(warnings).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "drain",
      eventTime: "2026-06-26 03:15:22",
      volumeL: 85,
      latitude: 50.1234567,
      longitude: 30.7654321,
      address: "Україна, Київська обл., Бориспіль",
    });
  });

  it("parses unit_drains structured drain rows with initial location address", () => {
    const { events, warnings } = parseFuelEvents(
      drainFixture.rows,
      "unit_drains",
    );

    expect(warnings).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "drain",
      eventTime: "2026-06-25 09:52:49",
      volumeL: 11.47,
      latitude: 51.192857,
      longitude: 2.897518,
      address: "8400 Oostende, Belgium, West Flanders, Oostende",
      rawEvent: {
        format: "unit_drains",
        sequence: "1",
        fuelBeforeL: 245,
        fuelAfterL: 233.53,
      },
    });
  });

  it("parses drains and refills from separate report tables", () => {
    const { events, warnings } = parseFuelEventsFromReport({
      stats: [
        { n: "Всего заправок", c: ["1"] },
        { n: "Всего сливов", c: ["1"] },
      ],
      tables: [
        { name: "unit_fillings", rows: 1 },
        { name: "unit_drains", rows: 1 },
      ],
      rows: [...refillFixture.rows, ...drainFixture.rows],
    });

    expect(warnings).toEqual([]);
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.eventType).sort()).toEqual([
      "drain",
      "refill",
    ]);
  });

  it("parses chronology drain rows with address in geo cell without comma", () => {
    const { events, warnings } = parseFuelEvents([
      {
        n: 6,
        c: [
          "Слив",
          "2026-06-25 07:58:00\n50.8500000° N, 3.2700000° E",
          "2026-06-25 08:00:00",
          "0:02:00",
          "8400 Oostende, Belgium",
          {
            t: "Oostende depot",
            y: 50.85,
            x: 3.27,
            u: 6222,
          },
          "Volume: 11.47 l",
          "",
        ],
      },
    ]);

    expect(warnings).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "drain",
      eventTime: "2026-06-25 07:58:00",
      volumeL: 11.47,
      latitude: 50.85,
      longitude: 3.27,
      address: "8400 Oostende, Belgium",
    });
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

  it("parses four interval unit_drains rows from AC2096 range fixture", () => {
    const { events, warnings } = parseFuelEventsFromReport({
      stats: drainRangeFixture.stats,
      tables: drainRangeFixture.tables,
      rows: drainRangeFixture.rows,
    });

    expect(warnings).toEqual([]);
    expect(events).toHaveLength(4);
    expect(events.every((event) => event.eventType === "drain")).toBe(true);
    expect(events[0]).toMatchObject({
      eventTime: "2026-06-25 01:51:46",
      volumeL: 11.47,
      address: "8400 Oostende, Belgium, West-Vlaanderen, Heerweg",
      rawEvent: { format: "unit_drains_interval" },
    });
    expect(events[1]?.address).toContain("Wendeburg");
    expect(events[2]?.address).toContain("Genthin");
    expect(events[3]?.address).toContain("Kozłów");
  });

  it("falls back to chronology parsing for unit_drains rows", () => {
    const { events, warnings } = parseFuelEvents(
      [
        {
          n: 2,
          c: [
            "Слив",
            "2026-06-26 20:25:40\n52.4021000° N, 12.3987000° E",
            "2026-06-26 20:36:04",
            "0:10:24",
            "39307 Genthin, Germany, Sachsen-Anhalt, A 2",
            "",
            "Volume: 9.8 l",
            "",
          ],
        },
      ],
      "unit_drains",
    );

    expect(warnings).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "drain",
      volumeL: 9.8,
      address: "39307 Genthin, Germany, Sachsen-Anhalt, A 2",
    });
  });

  it("warns when unit_drains row cannot be parsed", () => {
    const { events, warnings } = parseFuelEvents(
      [
        {
          n: 9,
          c: ["broken", "not-a-time", "still-not-a-time", "no volume"],
        },
      ],
      "unit_drains",
    );

    expect(events).toEqual([]);
    expect(warnings).toEqual(["Unparsed drain row 9"]);
  });

  it("parses chronology drain volume with cyrillic liter unit", () => {
    const { events, warnings } = parseFuelEvents([
      {
        n: 7,
        c: [
          "Слив",
          "2026-06-25 07:58:00\n50.8500000° N, 3.2700000° E",
          "2026-06-25 08:00:00",
          "0:02:00",
          "8400 Oostende, Belgium",
          "",
          "Объем: 11,47 л",
          "",
        ],
      },
    ]);

    expect(warnings).toEqual([]);
    expect(events[0]?.volumeL).toBe(11.47);
  });

  it("parses interval drains with initial level, final level and explicit drained volume", () => {
    const { events, warnings } = parseFuelEvents(
      [
        {
          n: 0,
          c: [
            "1",
            {
              t: "2026-06-25 20:23:00",
              y: 49.583667,
              x: 34.18402,
              u: 6401,
            },
            {
              t: "2026-06-25 20:28:00",
              y: 49.583667,
              x: 34.18402,
              u: 6401,
            },
            {
              t: "Україна, Полтавська обл., М-03",
              y: 49.583667,
              x: 34.18402,
              u: 6401,
            },
            "968 l",
            "957 l",
            "0 km/h",
            "0 km/h",
            "11.36 l",
          ],
        },
      ],
      "unit_drains",
    );

    expect(warnings).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "drain",
      eventTime: "2026-06-25 20:23:00",
      volumeL: 11.36,
      rawEvent: { format: "unit_drains_interval" },
    });
  });

  it("parses interval drains when position cell has only coordinates", () => {
    const { events, warnings } = parseFuelEvents(
      [
        {
          n: 0,
          c: [
            "1",
            {
              t: "2026-06-25 20:25:40",
              y: 49.583667,
              x: 34.18402,
              u: 6401,
            },
            {
              t: "2026-06-25 20:36:04",
              y: 49.583667,
              x: 34.18402,
              u: 6401,
            },
            {
              t: "",
              y: 49.583667,
              x: 34.18402,
              u: 6401,
            },
            "10.22 l",
          ],
        },
      ],
      "unit_drains",
    );

    expect(warnings).toEqual([]);
    expect(events[0]).toMatchObject({
      volumeL: 10.22,
      latitude: 49.583667,
      longitude: 34.18402,
      address: null,
    });
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
