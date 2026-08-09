"use client";

import { useMemo } from "react";

type Props = {
  bounds: { min: number; max: number; step: number };
  /** Current min value; `undefined` means "open / no lower bound" — slider sits at bounds.min. */
  minValue: number | undefined;
  /** Current max value; `undefined` means "open / no upper bound" — slider sits at bounds.max. */
  maxValue: number | undefined;
  onChange: (next: { min?: number; max?: number }) => void;
};

/**
 * Dual-thumb range slider built from two overlaid native <input type="range">
 * controls. Both thumbs are independently draggable; we use pointer-events
 * trickery so each thumb only "owns" the half of the track closer to it.
 *
 * Emits absolute min/max in the same raw units as `bounds` (no scaling).
 */
export default function RangeSlider({ bounds, minValue, maxValue, onChange }: Props) {
  const lo = minValue ?? bounds.min;
  const hi = maxValue ?? bounds.max;
  const clampedLo = Math.max(bounds.min, Math.min(lo, bounds.max));
  const clampedHi = Math.max(bounds.min, Math.min(hi, bounds.max));

  const pct = (v: number) =>
    bounds.max === bounds.min ? 0 : ((v - bounds.min) / (bounds.max - bounds.min)) * 100;

  const fillStyle = useMemo(
    () => ({
      left: `${pct(Math.min(clampedLo, clampedHi))}%`,
      right: `${100 - pct(Math.max(clampedLo, clampedHi))}%`,
    }),
    [clampedLo, clampedHi, bounds.min, bounds.max], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleLow = (v: number) => {
    // Snap to step grid to avoid float drift.
    const snapped = Math.round(v / bounds.step) * bounds.step;
    const clamped = Math.max(bounds.min, Math.min(snapped, clampedHi));
    // Treat "at the lower bound" as "no min filter" so the slider can express open ranges.
    onChange({ min: clamped <= bounds.min ? undefined : clamped, max: maxValue });
  };
  const handleHigh = (v: number) => {
    const snapped = Math.round(v / bounds.step) * bounds.step;
    const clamped = Math.min(bounds.max, Math.max(snapped, clampedLo));
    onChange({ min: minValue, max: clamped >= bounds.max ? undefined : clamped });
  };

  return (
    <div className="relative h-5 select-none">
      {/* Track */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-zinc-800" />
      {/* Active fill */}
      <div
        className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-emerald-400/70"
        style={fillStyle}
      />
      {/* Two native sliders stacked. `pointer-events: none` on the track but
          `auto` on the thumbs lets both thumbs be draggable. */}
      <input
        type="range"
        min={bounds.min}
        max={bounds.max}
        step={bounds.step}
        value={clampedLo}
        onChange={(e) => handleLow(Number(e.target.value))}
        className="range-thumb absolute inset-0 h-5 w-full appearance-none bg-transparent"
        aria-label="minimum"
      />
      <input
        type="range"
        min={bounds.min}
        max={bounds.max}
        step={bounds.step}
        value={clampedHi}
        onChange={(e) => handleHigh(Number(e.target.value))}
        className="range-thumb absolute inset-0 h-5 w-full appearance-none bg-transparent"
        aria-label="maximum"
      />
    </div>
  );
}
