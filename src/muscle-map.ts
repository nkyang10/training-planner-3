/**
 * The interactive front/back muscle figure, rendered server-side as one SVG per view.
 *
 * The art is deliberately stylized (the regions are fitness-app shapes, not anatomy plates): a soft silhouette
 * behind, the catalog's muscle regions on top. Bilateral regions are drawn once for the left side and mirrored
 * inside one group, so both halves of "calves" are one keyboard target and one logical muscle. Heat fills and
 * "muscles worked" emphasis are passed in by the caller; selection is a class the client script toggles.
 *
 * Every region is a real button (role, tabindex, aria-pressed, aria-label); the grouped muscle list on the page
 * is the text alternative, so the figure itself carries no prose.
 */
import { getMuscle, MUSCLE_CATALOG, type MuscleMapView, type MuscleWork } from "./muscles";

const VIEW_WIDTH = 230;
const VIEW_HEIGHT = 470;
const MIRROR = `translate(${VIEW_WIDTH} 0) scale(-1 1)`;

/** One logical region's art: `center` paths are drawn once; `left` paths are mirrored to the right. */
interface RegionArt {
  center?: readonly string[];
  left?: readonly string[];
}

const FRONT_ART: Readonly<Record<string, RegionArt>> = {
  neck: { center: ["M106 34 Q115 30 124 34 L124 44 Q115 48 106 44 Z"] },
  delts: { left: ["M68 52 Q66 46 76 46 L96 48 Q102 50 102 58 Q100 72 92 78 Q80 82 72 76 Q66 68 68 52 Z"] },
  chest: { left: ["M94 56 Q95 50 103 50 L113 52 Q114 56 114 64 L114 88 Q114 94 107 94 Q100 94 97 86 Q92 74 92 64 Q92 58 94 56 Z"] },
  biceps: { left: ["M46 86 Q45 88 45 96 L46 124 Q46 134 55 134 Q64 134 64 124 L63 96 Q63 86 55 86 Z"] },
  forearms: { left: ["M45 142 Q44 144 44 152 L42 186 Q42 196 51 196 Q60 196 60 186 L61 152 Q61 144 53 142 Z"] },
  abs: {
    center: [
      "M101 100 Q115 96 129 100 L129 134 Q115 140 101 134 Z",
      "M101 140 Q115 136 129 140 L129 172 Q115 178 101 172 Z",
    ],
  },
  obliques: { left: ["M83 106 Q82 108 82 116 L82 152 Q82 162 89 162 Q97 162 97 152 L97 112 Q97 105 90 106 Z"] },
  "hip-flexors": { left: ["M97 170 Q96 172 96 180 L96 192 Q96 200 104 200 Q113 200 113 192 L113 174 Q107 169 97 170 Z"] },
  quads: { left: ["M79 208 Q77 210 77 218 L77 294 Q77 306 87 306 Q101 306 101 294 L101 216 Q101 208 93 208 Z"] },
  adductors: { left: ["M105 210 Q104 212 104 220 L104 278 Q104 288 109 288 Q114 288 114 278 L114 216 Q114 209 109 210 Z"] },
  tibialis: { left: ["M83 322 Q82 324 82 332 L83 392 Q83 402 90 402 Q97 402 97 392 L97 330 Q97 322 90 322 Z"] },
};

