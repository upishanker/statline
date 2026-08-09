"use client";

import { useState } from "react";

type Props = {
  teamId: number;
  teamAbbr: string;
  size?: number;
};

export default function TeamLogo({ teamId, teamAbbr, size = 72 }: Props) {
  const [failed, setFailed] = useState(false);
  // NBA CDN serves SVG logos keyed by the stable franchise team_id; covers
  // historical/defunct teams that abbreviation-based CDNs miss. The SVGs
  // have no intrinsic width/height (only viewBox), and many primary logos
  // are white-on-transparent — so we render in a fixed square light box.
  const src = `https://cdn.nba.com/logos/nba/${teamId}/primary/L/logo.svg`;

  if (failed) {
    return (
      <span
        className="inline-flex items-center justify-center rounded bg-zinc-800 px-1.5 text-[10px] font-bold tracking-wide text-zinc-300"
        style={{ height: size }}
      >
        {teamAbbr}
      </span>
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={teamAbbr}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-full w-full object-contain"
      />
    </div>
  );
}
