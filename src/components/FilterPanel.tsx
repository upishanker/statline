"use client";

import { useState } from "react";
import {
  EXTRA_STATS,
  PERCENT_STATS,
  PRIMARY_STATS,
  SLIDER_BOUNDS,
  STAT_LABELS,
  type StatKey,
} from "@/lib/statKeys";
import type { Filters, SeasonType } from "@/lib/buildSearchQuery";
import RangeSlider from "./RangeSlider";

type Props = {
  filters: Filters;
  seasonType: SeasonType;
  onChange: (next: { filters: Filters; seasonType: SeasonType }) => void;
  onSubmit: () => void;
  onClear: () => void;
};

function StatCell({
  k,
  range,
  onUpdate,
}: {
  k: StatKey;
  range: { min?: number | null; max?: number | null } | undefined;
  onUpdate: (next: { min?: number | null; max?: number | null } | undefined) => void;
}) {
  const isPct = PERCENT_STATS.has(k);
  const toDisplay = (v: number | null | undefined) =>
    v === null || v === undefined ? "" : isPct ? String(+(v * 100).toFixed(1)) : String(v);
  const fromDisplay = (s: string): number | undefined => {
    if (s === "") return undefined;
    const n = Number(s);
    if (!Number.isFinite(n)) return undefined;
    return isPct ? n / 100 : n;
  };

  const setSide = (side: "min" | "max", s: string) => {
    const parsed = fromDisplay(s);
    const next = { ...(range ?? {}) };
    if (parsed === undefined) delete next[side];
    else next[side] = parsed;
    if (next.min === undefined && next.max === undefined) onUpdate(undefined);
    else onUpdate(next);
  };

  const bounds = SLIDER_BOUNDS[k];
  const handleSlider = (next: { min?: number; max?: number }) => {
    if (next.min === undefined && next.max === undefined) {
      onUpdate(undefined);
    } else {
      onUpdate({ min: next.min, max: next.max });
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        {STAT_LABELS[k]}
        {isPct && <span className="ml-0.5 text-[9px] text-zinc-600">%</span>}
      </label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          inputMode="decimal"
          step={isPct ? "0.1" : "1"}
          placeholder="min"
          value={toDisplay(range?.min)}
          onChange={(e) => setSide("min", e.target.value)}
          className="w-full min-w-0 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm tabular-nums outline-none focus:border-zinc-500"
        />
        <span className="text-zinc-600">–</span>
        <input
          type="number"
          inputMode="decimal"
          step={isPct ? "0.1" : "1"}
          placeholder="max"
          value={toDisplay(range?.max)}
          onChange={(e) => setSide("max", e.target.value)}
          className="w-full min-w-0 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm tabular-nums outline-none focus:border-zinc-500"
        />
      </div>
      <RangeSlider
        bounds={bounds}
        minValue={range?.min ?? undefined}
        maxValue={range?.max ?? undefined}
        onChange={handleSlider}
      />
    </div>
  );
}

export default function FilterPanel({
  filters,
  seasonType,
  onChange,
  onSubmit,
  onClear,
}: Props) {
  const [showExtras, setShowExtras] = useState(false);

  const update = (k: StatKey, r: { min?: number | null; max?: number | null } | undefined) => {
    const next: Filters = { ...filters };
    if (r === undefined) delete next[k];
    else next[k] = r;
    onChange({ filters: next, seasonType });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {PRIMARY_STATS.map((k) => (
          <StatCell key={k} k={k} range={filters[k]} onUpdate={(r) => update(k, r)} />
        ))}
      </div>

      {showExtras && (
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-zinc-800 pt-3 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7">
          {EXTRA_STATS.map((k) => (
            <StatCell key={k} k={k} range={filters[k]} onUpdate={(r) => update(k, r)} />
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-3">
        <button
          type="button"
          onClick={() => setShowExtras((v) => !v)}
          className="text-xs text-zinc-400 hover:text-zinc-200"
        >
          {showExtras ? "− Hide" : "+ Show"} more stats (TOV, MIN, shooting splits, +/-)
        </button>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Season
          </span>
          {(["All", "Regular Season", "Playoffs"] as SeasonType[]).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => onChange({ filters, seasonType: st })}
              className={`rounded-md border px-2 py-1 text-xs ${
                seasonType === st
                  ? "border-zinc-300 bg-zinc-200 text-zinc-900"
                  : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              {st === "Regular Season" ? "Reg" : st === "Playoffs" ? "Playoffs" : "All"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          className="flex-1 rounded-md bg-emerald-400 px-3 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-300"
        >
          Search
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded-md border border-zinc-800 px-4 py-2.5 text-sm text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
        >
          Clear
        </button>
      </div>
    </form>
  );
}
