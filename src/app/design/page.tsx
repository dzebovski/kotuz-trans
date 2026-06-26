import type { ReactNode } from "react";
import { AlertTriangle, Clock3, Truck } from "lucide-react";
import { Badge } from "@/components/Badge";

type BadgeDoc = {
  badge: string;
  shows: string;
  location: string;
  calculation: string;
  design: string;
};

const badgeDocs: BadgeDoc[] = [
  {
    badge: "{N} нормальний розхід",
    shows: "Кількість авто з нормальним розходом палива за період",
    location: "Fleet summary (chip-row)",
    calculation: "fuelStatusCounts.normal: авто з worst fuelStatus = normal",
    design: "AlertTriangle + success",
  },
  {
    badge: "{N} середній розхід",
    shows: "Кількість авто з середнім розходом палива за період",
    location: "Fleet summary (chip-row)",
    calculation: "fuelStatusCounts.avrg: авто з worst fuelStatus = avrg",
    design: "AlertTriangle + avrg",
  },
  {
    badge: "{N} високий розхід",
    shows: "Кількість авто з високим розходом палива за період",
    location: "Fleet summary (chip-row)",
    calculation: "fuelStatusCounts.high: авто з worst fuelStatus = high",
    design: "AlertTriangle + danger якщо N > 0, інакше success",
  },
  {
    badge: "{fuelStatusLabel}",
    shows: "Найгірший статус розходу за період (нормальний / середній / високий)",
    location: "Картка авто (vehicle-statuses)",
    calculation:
      "worstFuelStatus по днях; tier 30: normal ≤27, avrg 27–30, high >30; tier 32: normal ≤29, avrg 29–32, high >32",
    design: "normal → success, avrg → #D5ED38, high → danger; не показувати якщо всі дні not_evaluated",
  },
  {
    badge: "{N} днів high",
    shows: "Кількість днів з високим розходом",
    location: "Картка авто (лише якщо N > 0)",
    calculation: "highDays = дні з fuelStatus = high",
    design: "AlertTriangle + danger",
  },
  {
    badge: "стоянки {N} · {duration}",
    shows: "Кількість стоянок і сумарний час",
    location: "Картка авто (vehicle-statuses)",
    calculation:
      "parkingCount = sum parking_count_from_trips; parkingDurationSeconds = sum з trips report",
    design: "Clock3 + neutral (сірий pill)",
  },
  {
    badge: "{fuelStatusLabel}",
    shows: "Статус розходу за день",
    location: "Денна таблиця в details",
    calculation:
      "evaluateFuelConsumptionStatus(actual, vehicles.consumption_tier); not_evaluated — без бейджа",
    design: "normal → success, avrg → avrg, high → danger; українські підписи",
  },
  {
    badge: "{N} авто / {N} днів",
    shows: "Лічильники кількості",
    location: "Заголовок таблиці / details panel",
    calculation: "Прямий count з даних",
    design: "neutral; авто — з іконкою Truck",
  },
  {
    badge: "Coverage status",
    shows: "Статус ingest за дату (готово, помилка, …)",
    location: "Coverage panel",
    calculation: "day.ready / day.state",
    design: "ready → success, failed → danger, інше → warning",
  },
  {
    badge: "local",
    shows: "Локальний маневр у сегменті рейсу",
    location: "Таблиця сегментів",
    calculation: "segment.is_local_maneuver",
    design: "neutral (сірий pill)",
  },
];

function DesignSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="design-section panel">
      <div className="section-heading">
        <div>
          <h3>{title}</h3>
          {description ? <p className="muted">{description}</p> : null}
        </div>
      </div>
      <div className="design-preview">{children}</div>
    </section>
  );
}

