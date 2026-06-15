"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type TripSegment = {
  id: string;
  started_at: string;
  ended_at: string;
  mileage_km: number;
  fuel_consumed_l: number | null;
  start_address: string | null;
  end_address: string | null;
  is_local_maneuver: boolean;
};

type DailyTrip = {
  id: string;
  mileage_km: number;
  fuel_consumed_l: number | null;
  average_fuel_consumption_l_per_100km: number | null;
  route_key: string | null;
  anomaly_status: string;
  vehicle: {
    display_name: string;
    wialon_unit_id: number;
  };
  segments: TripSegment[];
};

type ReportResponse = {
  summary: {
    reportDate: string;
    vehicleCount: number;
    totalMileageKm: number;
    totalFuelL: number;
    withRoute: number;
    withSegments: number;
  };
  trips: DailyTrip[];
};

function formatNum(value: number | null, suffix = ""): string {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return `${value.toLocaleString("uk-UA", { maximumFractionDigits: 2 })}${suffix}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("uk-UA", {
    timeZone: "Europe/Kyiv",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

export default function HomePage() {
  const router = useRouter();
  const [date, setDate] = useState("2026-06-14");
  const [data, setData] = useState<ReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/reports/daily?date=${date}`);
      const json = (await response.json()) as ReportResponse & { error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? "Failed to load report");
      }
      setData(json);
    } catch (loadError) {
      setData(null);
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load report",
      );
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Fleet Analytics — локальний перегляд</h1>
          <p style={{ color: "#555", marginBottom: 0 }}>
            Дані з Supabase (<code>daily_trips</code> + <code>trip_segments</code>)
          </p>
        </div>
        <button type="button" onClick={() => void handleSignOut()}>
          Вийти
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, marginTop: 20 }}>
        <label>
          Дата:{" "}
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            style={{ padding: "6px 8px" }}
          />
        </label>
        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "Завантаження…" : "Оновити"}
        </button>
      </div>

      {error ? <p style={{ color: "#b00020" }}>{error}</p> : null}

      {data ? (
        <>
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
              marginBottom: 24,
            }}
          >
            <Stat label="Авто" value={String(data.summary.vehicleCount)} />
            <Stat label="Пробіг" value={`${formatNum(data.summary.totalMileageKm)} km`} />
            <Stat label="Паливо" value={`${formatNum(data.summary.totalFuelL)} l`} />
            <Stat label="З маршрутом" value={String(data.summary.withRoute)} />
            <Stat label="З сегментами" value={String(data.summary.withSegments)} />
          </section>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
                <th style={{ padding: 8 }}>Авто</th>
                <th style={{ padding: 8 }}>Маршрут</th>
                <th style={{ padding: 8 }}>Пробіг</th>
                <th style={{ padding: 8 }}>Паливо</th>
                <th style={{ padding: 8 }}>Розхід</th>
                <th style={{ padding: 8 }}>Сегм.</th>
                <th style={{ padding: 8 }} />
              </tr>
            </thead>
            <tbody>
              {data.trips.map((trip) => (
                <Fragment key={trip.id}>
                  <tr style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 8 }}>{trip.vehicle.display_name}</td>
                    <td style={{ padding: 8, fontFamily: "monospace", fontSize: 12 }}>
                      {trip.route_key ?? "—"}
                    </td>
                    <td style={{ padding: 8 }}>{formatNum(trip.mileage_km)} km</td>
                    <td style={{ padding: 8 }}>{formatNum(trip.fuel_consumed_l, " l")}</td>
                    <td style={{ padding: 8 }}>
                      {formatNum(trip.average_fuel_consumption_l_per_100km, " l/100")}
                    </td>
                    <td style={{ padding: 8 }}>{trip.segments.length}</td>
                    <td style={{ padding: 8 }}>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId((current) =>
                            current === trip.id ? null : trip.id,
                          )
                        }
                      >
                        {expandedId === trip.id ? "Сховати" : "Деталі"}
                      </button>
                    </td>
                  </tr>
                  {expandedId === trip.id ? (
                    <tr>
                      <td colSpan={7} style={{ padding: "8px 8px 16px", background: "#fafafa" }}>
                        {trip.segments.length === 0 ? (
                          <em>Немає сегментів поїздок у БД</em>
                        ) : (
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {trip.segments.map((segment) => (
                              <li key={segment.id} style={{ marginBottom: 8 }}>
                                <strong>
                                  {formatTime(segment.started_at)} → {formatTime(segment.ended_at)}
                                </strong>
                                {" · "}
                                {formatNum(segment.mileage_km)} km
                                {segment.fuel_consumed_l != null
                                  ? ` · ${formatNum(segment.fuel_consumed_l)} l`
                                  : ""}
                                {segment.is_local_maneuver ? " · local" : ""}
                                <div style={{ color: "#666", fontSize: 12 }}>
                                  {segment.start_address ?? "—"} → {segment.end_address ?? "—"}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
      <div style={{ color: "#666", fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
