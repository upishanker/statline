"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FilterPanel from "./FilterPanel";
import SortControls from "./SortControls";
import PerformanceCard from "./PerformanceCard";
import SkeletonCard from "./SkeletonCard";
import Pagination from "./Pagination";
import NlSearchBar from "./NlSearchBar";
import {
  draftOf,
  EMPTY_DRAFT,
  paramsToState,
  stateToParams,
  type Draft,
  type UiState,
} from "./urlState";
import type { Performance, SearchResponse } from "@/types";

const PER_PAGE = 25;

function readInitialState(): UiState {
  if (typeof window === "undefined") {
    return { ...EMPTY_DRAFT, sort: { by: "closeness", dir: "asc" }, page: 1 };
  }
  return paramsToState(new URLSearchParams(window.location.search));
}

export default function App({ teams }: { teams: string[] }) {
  // Submitted state — what's actually been searched (drives URL & fetches).
  const [submitted, setSubmitted] = useState<UiState>(readInitialState);
  // Draft state — what's in the filter inputs right now.
  const [draft, setDraft] = useState<Draft>(() => draftOf(submitted));

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
      setDraft(draftOf(next));
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
        ...draftOf(submitted),
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
    setSubmitted({ ...draft, sort: submitted.sort, page: 1 });
  }, [draft, submitted.sort]);

  const handleClear = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    setSubmitted({ ...EMPTY_DRAFT, sort: { by: "closeness", dir: "asc" }, page: 1 });
  }, []);

  /**
   * The NL bar is an input method for the filter state, not a parallel results
   * path: it writes the same draft the panel edits, then submits. The controls
   * visibly move to match the sentence, so a wrong reading is obvious and fixable.
   */
  const handleParsed = useCallback(
    (next: Draft, sort: UiState["sort"]) => {
      setDraft(next);
      setSubmitted({ ...next, sort, page: 1 });
    },
    [],
  );

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
        <NlSearchBar onParsed={handleParsed} />

        <FilterPanel
          value={draft}
          teams={teams}
          onChange={setDraft}
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