const BACK_ART: Readonly<Record<string, RegionArt>> = {
  neck: { center: ["M106 34 Q115 30 124 34 L124 44 Q115 48 106 44 Z"] },
  delts: { left: ["M68 52 Q66 46 76 46 L96 48 Q102 50 102 58 Q100 72 92 78 Q80 82 72 76 Q66 68 68 52 Z"] },
  traps: {
    center: ["M93 48 Q115 40 137 48 Q134 70 120 84 Q115 87 110 84 Q96 70 93 48 Z"],
  },
  "rotator-cuff": { left: ["M86 62 Q84 64 84 72 L86 90 Q86 98 94 98 Q102 98 102 90 L102 68 Q96 61 86 62 Z"] },
  lats: { left: ["M86 92 H110 Q112 94 111 100 L106 148 Q105 158 96 158 Q88 156 87 148 L85 100 Q84 94 86 92 Z"] },
  "lower-back": { left: ["M102 164 Q101 166 101 174 L101 192 Q101 202 108 202 Q115 202 115 192 L115 170 Q115 163 108 164 Z"] },
  glutes: { left: ["M86 210 Q85 212 85 220 L86 244 Q86 258 96 260 Q106 262 112 254 L114 220 Q114 210 105 210 Z"] },
  abductors: { left: ["M72 212 Q70 214 70 222 L70 242 Q70 252 77 252 Q85 252 85 242 L85 216 Q85 209 78 210 Z"] },
  triceps: { left: ["M46 86 Q45 88 45 96 L46 124 Q46 134 55 134 Q64 134 64 124 L63 96 Q63 86 55 86 Z"] },
  forearms: { left: ["M45 142 Q44 144 44 152 L42 186 Q42 196 51 196 Q60 196 60 186 L61 152 Q61 144 53 142 Z"] },
  hamstrings: { left: ["M79 264 Q78 266 78 274 L79 308 Q79 322 90 322 Q102 322 102 308 L103 272 Q103 264 91 264 Z"] },
  calves: { left: ["M83 332 Q82 334 82 342 L83 388 Q83 400 92 400 Q101 400 101 388 L101 340 Q101 332 92 332 Z"] },
};

/** The body behind the muscles: a soft silhouette so the regions read as a figure, not floating shapes. */
const SILHOUETTE = [
  `<circle class="muscle-body" cx="115" cy="20" r="13"></circle>`,
  `<rect class="muscle-body" x="104" y="30" width="22" height="20" rx="8"></rect>`,
  `<path class="muscle-body" d="M66 110 Q66 132 78 142 L78 196 Q78 206 88 206 H142 Q152 206 152 196 L152 142 Q164 132 164 110 L164 56 Q164 44 152 44 H78 Q66 44 66 56 Z"></path>`,
  `<rect class="muscle-body" x="42" y="58" width="26" height="150" rx="12"></rect>`,
  `<rect class="muscle-body" x="162" y="58" width="26" height="150" rx="12"></rect>`,
  `<rect class="muscle-body" x="44" y="208" width="22" height="22" rx="8"></rect>`,
  `<rect class="muscle-body" x="164" y="208" width="22" height="22" rx="8"></rect>`,
  `<rect class="muscle-body" x="75" y="206" width="40" height="224" rx="14"></rect>`,
  `<rect class="muscle-body" x="115" y="206" width="40" height="224" rx="14"></rect>`,
  `<rect class="muscle-body" x="70" y="414" width="42" height="22" rx="9"></rect>`,
  `<rect class="muscle-body" x="118" y="414" width="42" height="22" rx="9"></rect>`,
].join("");

export interface MuscleFigureFill {
  /** SVG fill for the region, already resolved (heat ramp or worked emphasis). */
  fill: string;
  /** Warning conditions draw a dashed danger stroke so the flag never relies on hue alone. */
  dashed?: boolean;
}

export interface MuscleFigureOptions {
  /** Present-state fills per muscle id (heat mode). */
  fills?: Readonly<Record<string, MuscleFigureFill>>;
  /** Muscles-worked emphasis (read-only mode): primary darker, secondary lighter. */
  worked?: MuscleWork;
  /** Keyboard-clickable regions with selection state; defaults to true. */
  interactive?: boolean;
  /** Muscle ids that render selected (server-side prefill, e.g. from ?activity=). */
  selected?: readonly string[];
  /** Stateful region labels, e.g. "Calves, 7/10 sore to touch"; falls back to the muscle name. */
  ariaLabels?: Readonly<Record<string, string>>;
  /** The view label used in the aria-label of the root. */
  viewLabel: string;
}

function regionPaths(art: RegionArt): string {
  const parts: string[] = [];
  for (const d of art.center ?? []) parts.push(`<path d="${d}"></path>`);
  for (const d of art.left ?? []) {
    parts.push(`<path d="${d}"></path>`);
    parts.push(`<path d="${d}" transform="${MIRROR}"></path>`);
  }
  return parts.join("");
}