export default function DesignPage() {
  return (
    <div className="app-shell">
      <main className="page">
        <header className="topbar">
          <div className="topbar__title">
            <div className="brand-mark">
              <Truck size={18} />
            </div>
            <div>
              <h1>Design system</h1>
              <p className="mono">/design — бейджі</p>
            </div>
          </div>
        </header>

        <div className="content">
          <section className="report-hero">
            <div className="report-hero__copy">
              <h2>Каталог бейджів</h2>
              <p>
                Статусні pill-бейджі розходу палива за фіксованими нормами tier
                30/32 л/100км на кожне авто.
              </p>
            </div>
          </section>

          <DesignSection
            title="Тони"
            description="Базові варіанти кольору: neutral, success, avrg, danger, warning."
          >
            <div className="chip-row">
              <Badge>neutral</Badge>
              <Badge tone="success">normal</Badge>
              <Badge tone="avrg">avrg</Badge>
              <Badge tone="danger">high</Badge>
              <Badge tone="warning">warning</Badge>
            </div>
          </DesignSection>

          <DesignSection
            title="Fleet summary"
            description="Зведені показники флоту — chip-row під лічильником авто."
          >
            <div className="fleet-summary fleet-summary--design">
              <div className="fleet-summary__count">
                <strong>42 авто</strong>
                <span>Звіт за 7 днів</span>
                <div className="chip-row">
                  <Badge tone="success">
                    <AlertTriangle size={13} />
                    35 нормальний розхід
                  </Badge>
                  <Badge tone="avrg">
                    <AlertTriangle size={13} />
                    4 середній розхід
                  </Badge>
                  <Badge tone="danger">
                    <AlertTriangle size={13} />
                    3 високий розхід
                  </Badge>
                </div>
              </div>
            </div>
            <div className="design-preview__alt">
              <p className="muted">Все ок:</p>
              <div className="chip-row">
                <Badge tone="success">
                  <AlertTriangle size={13} />
                  24 нормальний розхід
                </Badge>
                <Badge tone="avrg">
                  <AlertTriangle size={13} />
                  0 середній розхід
                </Badge>
                <Badge tone="success">
                  <AlertTriangle size={13} />
                  0 високий розхід
                </Badge>
              </div>
            </div>
          </DesignSection>

          <DesignSection
            title="Картка авто"
            description="Статуси під рядком даних авто в таблиці."
          >
            <div className="vehicle-card vehicle-card--design">
              <div className="vehicle-card__header">
                <span className="mono muted">unit 9438</span>
                <strong>KA4465EI / AA3627XG</strong>
              </div>
              <div className="chip-row vehicle-statuses">
                <Badge tone="success">
                  <AlertTriangle size={13} />
                  нормальний розхід
                </Badge>
                <Badge>
                  <Clock3 size={13} />
                  стоянки 3 · 2 год 15 хв
                </Badge>
              </div>
            </div>
            <div className="design-preview__alt">
              <p className="muted">Середній і високий розхід:</p>
              <div className="vehicle-card vehicle-card--design">
                <div className="vehicle-card__header">
                  <span className="mono muted">unit 2715</span>
                  <strong>AA6616HK / AA6616XK</strong>
                </div>
                <div className="chip-row vehicle-statuses">
                  <Badge tone="avrg">
                    <AlertTriangle size={13} />
                    середній розхід
                  </Badge>
                  <Badge tone="danger">
                    <AlertTriangle size={13} />
                    2 днів high
                  </Badge>
                  <Badge>
                    <Clock3 size={13} />
                    стоянки 5 · 4 год 30 хв
                  </Badge>
                </div>
              </div>
            </div>
          </DesignSection>

          <DesignSection
            title="Інші варіанти"
            description="Лічильники, coverage, денні статуси, сегменти."
          >
            <div className="chip-row">
              <Badge>
                <Truck size={13} />
                42 авто
              </Badge>
              <Badge>7 днів</Badge>
              <Badge tone="success">готово</Badge>
              <Badge tone="danger">помилка</Badge>
              <Badge tone="warning">завантаження</Badge>
              <Badge tone="success">нормальний розхід</Badge>
              <Badge tone="avrg">середній розхід</Badge>
              <Badge tone="danger">високий розхід</Badge>
              <Badge>local</Badge>
            </div>
          </DesignSection>

          <section className="design-section panel">
            <div className="section-heading">
              <div>
                <h3>Документація</h3>
                <p className="muted">
                  Що показує кожен бейдж, де в UI, як рахується і як виглядає.
                </p>
              </div>
            </div>
            <div className="table-scroll">
              <table className="design-table">
                <thead>
                  <tr>
                    <th>Бейдж</th>
                    <th>Що показує</th>
                    <th>Де в UI</th>
                    <th>Як рахується</th>
                    <th>Дизайн</th>
                  </tr>
                </thead>
                <tbody>
                  {badgeDocs.map((doc) => (
                    <tr key={`${doc.badge}-${doc.location}`}>
                      <td className="mono">{doc.badge}</td>
                      <td>{doc.shows}</td>
                      <td>{doc.location}</td>
                      <td className="mono design-table__calc">{doc.calculation}</td>
                      <td>{doc.design}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
