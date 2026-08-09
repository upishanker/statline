"use client";

import { SORTABLE_STATS, STAT_LABELS } from "@/lib/statKeys";
import type { SortBy } from "@/lib/buildSearchQuery";

type Props = {
  sort: { by: SortBy; dir: "asc" | "desc" };
  onChange: (next: { by: SortBy; dir: "asc" | "desc" }) => void;
  total: number | null;
  showingFrom: number;
  showingTo: number;
};

export default function SortControls({ sort, onChange, total, showingFrom, showingTo }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
      <div className="text-sm text-zinc-400">
        {total === null ? (
          <span>Showing {showingFrom}–{showingTo} (no filter)</span>
        ) : total === 0 ? (
          <span>No performances matched</span>
        ) : (
          <span>
            {showingFrom}–{Math.min(showingTo, total)} of{" "}
            <span className="font-semibold text-zinc-200">{total.toLocaleString()}</span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs uppercase tracking-wide text-zinc-500">Sort by</label>
        <select
          value={sort.by}
          onChange={(e) => {
            const by = e.target.value as SortBy;
            // Sensible default direction per sort key.
            const dir: "asc" | "desc" = by === "closeness" ? "asc" : "desc";
            onChange({ by, dir });
          }}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm outline-none focus:border-zinc-500"
        >
          <option value="closeness">Closeness</option>
          <option value="date">Date</option>
          {SORTABLE_STATS.map((k) => (
            <option key={k} value={k}>
              {STAT_LABELS[k]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onChange({ by: sort.by, dir: sort.dir === "asc" ? "desc" : "asc" })}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-zinc-300 hover:border-zinc-600"
          title="Toggle direction"
        >
          {sort.dir === "asc" ? "↑ asc" : "↓ desc"}
        </button>
      </div>
    </div>
  );
}
