export default function SkeletonCard() {
  const bar = "rounded bg-zinc-800/70";
  return (
    <article className="grid animate-pulse grid-cols-1 gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 sm:grid-cols-[minmax(0,15rem)_1fr]">
      {/* Left: avatar + team logo + name lines */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex shrink-0 flex-col items-center gap-1">
          <div className={`${bar} h-[72px] w-[99px]`} />
          <div className={`${bar} h-[72px] w-[72px]`} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div className={`${bar} h-3.5 w-20`} />
          <div className={`${bar} h-3.5 w-24`} />
          <div className={`${bar} h-3 w-16`} />
          <div className={`${bar} h-3 w-14`} />
          <div className={`${bar} h-3 w-20`} />
        </div>
      </div>

      {/* Right: main stat tiles + advanced row */}
      <div className="flex flex-col justify-center gap-3">
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-md bg-zinc-950/60 px-2 py-2">
              <div className={`${bar} mx-auto h-2.5 w-6`} />
              <div className={`${bar} mx-auto mt-2 h-6 w-10`} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-md bg-zinc-950/60 px-2 py-1">
              <div className={`${bar} mx-auto h-2 w-8`} />
              <div className={`${bar} mx-auto mt-1.5 h-3 w-14`} />
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
