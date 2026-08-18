"use client";

import { useState } from "react";
import type { Draft, UiState } from "./urlState";

type Props = {
  onParsed: (draft: Draft, sort: UiState["sort"]) => void;
};

const EXAMPLES = [
  "40 points and 10 assists in a loss",
  "LeBron triple doubles against Boston",
  "most rebounds ever in a playoff game",
];

export default function NlSearchBar({ onParsed }: Props) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resting, setResting] = useState(false);
  const [unsupported, setUnsupported] = useState<string[]>([]);

  const run = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setUnsupported([]);
    try {
      const r = await fetch("/api/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q: trimmed }),
      });
      const json = (await r.json()) as {
        criteria?: Draft;
        sort?: UiState["sort"];
        unsupported?: string[];
        error?: string;
        aiUnavailable?: boolean;
      };
      if (!r.ok || !json.criteria || !json.sort) {
        // Never guess a filter set from a failed parse: a wrong-but-plausible
        // result set is worse than an error, because the user can't tell.
        if (json.aiUnavailable) setResting(true);
        setError(
          json.aiUnavailable
            ? "AI search is resting — use the filters below."
            : json.error ?? "Couldn't read that. Try “40 pts 10 ast”.",
        );
        return;
      }
      setUnsupported(json.unsupported ?? []);
      onParsed(json.criteria, json.sort);
    } catch {
      setError("Network error — use the filters below.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(q);
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={q}
          maxLength={300}
          disabled={resting}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask in plain English — “40 points and 10 assists in a loss”"
          className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm outline-none placeholder:text-zinc-600 focus:border-zinc-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || resting || q.trim() === ""}
          className="rounded-md border border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:border-zinc-500 disabled:opacity-40"
        >
          {loading ? "Reading…" : "Ask"}
        </button>
      </form>

      {error && <p className="mt-2 text-xs text-amber-400">{error}</p>}

      {unsupported.length > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
          <span>Ignored:</span>
          {unsupported.map((u) => (
            <span
              key={u}
              className="rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-zinc-400"
            >
              {u}
            </span>
          ))}
        </p>
      )}

      {!error && unsupported.length === 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-zinc-600">
          <span>Try:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setQ(ex);
                void run(ex);
              }}
              className="rounded border border-zinc-800 px-1.5 py-0.5 hover:border-zinc-600 hover:text-zinc-400"
            >
              {ex}
            </button>
          ))}
        </p>
      )}
    </div>
  );
}