/**
 * One full-body figure. In interactive mode every region is a button with an aria-label that carries its
 * current state; in worked mode the whole figure is one image with a spoken summary.
 */
export function renderMuscleFigure(view: MuscleMapView, options: MuscleFigureOptions): string {
  const interactive = options.interactive !== false;
  const art = view === "front" ? FRONT_ART : BACK_ART;
  const fills = options.fills ?? {};
  const worked = options.worked;
  const selected = new Set(options.selected ?? []);
  const groups: string[] = [];
  for (const muscle of MUSCLE_CATALOG) {
    if (muscle.view !== view && muscle.view !== "both") continue;
    const muscleArt = art[muscle.id];
    if (muscleArt === undefined) continue;
    const fill = worked !== undefined
      ? worked.primary.includes(muscle.id)
        ? "var(--ember-deep)"
        : worked.secondary.includes(muscle.id)
          ? "var(--solar)"
          : "var(--muscle-base)"
      : fills[muscle.id]?.fill ?? "var(--muscle-base)";
    const dashed = worked === undefined && fills[muscle.id]?.dashed === true;
    const classes = ["muscle-region", selected.has(muscle.id) ? "selected" : ""].filter((part) => part.length > 0).join(" ");
    const strokeDash = dashed ? ' stroke-dasharray="5 4"' : "";
    const ariaState = interactive
      ? ` tabindex="0" role="button" aria-pressed="${selected.has(muscle.id) ? "true" : "false"}" aria-label="${options.ariaLabels?.[muscle.id] ?? muscle.name}"`
      : "";
    groups.push(
      `<g class="${classes}" data-muscle="${muscle.id}" fill="${fill}" stroke="${dashed ? "var(--danger)" : "var(--muscle-stroke)"}" stroke-width="1.4"${strokeDash}${ariaState}>${regionPaths(muscleArt)}</g>`,
    );
  }
  const role = interactive ? `group` : `img`;
  const ariaLabel = interactive
    ? `${options.viewLabel} muscle map. Tab through the muscles; Enter selects one.`
    : `${options.viewLabel} muscle map: worked muscles highlighted.`;
  return `<svg class="muscle-figure${interactive ? "" : " muscle-figure-static"}" viewBox="0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}" role="${role}" aria-label="${ariaLabel}"><title>${options.viewLabel} muscle map</title>${SILHOUETTE}${groups.join("")}</svg>`;
}

/** The heat legend: ten swatches with the anchor words, so the fill is never the only carrier of meaning. */
export function renderMuscleLegend(): string {
  const stops = [0, 2, 4, 6, 8, 10];
  const swatches = stops
    .map((value) => `<span class="legend-swatch" style="background:${sorenessSwatch(value)}" title="${value}/10"></span>`)
    .join("");
  return `<div class="muscle-legend" aria-hidden="true"><span class="legend-label">0</span>${swatches}<span class="legend-label">10</span></div><p class="muted small muscle-legend-note">Soreness heat · 0 nothing · 5 noticeable · 7 sore to touch · 9-10 severe. Dashed outline = needs care.</p>`;
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

/** The read-only pair shown on the activity detail: front and back with worked muscles emphasized. */
export function renderWorkedPair(work: MuscleWork): string {
  const names = (ids: readonly string[]): string => ids.map((id) => getMuscle(id)?.name ?? id).join(", ");
  const primary = names(work.primary);
  const secondary = work.secondary.length === 0 ? "" : names(work.secondary);
  const summary = `Primary muscles: ${primary}.${secondary.length === 0 ? "" : ` Secondary: ${secondary}.`}`;
  return `<div class="worked-pair">${renderMuscleFigure("front", { worked: work, interactive: false, viewLabel: "Front view" })}${renderMuscleFigure("back", { worked: work, interactive: false, viewLabel: "Back view" })}</div><p class="muted small worked-pair-note">${summary}</p>`;
}
