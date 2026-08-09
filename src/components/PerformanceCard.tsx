import type { Performance } from "@/types";
import Avatar from "./Avatar";
import TeamLogo from "./TeamLogo";

function fmtPct(v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(1)}%`;
}
function fmtNum(v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  return String(v);
}
function fmtMin(v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  return v >= 10 ? String(Math.round(v)) : v.toFixed(1);
}
function fmtPm(v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  return v > 0 ? `+${v}` : String(v);
}
function fmtDate(s: string) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function PerformanceCard({ p }: { p: Performance }) {
  const matchup = `${p.team_abbr} ${p.home ? "vs" : "@"} ${p.opponent_abbr ?? "?"}`;
  return (
    <article className="grid grid-cols-1 gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 sm:grid-cols-[minmax(0,15rem)_1fr]">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex shrink-0 flex-col items-center gap-1">
          <Avatar playerId={p.player_id} playerName={p.player_name} />
          <TeamLogo teamId={p.team_id} teamAbbr={p.team_abbr} />
        </div>
        <div className="min-w-0 text-center">
          <div className="text-base font-semibold leading-tight text-zinc-100">
            {(() => {
              const parts = p.player_name.trim().split(/\s+/);
              const first = parts[0] ?? p.player_name;
              const last = parts.slice(1).join(" ");
              return (
                <>
                  <div className="truncate">{first}</div>
                  {last && <div className="truncate">{last}</div>}
                </>
              );
            })()}
          </div>
          <div className="mt-0.5 truncate text-sm text-zinc-400">{matchup}</div>
          {p.win !== null && (
            <div className="mt-1">
              <span
                className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  p.win
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-rose-500/15 text-rose-300"
                }`}
              >
                {p.win ? "W" : "L"}
              </span>
            </div>
          )}
          <div className="mt-1 text-xs text-zinc-500">{fmtDate(p.game_date)}</div>
          <div className="mt-0.5 truncate text-xs text-zinc-500">
            {p.season}
            {p.season_type === "Playoffs" && " Playoffs"}
          </div>
        </div>
      </div>

      <div className="flex flex-col justify-center gap-3">
        <div className="grid grid-cols-5 gap-2">
          {([
            ["PTS", p.pts],
            ["REB", p.reb],
            ["AST", p.ast],
            ["STL", p.stl],
            ["BLK", p.blk],
          ] as const).map(([label, v]) => (
            <div key={label} className="rounded-md bg-zinc-950/60 px-2 py-2 text-center">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
              <div className="text-2xl font-semibold tabular-nums text-zinc-100">{fmtNum(v)}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-2 text-center text-xs tabular-nums text-zinc-400">
          <div className="rounded-md bg-zinc-950/60 px-2 py-1">
            <div className="text-[9px] uppercase tracking-wide text-zinc-500">FG</div>
            <div>{fmtNum(p.fgm)}-{fmtNum(p.fga)} <span className="text-zinc-500">({fmtPct(p.fg_pct)})</span></div>
          </div>
          <div className="rounded-md bg-zinc-950/60 px-2 py-1">
            <div className="text-[9px] uppercase tracking-wide text-zinc-500">3P</div>
            <div>{fmtNum(p.fg3m)}-{fmtNum(p.fg3a)} <span className="text-zinc-500">({fmtPct(p.fg3_pct)})</span></div>
          </div>
          <div className="rounded-md bg-zinc-950/60 px-2 py-1">
            <div className="text-[9px] uppercase tracking-wide text-zinc-500">FT</div>
            <div>{fmtNum(p.ftm)}-{fmtNum(p.fta)} <span className="text-zinc-500">({fmtPct(p.ft_pct)})</span></div>
          </div>
          <div className="rounded-md bg-zinc-950/60 px-2 py-1">
            <div className="text-[9px] uppercase tracking-wide text-zinc-500">MIN · TOV · +/-</div>
            <div>{fmtMin(p.min)} · {fmtNum(p.tov)} · {fmtPm(p.plus_minus)}</div>
          </div>
        </div>
      </div>
    </article>
  );
}
