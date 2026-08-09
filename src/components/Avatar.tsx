"use client";

import { useState } from "react";

type Props = {
  playerId: number;
  playerName: string;
  size?: number;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]!.toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1][0]!).toUpperCase();
}

export default function Avatar({ playerId, playerName, size = 72 }: Props) {
  const [failed, setFailed] = useState(false);
  const src = `https://cdn.nba.com/headshots/nba/latest/260x190/${playerId}.png`;
  // CDN headshots are 260x190 — preserve that 13:9 aspect ratio.
  const width = Math.round((size * 260) / 190);

  if (failed) {
    return (
      <div
        className="flex shrink-0 items-center justify-center bg-zinc-900 text-xs font-semibold text-zinc-400"
        style={{ width, height: size }}
      >
        {initials(playerName)}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={playerName}
      width={width}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="shrink-0"
    />
  );
}
