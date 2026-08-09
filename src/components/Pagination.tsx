"use client";

type Props = {
  page: number;
  perPage: number;
  total: number | null;
  onChange: (page: number) => void;
};

export default function Pagination({ page, perPage, total, onChange }: Props) {
  const totalPages = total === null ? null : Math.max(1, Math.ceil(total / perPage));
  const canPrev = page > 1;
  const canNext = totalPages === null ? false : page < totalPages;

  return (
    <div className="flex items-center justify-between gap-3 border-t border-zinc-800 pt-4 text-sm">
      <button
        type="button"
        disabled={!canPrev}
        onClick={() => onChange(page - 1)}
        className="rounded-md border border-zinc-800 px-3 py-1.5 text-zinc-300 hover:border-zinc-600 disabled:opacity-30"
      >
        ← Prev
      </button>
      <div className="text-zinc-400">
        Page <span className="font-semibold text-zinc-200">{page}</span>
        {totalPages !== null && <> of {totalPages.toLocaleString()}</>}
      </div>
      <button
        type="button"
        disabled={!canNext}
        onClick={() => onChange(page + 1)}
        className="rounded-md border border-zinc-800 px-3 py-1.5 text-zinc-300 hover:border-zinc-600 disabled:opacity-30"
      >
        Next →
      </button>
    </div>
  );
}
