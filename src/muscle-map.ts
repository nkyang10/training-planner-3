/**
 * The heat legend strip under the 3D muscle figure: ten swatches with the anchor words, so the fill is never
 * the only carrier of meaning. The flat SVG figure that used to live here is retired — the muscle surfaces are
 * painted directly on the reusable 3D figure (src/muscle-viewer.ts), and the text representation is the
 * plugin's list tab.
 */

/** The heat legend: ten swatches with the anchor words, so the fill is never the only carrier of meaning. */
export function renderMuscleLegend(): string {
  const stops = [0, 2, 4, 6, 8, 10];
  const swatches = stops
    .map((value) => `<span class="legend-swatch" style="background:${sorenessSwatch(value)}" title="${value}/10"></span>`)
    .join("");
  return `<div class="muscle-legend" aria-hidden="true"><span class="legend-label">0</span>${swatches}<span class="legend-label">10</span></div><p class="muted small muscle-legend-note">Soreness heat · 0 nothing · 5 noticeable · 7 sore to touch · 9-10 severe. A low red pulse = needs care.</p>`;
}

function sorenessSwatch(value: number): string {
  const stops: readonly { max: number; fill: string }[] = [
    { max: 0, fill: "#f6eee6" },
    { max: 2, fill: "#fde8cf" },
    { max: 4, fill: "#fbd5a8" },
    { max: 6, fill: "#f5a257" },
    { max: 8, fill: "#ed5f1f" },
    { max: 10, fill: "#c92d0b" },
  ];
  const clamped = Math.max(0, Math.min(10, Math.round(value)));
  const stop = stops.find((entry) => clamped <= entry.max);
  return stop === undefined ? "#c92d0b" : stop.fill;
}
