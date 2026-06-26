"use client";

import { CalendarDays } from "lucide-react";
import {
  getKyivDate,
  inclusiveDateCount,
} from "@/lib/report/dates";

type ReportRangeFiltersProps = {
  draftFrom: string;
  draftTo: string;
  from: string;
  to: string;
  mutating: boolean;
  onDraftFromChange: (value: string) => void;
  onDraftToChange: (value: string) => void;
  onApply: () => void;
  onPreset: (days: 1 | 7 | 30) => void;
};

export function ReportRangeFilters({
  draftFrom,
  draftTo,
  from,
  to,
  mutating,
  onDraftFromChange,
  onDraftToChange,
  onApply,
  onPreset,
}: ReportRangeFiltersProps) {
  const selectedPresetDays = (() => {
    const days = inclusiveDateCount(from, to);
    return to === getKyivDate(-1) && [1, 7, 30, 90].includes(days) ? days : null;
  })();

  return (
    <div className="report-filters" aria-label="Фільтри періоду">
      <div className="preset-row" aria-label="Швидкий вибір періоду">
        {([1, 7, 30] as const).map((days) => (
          <button
            className={`button button--ghost${
              selectedPresetDays === days ? " button--selected" : ""
            }`}
            type="button"
            key={days}
            onClick={() => onPreset(days)}
            disabled={mutating}
          >
            {days === 1 ? "Учора" : days === 7 ? "Тиждень" : "Місяць"}
          </button>
        ))}
      </div>
      <div className="range-fields report-range-fields">
        <label className="field field--compact">
          <span>Від</span>
          <input
            className="input mono"
            type="date"
            value={draftFrom}
            max={draftTo}
            onChange={(event) => onDraftFromChange(event.target.value)}
          />
        </label>
        <span className="range-separator">→</span>
        <label className="field field--compact">
          <span>До</span>
          <input
            className="input mono"
            type="date"
            value={draftTo}
            min={draftFrom}
            max={getKyivDate()}
            onChange={(event) => onDraftToChange(event.target.value)}
          />
        </label>
        <button
          className="button button--primary"
          type="button"
          onClick={onApply}
          disabled={mutating || !draftFrom || !draftTo}
        >
          <CalendarDays size={16} />
          Застосувати
        </button>
      </div>
    </div>
  );
}
