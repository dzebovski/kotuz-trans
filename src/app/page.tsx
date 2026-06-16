"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type TripSegment = {
  id: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number | null;
  mileage_km: number;
  fuel_consumed_l: number | null;
  average_speed_kmh: number | null;
  max_speed_kmh: number | null;
  start_address: string | null;
  end_address: string | null;
  is_local_maneuver: boolean;
};

type InferredPause = {
  kind: "inferred";
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
};

type DailyTrip = {
  id: string;
  mileage_km: number;
  fuel_consumed_l: number | null;
  average_fuel_consumption_l_per_100km: number | null;
  route_key: string | null;
  anomaly_status: string;
  movement_duration_seconds: number | null;
  stop_count: number;
  parking_duration_seconds: number | null;
  parking_count_from_trips: number;
  max_speed_kmh: number | null;
  average_speed_kmh: number | null;
  starting_fuel_l: number | null;
  ending_fuel_l: number | null;
  rolling_1000km_consumption_l_per_100km: number | null;
  speedLimitExceeded: boolean;
  vehicle: {
    display_name: string;
    wialon_unit_id: number;
  };
  segments: TripSegment[];
  derivedPauses: InferredPause[];
};

type ReportResponse = {
  summary: {
    reportDate: string;
    vehicleCount: number;
    totalMileageKm: number;
    totalFuelL: number;
    totalMovementSeconds: number;
    totalParkingCount: number;
    totalParkingSeconds: number;
    vehiclesOverSpeedLimit: number;
    averageRollingConsumptionLPer100Km: number | null;
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

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) {
    return "—";
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours} год ${minutes} хв`;
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
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Fleet Analytics — подобовий звіт</h1>
          <p style={{ color: "#555", marginBottom: 0 }}>
            Дані з Supabase по машинах (<code>daily_trips</code> + <code>trip_segments</code>)
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
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 12,
              marginBottom: 24,
            }}
          >
            <Stat label="Авто" value={String(data.summary.vehicleCount)} />
            <Stat label="Пробіг" value={`${formatNum(data.summary.totalMileageKm)} km`} />
            <Stat label="Паливо" value={`${formatNum(data.summary.totalFuelL)} l`} />
            <Stat
              label="Рух"
              value={formatDuration(data.summary.totalMovementSeconds)}
            />
            <Stat
              label="Стоянки"
              value={`${data.summary.totalParkingCount} · ${formatDuration(data.summary.totalParkingSeconds)}`}
            />
            <Stat
              label=">86 км/г"
              value={String(data.summary.vehiclesOverSpeedLimit)}
            />
            <Stat
              label="Rolling л/100"
              value={formatNum(data.summary.averageRollingConsumptionLPer100Km, " l/100")}
            />
            <Stat label="З маршрутом" value={String(data.summary.withRoute)} />
          </section>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
                  <th style={{ padding: 8 }}>Авто</th>
                  <th style={{ padding: 8 }}>Маршрут</th>
                  <th style={{ padding: 8 }}>Пробіг</th>
                  <th style={{ padding: 8 }}>Паливо</th>
                  <th style={{ padding: 8 }}>Розхід</th>
                  <th style={{ padding: 8 }}>Рух</th>
                  <th style={{ padding: 8 }}>Стоянки</th>
                  <th style={{ padding: 8 }}>Vсер/макс</th>
                  <th style={{ padding: 8 }}>Rolling</th>
                  <th style={{ padding: 8 }}>ДУТ</th>
                  <th style={{ padding: 8 }} />
                </tr>
              </thead>
              <tbody>
                {data.trips.map((trip) => (
                  <Fragment key={trip.id}>
                    <tr style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: 8 }}>
                        {trip.speedLimitExceeded ? "⚠ " : ""}
                        {trip.vehicle.display_name}
                      </td>
                      <td style={{ padding: 8, fontFamily: "monospace", fontSize: 11 }}>
                        {trip.route_key ?? "—"}
                      </td>
                      <td style={{ padding: 8 }}>{formatNum(trip.mileage_km)} km</td>
                      <td style={{ padding: 8 }}>{formatNum(trip.fuel_consumed_l, " l")}</td>
                      <td style={{ padding: 8 }}>
                        {formatNum(trip.average_fuel_consumption_l_per_100km, " l/100")}
                      </td>
                      <td style={{ padding: 8 }}>
                        {formatDuration(trip.movement_duration_seconds)}
                      </td>
                      <td style={{ padding: 8 }}>
                        {trip.parking_count_from_trips}
                        {trip.parking_duration_seconds != null
                          ? ` · ${formatDuration(trip.parking_duration_seconds)}`
                          : ""}
                      </td>
                      <td style={{ padding: 8 }}>
                        {formatNum(trip.average_speed_kmh)} / {formatNum(trip.max_speed_kmh)}
                      </td>
                      <td style={{ padding: 8 }}>
                        {formatNum(trip.rolling_1000km_consumption_l_per_100km, " l/100")}
                      </td>
                      <td style={{ padding: 8, fontSize: 11 }}>
                        {formatNum(trip.starting_fuel_l)} → {formatNum(trip.ending_fuel_l)} l
                      </td>
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
                        <td colSpan={11} style={{ padding: "8px 8px 16px", background: "#fafafa" }}>
                          <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Рейси за добу</h3>
                          {trip.segments.length === 0 ? (
                            <em>Немає сегментів поїздок у БД</em>
                          ) : (
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid #ddd" }}>
                                  <th style={{ padding: 6, textAlign: "left" }}>Початок</th>
                                  <th style={{ padding: 6, textAlign: "left" }}>Кінець</th>
                                  <th style={{ padding: 6, textAlign: "left" }}>Тривалість</th>
                                  <th style={{ padding: 6, textAlign: "left" }}>Пробіг</th>
                                  <th style={{ padding: 6, textAlign: "left" }}>Паливо</th>
                                  <th style={{ padding: 6, textAlign: "left" }}>Vсер/макс</th>
                                  <th style={{ padding: 6, textAlign: "left" }}>Маршрут</th>
                                </tr>
                              </thead>
                              <tbody>
                                {trip.segments.map((segment) => (
                                  <tr key={segment.id} style={{ borderBottom: "1px solid #eee" }}>
                                    <td style={{ padding: 6 }}>{formatTime(segment.started_at)}</td>
                                    <td style={{ padding: 6 }}>{formatTime(segment.ended_at)}</td>
                                    <td style={{ padding: 6 }}>
                                      {formatDuration(segment.duration_seconds)}
                                    </td>
                                    <td style={{ padding: 6 }}>{formatNum(segment.mileage_km)} km</td>
                                    <td style={{ padding: 6 }}>
                                      {formatNum(segment.fuel_consumed_l, " l")}
                                    </td>
                                    <td style={{ padding: 6 }}>
                                      {formatNum(segment.average_speed_kmh)} /{" "}
                                      {formatNum(segment.max_speed_kmh)}
                                    </td>
                                    <td style={{ padding: 6, color: "#666" }}>
                                      {segment.start_address ?? "—"} → {segment.end_address ?? "—"}
                                      {segment.is_local_maneuver ? " · local" : ""}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}

                          <h3 style={{ margin: "16px 0 8px", fontSize: 14 }}>
                            Паузи між рейсами (обчислені, не Wialon raw)
                          </h3>
                          {trip.derivedPauses.length === 0 ? (
                            <em>Немає пауз між сегментами</em>
                          ) : (
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                              {trip.derivedPauses.map((pause, index) => (
                                <li key={`${pause.startedAt}-${index}`} style={{ marginBottom: 6 }}>
                                  {formatTime(pause.startedAt)} → {formatTime(pause.endedAt)}
                                  {" · "}
                                  {formatDuration(pause.durationSeconds)}
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
          </div>
        </>
      ) : null}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
      <div style={{ color: "#666", fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
