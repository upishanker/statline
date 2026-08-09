"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FilterPanel from "./FilterPanel";
import SortControls from "./SortControls";
import PerformanceCard from "./PerformanceCard";
import SkeletonCard from "./SkeletonCard";
import Pagination from "./Pagination";
import { paramsToState, stateToParams, type UiState } from "./urlState";
import type { Performance, SearchResponse } from "@/types";
import type { Filters, SeasonType } from "@/lib/buildSearchQuery";

const PER_PAGE = 25;

function readInitialState(): UiState {
  if (typeof window === "undefined") {
    return {
      filters: {},
      seasonType: "All",
      sort: { by: "closeness", dir: "asc" },
      page: 1,
    };
  }
  return paramsToState(new URLSearchParams(window.location.search));
}

export default function App() {
  // Submitted state — what's actually been searched (drives URL & fetches).
  const [submitted, setSubmitted] = useState<UiState>(readInitialState);
  // Draft state — what's in the filter inputs right now.
  const [draftFilters, setDraftFilters] = useState<Filters>(submitted.filters);
  const [draftSeasonType, setDraftSeasonType] = useState<SeasonType>(submitted.seasonType);

  const [rows, setRows] = useState<Performance[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  // Sync URL whenever submitted state changes.
  useEffect(() => {
    const params = stateToParams(submitted);
    const qs = params.toString();
    const url = qs ? `?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [submitted]);

  // Back/forward — re-read URL into state.
  useEffect(() => {
    const onPop = () => {
      const next = paramsToState(new URLSearchParams(window.location.search));
      setSubmitted(next);
      setDraftFilters(next.filters);
      setDraftSeasonType(next.seasonType);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Fetch results whenever submitted state changes.
  useEffect(() => {
    const myReq = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    fetch("/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filters: submitted.filters,
        seasonType: submitted.seasonType,
        sort: submitted.sort,
        page: submitted.page,
        perPage: PER_PAGE,
      }),
    })
      .then(async (r) => {
        if (myReq !== reqIdRef.current) return;
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: unknown };
          throw new Error(
            typeof body.error === "string" ? body.error : `Request failed (${r.status})`,
          );
        }
        const json = (await r.json()) as SearchResponse;
        if (myReq !== reqIdRef.current) return;
        setRows(json.rows);
        setTotal(json.total);
      })
      .catch((e: Error) => {
        if (myReq !== reqIdRef.current) return;
        setError(e.message);
        setRows([]);
        setTotal(null);
      })
      .finally(() => {
        if (myReq === reqIdRef.current) setLoading(false);
      });
  }, [submitted]);

  const handleSubmit = useCallback(() => {
    setSubmitted({
      filters: draftFilters,
      seasonType: draftSeasonType,
      sort: submitted.sort,
      page: 1,
    });
  }, [draftFilters, draftSeasonType, submitted.sort]);

  const handleClear = useCallback(() => {
    setDraftFilters({});
    setDraftSeasonType("All");
    setSubmitted({
      filters: {},
      seasonType: "All",
      sort: { by: "closeness", dir: "asc" },
      page: 1,
    });
  }, []);

  const handleSortChange = useCallback(
    (next: UiState["sort"]) => {
      setSubmitted((s) => ({ ...s, sort: next, page: 1 }));
    },
    [],
  );

  const handlePageChange = useCallback((next: number) => {
    setSubmitted((s) => ({ ...s, page: next }));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const showingFrom = useMemo(
    () => (rows.length === 0 ? 0 : (submitted.page - 1) * PER_PAGE + 1),
    [rows.length, submitted.page],
  );
  const showingTo = useMemo(
    () => (submitted.page - 1) * PER_PAGE + rows.length,
    [rows.length, submitted.page],
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          <span className="text-emerald-400">stat</span>line
        </h1>
        <p className="hidden text-sm text-zinc-500 sm:block">
          Find NBA player-games by stat ranges.
        </p>
      </header>

      <div className="space-y-6">
        <FilterPanel
          filters={draftFilters}
          seasonType={draftSeasonType}
          onChange={({ filters, seasonType }) => {
            setDraftFilters(filters);
            setDraftSeasonType(seasonType);
          }}
          onSubmit={handleSubmit}
          onClear={handleClear}
        />

        <main className="space-y-4">
          <SortControls
            sort={submitted.sort}
            onChange={handleSortChange}
            total={total}
            showingFrom={showingFrom}
            showingTo={showingTo}
          />

          {error && (
            <div className="rounded-md border border-rose-800 bg-rose-950/50 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          )}

          <div className="space-y-3">
            {loading ? (
              Array.from({ length: rows.length || 5 }).map((_, i) => <SkeletonCard key={i} />)
            ) : (
              <>
                {rows.length === 0 && !error && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 text-center text-sm text-zinc-400">
                    No performances matched. Try widening a range.
                  </div>
                )}
                {rows.map((p) => (
                  <PerformanceCard key={`${p.game_id}-${p.player_id}`} p={p} />
                ))}
              </>
            )}
          </div>

          <Pagination
            page={submitted.page}
            perPage={PER_PAGE}
            total={total}
            onChange={handlePageChange}
          />
        </main>
      </div>
    </div>
  );
}
