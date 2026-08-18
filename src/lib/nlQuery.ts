// Natural-language → SearchRequest translation.
//
// The model never sees SQL and never touches results. It only fills in the same
// shape FilterPanel produces, which then goes through the usual zod validation
// and buildSearchQuery. A hallucinated stat key fails validation; it can't reach
// the database.

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { STAT_KEYS } from "./statKeys";
import type { Criteria, Filters, SeasonType, SortBy } from "./buildSearchQuery";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.7-flash";

export type ParsedQuery = {
  criteria: Criteria & { filters: Filters; seasonType: SeasonType };
  sort: { by: SortBy; dir: "asc" | "desc" };
  unsupported: string[];
};

/** Thrown when the upstream model is unreachable, unconfigured, or out of quota. */
export class AiUnavailableError extends Error {}

const SORT_KEYS = ["closeness", "date", ...STAT_KEYS] as const;

// Hand-written JSON Schema for response_format. The project is on zod 3, whose
// z.toJSONSchema() doesn't exist (zod 4 only), so this is written out rather
// than derived — but the stat enum, the one field that could realistically
// drift, still comes from STAT_KEYS.
const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    constraints: {
      type: "array",
      description: "One entry per box-score stat the question constrains.",
      items: {
        type: "object",
        properties: {
          stat: { type: "string", enum: [...STAT_KEYS] },
          min: { type: "number", description: "Omit if the question sets no lower bound." },
          max: { type: "number", description: "Omit if the question sets no upper bound." },
        },
        required: ["stat"],
      },
    },
    player: { type: "string", description: "Player name or name fragment." },
    team: { type: "string", description: "3-letter abbreviation of the player's own team." },
    opponent: { type: "string", description: "3-letter abbreviation of the opposing team." },
    outcome: { type: "string", enum: ["W", "L", "All"] },
    venue: { type: "string", enum: ["home", "away", "All"] },
    seasonFrom: { type: "string", description: "Earliest season, e.g. 2015-16." },
    seasonTo: { type: "string", description: "Latest season, e.g. 2023-24." },
    seasonType: { type: "string", enum: ["Regular Season", "Playoffs", "All"] },
    sort: {
      type: "object",
      properties: {
        by: { type: "string", enum: [...SORT_KEYS] },
        dir: { type: "string", enum: ["asc", "desc"] },
      },
      required: ["by", "dir"],
    },
    unsupported: {
      type: "array",
      description: "Verbatim fragments of the question that this schema cannot express.",
      items: { type: "string" },
    },
  },
  required: ["constraints", "seasonType", "sort", "unsupported"],
} as const;

const NON_TEAMS = new Set(["ALL", "ANY", "NUL", "N/A"]);

const teamAbbr = z
  .string()
  .nullish()
  .transform((v) => {
    const t = v?.trim().toUpperCase();
    return t && /^[A-Z]{3}$/.test(t) && !NON_TEAMS.has(t) ? t : null;
  });

const parsedSchema = z.object({
  constraints: z
    .array(
      z.object({
        stat: z.enum(STAT_KEYS),
        min: z.number().finite().nullish(),
        max: z.number().finite().nullish(),
      }),
    )
    .max(STAT_KEYS.length),
  player: z.string().max(60).nullish(),
  // The model reaches for "ALL"/"ANY" as a "no filter" sentinel, and those pass a
  // bare 3-letter check — they'd then match zero rows. Normalize them to null.
  team: teamAbbr,
  opponent: teamAbbr,
  outcome: z.enum(["W", "L", "All"]).nullish(),
  venue: z.enum(["home", "away", "All"]).nullish(),
  seasonFrom: z.string().regex(/^\d{4}-\d{2}$/).nullish(),
  seasonTo: z.string().regex(/^\d{4}-\d{2}$/).nullish(),
  seasonType: z.enum(["Regular Season", "Playoffs", "All"]),
  sort: z.object({
    by: z.enum(SORT_KEYS),
    dir: z.enum(["asc", "desc"]),
  }),
  unsupported: z.array(z.string().max(120)).max(10),
});

const SYSTEM = `You translate natural-language NBA questions into a structured filter over a
database of every player's box score for every game from 1946-47 to today, regular season and
playoffs. One row per (game, player).

Available stats: ${STAT_KEYS.join(", ")}.

Rules:
- Shooting percentages (fg_pct, fg3_pct, ft_pct) are stored as 0-1 fractions. "50% shooting"
  is 0.5, not 50.
- "40+ points" is {stat:"pts", min:40} with no max. "under 5 turnovers" is {stat:"tov", max:5}.
  "between 20 and 30" sets both.
- A composite line like "20/20/10" or "triple-double" becomes one constraint per stat
  (pts/reb/ast at min 10 for a triple-double, unless the question names other categories).
- Superlatives ("most points ever", "highest scoring games") set no range on that stat and
  instead sort by it: {by:"pts", dir:"desc"}.
- Otherwise always sort {by:"closeness", dir:"asc"} — that ranks games nearest the requested
  line, which is what someone asking "who else has done X" wants.
- "against X", "vs X", "versus X" always means opponent = X. "playing for X", "on the X",
  "as a Laker" means team = X. Use standard 3-letter abbreviations, and the historical one for
  defunct franchises (SEA Seattle SuperSonics, NJN New Jersey Nets, VAN Vancouver Grizzlies).
- Only set team or opponent when a team is actually named. Omit the field otherwise — never
  emit "ALL", "ANY" or a placeholder.
- "in a loss", "in a losing effort", "and still lost" means outcome "L". "in a win", "and won"
  means outcome "W". Omit outcome when the question doesn't say.
- "at home" means venue "home"; "on the road", "away" means venue "away".
- Seasons are "YYYY-YY". "in 2016" most likely means the 2015-16 season; if a question spans
  years ("since 2015") set seasonFrom and leave seasonTo unset.
- Decades map to a season range: "the 90s" is seasonFrom "1990-91" and seasonTo "1999-00";
  "the 2000s" is "2000-01" to "2009-10". Same for "early 80s" (1980-81 to 1984-85) and
  "late 2010s" (2015-16 to 2019-20).
- Every time-related phrase must end up somewhere: as a season range if you can express it,
  otherwise in unsupported. Never drop one silently.

Before you answer, re-read the question one clause at a time and check that every clause is
represented in your output — as a constraint, as a field, or in unsupported. Questions that
mention a team, a stat, a venue and a time period need all four. Dropping a clause silently is
the worst possible failure, because the person cannot tell it happened.
- Stats that did not exist in earlier eras are stored as NULL, so filtering on them excludes
  those games: no 3-point data before 1979-80, and no oreb/dreb/stl/blk/tov before 1973-74.
  That is expected behaviour — do not try to work around it.
- Put any part of the question you cannot express — an exact date, a month, a game number, an
  age, a jersey number, anything about weather, playoffs round, or career totals — into
  "unsupported", quoting the user's own words. Never approximate it with a stat range.
- If the question sets no constraints at all, return empty constraints and unsupported.

Worked examples.

"LeBron 40 point games against Boston in a loss" →
constraints [{stat:"pts",min:40}], player "LeBron James", opponent "BOS", outcome "L",
seasonType "All", sort {by:"closeness",dir:"asc"}, unsupported [].

"most rebounds ever in a playoff game" →
constraints [], seasonType "Playoffs", sort {by:"reb",dir:"desc"}, unsupported [].

"Curry 8 threes at home since 2018 on his birthday" →
constraints [{stat:"fg3m",min:8}], player "Stephen Curry", venue "home",
seasonFrom "2018-19", seasonType "All", sort {by:"closeness",dir:"asc"},
unsupported ["on his birthday"].`;

let _ai: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new AiUnavailableError("GEMINI_API_KEY is not configured");
  }
  if (!_ai) _ai = new GoogleGenAI({});
  return _ai;
}

/** Free tier answers quota exhaustion with 429, and outages with 5xx. Both mean "use the filters". */
function isUnavailable(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (typeof status === "number" && (status === 429 || status >= 500)) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /\b429\b|quota|rate.?limit|RESOURCE_EXHAUSTED|UNAVAILABLE|\b50\d\b/i.test(msg);
}

export async function parseQuery(text: string): Promise<ParsedQuery> {
  let raw: string;
  try {
    const interaction = await client().interactions.create({
      model: MODEL,
      system_instruction: SYSTEM,
      input: text,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: RESPONSE_JSON_SCHEMA as unknown as Record<string, unknown>,
      },
      // "minimal" type-checks (it's in the SDK's union) but the flash models reject
      // it at runtime — low/medium/high are the accepted values. "low" handles simple
      // questions but starts dropping clauses once a question carries four or more
      // (team + stat + venue + era), so this sits at medium.
      generation_config: { thinking_level: "medium", max_output_tokens: 1024 },
    });
    raw = interaction.output_text ?? "";
  } catch (err) {
    if (isUnavailable(err)) throw new AiUnavailableError("upstream model unavailable");
    throw err;
  }

  if (!raw.trim()) throw new Error("empty response from model");
  const parsed = parsedSchema.parse(JSON.parse(raw));

  const filters: Filters = {};
  for (const c of parsed.constraints) {
    const min = c.min ?? undefined;
    const max = c.max ?? undefined;
    if (min === undefined && max === undefined) continue;
    filters[c.stat] = { min, max };
  }

  // Closeness needs at least one stat range to rank by; fall back to newest-first.
  const sort =
    parsed.sort.by === "closeness" && Object.keys(filters).length === 0
      ? { by: "date" as SortBy, dir: "desc" as const }
      : parsed.sort;

  return {
    criteria: {
      filters,
      seasonType: parsed.seasonType,
      player: parsed.player ?? null,
      team: parsed.team?.toUpperCase() ?? null,
      opponent: parsed.opponent?.toUpperCase() ?? null,
      outcome: parsed.outcome ?? "All",
      venue: parsed.venue ?? "All",
      seasonFrom: parsed.seasonFrom ?? null,
      seasonTo: parsed.seasonTo ?? null,
    },
    sort,
    unsupported: parsed.unsupported,
  };
}
