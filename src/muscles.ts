/**
 * The muscle domain: the catalog of clickable regions, the runner-facing 0-10 soreness scale, the condition
 * taxonomy, the deterministic interpretation rules and the per-muscle drill library.
 *
 * Everything here is pure data and pure functions so the web shell, the coach prompt and the tests read one
 * source of truth. The interpretation is educational guidance, never a diagnosis: warning and urgent levels
 * hand the runner to a clinician instead of pretending the app can advise.
 *
 * Research basis (docs/MUSCLE-TAB.md §9): 0-10 anchored soreness (Lau et al. 2015, VAS-based DOMS work), DOMS
 * peaks 24-72 h and resolves by 5-7 days, soreness is not damage magnitude, sharp/localized pain and swelling and
 * numbness are not DOMS, light exercise is the best DOMS analgesic, rolling helps perceived soreness, stretching
 * does not reduce DOMS.
 */
import type { SessionKind } from "./types";

export type MuscleGroup = "shoulders" | "arms" | "torso" | "hips" | "legs";
export type MuscleMapView = "front" | "back";

/** Where a muscle is drawn. "both" renders on the front and the back figure. */
export type MuscleView = MuscleMapView | "both";

export type DrillCategory = "mobility" | "activation" | "recovery";

export interface MuscleDrill {
  name: string;
  category: DrillCategory;
  /** Dosage text, e.g. "2 × 15 per side, light". */
  how: string;
}

export interface MuscleDefinition {
  id: string;
  name: string;
  group: MuscleGroup;
  view: MuscleView;
  /** What the muscle does, in one coach sentence. */
  function: string;
  /** The issues that show up here, runner-first. */
  issues: string;
  /** What soreness in this muscle usually means after a run. */
  meaning: string;
  /** Recovery guidance while it is sore. */
  recovery: string;
  drills: MuscleDrill[];
}

/** The 20 clickable regions, ordered for display: shoulders and arms, torso, hips, legs. */
export const MUSCLE_CATALOG: readonly MuscleDefinition[] = [
  {
    id: "neck",
    name: "Neck",
    group: "shoulders",
    view: "both",
    function: "Holds the head steady and feeds posture and balance while you run.",
    issues: "Tension from stress, screen posture and bracing under effort; trauma is always a referral zone.",
    meaning: "Sore after shrugs or a very braced session is a normal response; constant tightness is usually behavioural.",
    recovery: "Heat, posture breaks and easy range of motion; no loaded neck work while it is sore.",
    drills: [
      { name: "Chin tucks", category: "activation", how: "2 × 10 slow, standing tall" },
      { name: "Slow neck circles", category: "mobility", how: "10 each direction, pain-free range only" },
      { name: "Suboccipital ball release", category: "recovery", how: "60 s at the base of the skull, gentle pressure" },
    ],
  },
  {
    id: "delts",
    name: "Shoulders (deltoids)",
    group: "shoulders",
    view: "both",
    function: "Lifts and steadies the arm; the front head helps every arm swing.",
    issues: "Front-delt overuse in pressing-heavy weeks; sharp pain during overhead movement is not DOMS territory.",
    meaning: "Diffuse soreness after pressing or heavy carry work is expected; a sharp catch at one overhead angle needs a clinician.",
    recovery: "Keep pressing below shoulder height while sore and raise the pulling volume.",
    drills: [
      { name: "Cross-body shoulder stretch", category: "mobility", how: "30 s per side, gentle" },
      { name: "Band external rotations", category: "activation", how: "2 × 15 per side, light" },
      { name: "Pendulum swings", category: "recovery", how: "3 × 10 relaxed, before upper-body work" },
    ],
  },
  {
    id: "rotator-cuff",
    name: "Rotator cuff",
    group: "shoulders",
    view: "back",
    function: "Centres the ball of the shoulder in its socket during every arm movement.",
    issues: "Overload in overhead or throwing work; night pain or weakness holding the arm up means refer.",
    meaning: "A deep dull ache after overhead volume is usually cuff fatigue; night pain is not.",
    recovery: "Cuff work is light by design and can stay in the program as activation while sore.",
    drills: [
      { name: "Side-lying external rotations", category: "activation", how: "2 × 15 per side, very light" },
      { name: "Prone Y-T-W raises", category: "activation", how: "2 × 10 each shape, no weight" },
      { name: "Sleeper stretch", category: "mobility", how: "Up to 30 s per side — stop if it pinches" },
    ],
  },
  {
    id: "traps",
    name: "Traps (upper back)",
    group: "shoulders",
    view: "back",
    function: "Elevates and retracts the shoulder blades and guards the neck under load.",
    issues: "Stress-related tone from carrying, breathing and bracing rather than damage; strain is rare outside explosive shrug work.",
    meaning: "Soreness after shrugs or carries is a normal response; one-sided persistent tightness usually has a habit behind it.",
    recovery: "Heat and gentle range of motion; never force a guarding neck into a deep stretch.",
    drills: [
      { name: "Ear-to-shoulder stretch", category: "mobility", how: "30 s per side, slight overpressure only" },
      { name: "Face pulls", category: "activation", how: "2 × 15, light band" },
      { name: "Upper-trap ball release", category: "recovery", how: "60 s per side against a wall" },
    ],
  },
  {
    id: "chest",
    name: "Chest (pectorals)",
    group: "torso",
    view: "front",
    function: "Presses and draws the arm across the body.",
    issues: "Strain at the chest-wall insertion during heavy pressing (sharp, with a pop); tightness rounds the shoulders in desk-bound runners.",
    meaning: "Soreness after pressing, dips or new push-up volume is one of the most reliable normal responses.",
    recovery: "Light pressing at most; avoid the deepest stretch position under load while very sore.",
    drills: [
      { name: "Doorway chest stretch", category: "mobility", how: "30 s × 2 per side, elbow at shoulder height" },
      { name: "Band pull-aparts", category: "activation", how: "2 × 15 before pressing" },
      { name: "Foam roll upper chest", category: "recovery", how: "45-60 s, gentle passes" },
    ],
  },
  {
    id: "lats",
    name: "Lats (side back)",
    group: "torso",
    view: "back",
    function: "Pulls the arm down and back and steadies the spine.",
    issues: "Strain near the tendon during heavy pull-ups; tightness limits overhead reach.",
    meaning: "Soreness after pull-up or row volume is expected for runners who add pulling work.",
    recovery: "Hanging and easy rows at reduced load both feel good when the lats are sore.",
    drills: [
      { name: "Bar hang", category: "mobility", how: "3 × 20-30 s, feet supported if needed" },
      { name: "Straight-arm pulldown", category: "activation", how: "2 × 12, light band" },
      { name: "Foam roll lats", category: "recovery", how: "60 s per side, side-lying" },
    ],
  },
  {
    id: "biceps",
    name: "Biceps",
    group: "arms",
    view: "front",
    function: "Bends the elbow and helps swing the arm.",
    issues: "Tendon irritation at the shoulder or elbow with heavy curling; strain during cheat curls.",
    meaning: "Belly soreness after curl volume is normal; pain at the tendon insertions while gripping is a load-management story.",
    recovery: "Avoid the fully stretched eccentric position while very sore.",
    drills: [
      { name: "Biceps wall stretch", category: "mobility", how: "30 s per side, palm back, arm extended" },
      { name: "Light high-rep curls", category: "activation", how: "2 × 20 at 30-40 % of usual" },
      { name: "Ball roll along the belly", category: "recovery", how: "60 s per arm, gentle" },
    ],
  },
  {
    id: "triceps",
    name: "Triceps",
    group: "arms",
    view: "back",
    function: "Straightens the elbow; the long head helps the arm swing back.",
    issues: "Elbow-tendon irritation with heavy pressing and dips.",
    meaning: "One of the most reliable DOMS sites after new pressing, dip or push-up volume.",
    recovery: "Keep pressing light; avoid the deep dip stretch under load while sore.",
    drills: [
      { name: "Overhead triceps stretch", category: "mobility", how: "30 s per side" },
      { name: "Band pushdown", category: "activation", how: "2 × 15, light" },
      { name: "Foam roll back of upper arm", category: "recovery", how: "45 s per arm" },
    ],
  },
  {
    id: "forearms",
    name: "Forearms",
    group: "arms",
    view: "both",
    function: "Grips, steers the wrist and stabilises the elbow.",
    issues: "Inner- or outer-elbow tendinopathy with gripping-heavy weeks; cramping during carries is common.",
    meaning: "Forearm soreness after climbing, heavy carries or high-rep pulling is expected; pinpoint elbow pain is not DOMS.",
    recovery: "Reduce gripping volume; alternate grips on pulls.",
    drills: [
      { name: "Wrist flexor and extensor stretches", category: "mobility", how: "30 s each, arm extended" },
      { name: "Light wrist curls", category: "activation", how: "2 × 20, very light" },
      { name: "Forearm self-massage", category: "recovery", how: "60 s per forearm" },
    ],
  },
  {
    id: "abs",
    name: "Abs (core front)",
    group: "torso",
    view: "front",
    function: "Braces the trunk against collapsing and transfers force between upper and lower body.",
    issues: "Strains in rotation sports (sharp, one-sided at the ribs); deep soreness after new trunk work.",
    meaning: "Soreness that makes laughing or sneezing hurt is classic trunk DOMS, not damage.",
    recovery: "Keep bracing light; counter-brace before a cough or sneeze.",
    drills: [
      { name: "Cobra stretch", category: "mobility", how: "30 s × 2, breathe steadily" },
      { name: "Dead bug", category: "activation", how: "2 × 8 per side, slow" },
      { name: "Easy walk", category: "recovery", how: "10-20 min, comfortable pace" },
    ],
  },
  {
    id: "obliques",
    name: "Obliques (side core)",
    group: "torso",
    view: "front",
    function: "Resists rotation and side-bend and keeps the pelvis level under each stride.",
    issues: "Rib-flare strains with sharp twisting; chronic side stiffness from carrying bags on one side.",
    meaning: "Sore after new side-plank, carry or med-ball volume — a normal response for a runner adding trunk work.",
    recovery: "Gentle rotation within comfort; keep the easy walking going.",
    drills: [
      { name: "Cobra with gentle rotation", category: "mobility", how: "30 s per side" },
      { name: "Side plank", category: "activation", how: "2 × 20 s per side from the knee if needed" },
      { name: "Easy walk", category: "recovery", how: "10-20 min" },
    ],
  },
  {
    id: "lower-back",
    name: "Lower back (erectors)",
    group: "torso",
    view: "back",
    function: "Braces the spine against folding forward under load and on every footstrike.",
    issues: "Symmetric dull stiffness after hinge work is benign; one-sided sharp pain, leg symptoms or numbness are referral signs.",
    meaning: "Stiffness near the spine the morning after hills, deadlifts or a long run is a normal training response.",
    recovery: "Walking is first-line; hold heavy hinging for 48-72 h when sore and avoid loaded end-range flexion.",
    drills: [
      { name: "Knees-to-chest hold", category: "mobility", how: "30 s × 2, supine" },
      { name: "Bird dog", category: "activation", how: "2 × 8 per side, slow and stable" },
      { name: "10-20 min easy walk", category: "recovery", how: "Comfortable pace, tall posture" },
    ],
  },
  {
    id: "glutes",
    name: "Glutes",
    group: "hips",
    view: "back",
    function: "Extend the hip and control the pelvis on every single-leg stance — the engine of the stride.",
    issues: "Weakness shows up as lateral knee and hip complaints; deep glute irritation can mimic sciatica (tingling means refer).",
    meaning: "Soreness after hills, sprints, deadlifts or lunges means the hip extensors were loaded — a healthy signal.",
    recovery: "Skip max-effort hinge days when very sore; glute activation drills stay light and can proceed.",
    drills: [
      { name: "Pigeon or 90/90 stretch", category: "mobility", how: "45 s per side" },
      { name: "Glute bridge or mini-band lateral walk", category: "activation", how: "2 × 15 per side, light" },
      { name: "Easy bike or walk", category: "recovery", how: "10-20 min flush" },
    ],
  },
  {
    id: "hip-flexors",
    name: "Hip flexors",
    group: "hips",
    view: "front",
    function: "Drive the knee forward in the sprint stride and stabilise the lumbar spine.",
    issues: "Strain with sprinting or hill sprints (sharp at the front of the hip); chronic tightness from sitting.",
    meaning: "Dull front-of-hip soreness after hills or sprints is common; a sharp grab on the drive phase means stop.",
    recovery: "Ease into length; reduce sprint and hill volume while it settles.",
    drills: [
      { name: "Half-kneeling hip-flexor stretch", category: "mobility", how: "30-45 s per side, tuck the pelvis first" },
      { name: "Psoas march", category: "activation", how: "2 × 8 per side, supine or hanging" },
      { name: "Slow walk", category: "recovery", how: "5-10 min as a warm-up" },
    ],
  },
  {
    id: "adductors",
    name: "Inner thighs (adductors)",
    group: "hips",
    view: "front",
    function: "Pull the leg inward and control it on every direction change.",
    issues: "Groin strains recur easily — prior injury is the top risk factor; pinpoint groin pain on a cut means stop.",
    meaning: "Inner-thigh soreness after new lunge, skating or lateral-drill volume is a normal response.",
    recovery: "Keep hip range easy; adductor work stays light until it is pain-free.",
    drills: [
      { name: "Butterfly stretch", category: "mobility", how: "45 s × 2, upright spine" },
      { name: "Short-lever Copenhagen plank", category: "activation", how: "2 × 20-30 s per side, build gradually" },
      { name: "Easy bike", category: "recovery", how: "10 min flush" },
    ],
  },
  {
    id: "abductors",
    name: "Outer hips (abductors)",
    group: "hips",
    view: "back",
    function: "Hold the pelvis level in single-leg stance and carry force down the outside of the thigh.",
    issues: "Iliotibial band irritation shows as lateral knee pain that worsens mid-run — that is a load story, not DOMS.",
    meaning: "Outer-hip tenderness after new lateral or single-leg work is normal; lateral knee pain while running is not.",
    recovery: "Rolling the lateral thigh helps the feel; the durable fix is hip strengthening.",
    drills: [
      { name: "Side-lying clam or mini-band monster walk", category: "activation", how: "2 × 15 per side, light band" },
      { name: "Standing hip-hitch steps", category: "mobility", how: "2 × 20 m, controlled pelvis" },
      { name: "Foam roll lateral thigh", category: "recovery", how: "60-90 s per side" },
    ],
  },
  {
    id: "quads",
    name: "Quads (front thighs)",
    group: "legs",
    view: "front",
    function: "Straighten the knee, absorb each footstrike and brake on downhills.",
    issues: "Deep quad DOMS makes stairs famous; a sharp grab at the front of the hip while sprinting is a strain.",
    meaning: "Bilateral thigh tenderness after hills, sprints, squats or downhill running is the classic runner response.",
    recovery: "An easy spin is a low-load flush; hold deep eccentric squatting while soreness is 6 or more.",
    drills: [
      { name: "Couch stretch", category: "mobility", how: "45 s per side, start upright" },
      { name: "Quad sets or terminal knee extensions", category: "activation", how: "2 × 12, light" },
      { name: "Easy spin", category: "recovery", how: "10-20 min, light resistance" },
    ],
  },
  {
    id: "hamstrings",
    name: "Hamstrings (back thighs)",
    group: "legs",
    view: "back",
    function: "Extend the hip, bend the knee and reach their longest in late swing — the highest-risk sprint phase.",
    issues: "Sprint-related strain (a sharp mid-thigh grab, mid-belly or near the tendon); chronic tightness is usually a load-tolerance story.",
    meaning: "Dull whole-back-of-thigh soreness after hills, sprints or deadlifts is expected; a sharp grab during a sprint means stop.",
    recovery: "Keep jogging or cycling light; no max-velocity sprinting for 48-72 h after heavy soreness.",
    drills: [
      { name: "Gentle hamstring stretch", category: "mobility", how: "30 s per side — only when not acutely strained" },
      { name: "Hamstring bridge or single-leg RDL pattern", category: "activation", how: "2 × 10 per side, light" },
      { name: "Easy walk or spin", category: "recovery", how: "10-20 min" },
    ],
  },
  {
    id: "calves",
    name: "Calves",
    group: "legs",
    view: "back",
    function: "Spring the foot off the ground and absorb shock at every footstrike.",
    issues: "A sudden mid-calf grab during push-off is the classic calf tear; heel-cord ache worse each morning is tendinopathy.",
    meaning: "Calf soreness after new jump, hill or faster running is expected — this eccentric-heavy region responds loudly to novelty.",
    recovery: "Keep calf work low-load and high-rep when sore; hold hill sprints and jumps for 48-72 h after heavy soreness.",
    drills: [
      { name: "Wall calf stretch", category: "mobility", how: "30 s straight-knee and 30 s bent-knee per side" },
      { name: "Slow double-leg calf raises", category: "activation", how: "2 × 15, controlled tempo" },
      { name: "Easy spin or walk", category: "recovery", how: "10-20 min flush" },
    ],
  },
  {
    id: "tibialis",
    name: "Shins (tibialis)",
    group: "legs",
    view: "front",
    function: "Lifts and controls the foot through the stride and brakes at footstrike.",
    issues: "Diffuse bone-line pain along the inner shin that worsens across a run and aches at rest is shin-splint territory — cut mileage; focal bone pain needs a clinician.",
    meaning: "Outer front-of-shin muscle soreness that eases with warm-up is a normal response to new hills or downhill running.",
    recovery: "Softer surfaces and gradual re-loading; the bike or pool keeps the engine working without impact.",
    drills: [
      { name: "Tibialis raises", category: "activation", how: "2 × 15, toes to shins, controlled" },
      { name: "Toe and heel walks", category: "mobility", how: "2 × 20 m each, tall posture" },
      { name: "Low-impact cross-training", category: "recovery", how: "Bike or swim as the recovery-day default" },
    ],
  },
];

export const MUSCLES_BY_ID: Readonly<Record<string, MuscleDefinition>> = Object.fromEntries(
  MUSCLE_CATALOG.map((muscle) => [muscle.id, muscle]),
);

export function isMuscleId(value: unknown): value is string {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(MUSCLES_BY_ID, value);
}

export function getMuscle(id: string): MuscleDefinition | undefined {
  return MUSCLES_BY_ID[id];
}

/**
 * The name without its parenthetical qualifier, e.g. "Hamstrings" instead of "Hamstrings (back thighs)". Chip rows,
 * one-line summaries and prompt lines read better short; the full name stays on the figure labels and the guide.
 */
export function muscleShortName(id: string): string {
  const muscle = MUSCLES_BY_ID[id];
  return muscle === undefined ? id : muscle.name.split(" (")[0] ?? muscle.name;
}

export function musclesForView(view: MuscleMapView): readonly MuscleDefinition[] {
  return MUSCLE_CATALOG.filter((muscle) => muscle.view === view || muscle.view === "both");
}

export const MUSCLE_GROUP_LABELS: Readonly<Record<MuscleGroup, string>> = {
  shoulders: "Shoulders",
  arms: "Arms",
  torso: "Torso",
  hips: "Hips",
  legs: "Legs",
};

// ---------------------------------------------------------------------------
// The soreness scale and the condition taxonomy
// ---------------------------------------------------------------------------

/** Anchored wording for the 0-10 scale, shown at the slider and used by the coach prompt. */
export const SORENESS_ANCHORS: readonly { value: number; label: string; text: string }[] = [
  { value: 0, label: "Nothing", text: "Feels completely normal, like you never trained." },
  { value: 3, label: "Mild", text: "Mild when you move or press on it. Full strength, full range." },
  { value: 5, label: "Noticeable", text: "Noticeable during daily movement — stairs, sitting down. You can still train through it." },
  { value: 7, label: "Sore to touch", text: "Very tender; you move carefully around it." },
  { value: 9, label: "Severe", text: "Hard to contract, big strength loss. Not a normal training day." },
];

export function sorenessLabel(value: number): string {
  if (value <= 0) return "Nothing";
  if (value <= 2) return "Barely there";
  if (value <= 3) return "Mild";
  if (value <= 5) return "Noticeable";
  if (value <= 6) return "Clear DOMS";
  if (value <= 7) return "Sore to touch";
  if (value <= 8) return "Strong";
  return "Severe";
}

export type MuscleConditionKey =
  | "tight"
  | "cramp"
  | "fatigued"
  | "dull_ache"
  | "sharp_pain"
  | "swelling"
  | "numbness"
  | "old_injury";

/** The second tap after severity: pain quality is more diagnostic than intensity alone. */
export const MUSCLE_CONDITIONS: readonly { key: MuscleConditionKey; label: string; hint: string }[] = [
  { key: "tight", label: "Tight / stiff", hint: "Restriction rather than pain; movement and activation usually settle it." },
  { key: "cramp", label: "Cramp / spasm", hint: "A sudden contraction during or after the session; hydrate and resume at reduced load." },
  { key: "fatigued", label: "Fatigued / weak", hint: "Heavy-legged weakness rather than pain; cut volume before intensity." },
  { key: "dull_ache", label: "Dull ache", hint: "A grumble without a clear story; log it and watch the trend." },
  { key: "sharp_pain", label: "Sharp pain", hint: "The injury signature — localized and sudden is not how DOMS feels." },
  { key: "swelling", label: "Swelling", hint: "Visible puffiness; with severe soreness it needs medical care, not drills." },
  { key: "numbness", label: "Numbness / tingling", hint: "A nerve sign; it needs a clinician before loading again." },
  { key: "old_injury", label: "Old injury flare", hint: "Familiar symptoms at an old site; step back to rehab-level loads." },
];

export const MUSCLE_CONDITION_BY_KEY: Readonly<Record<MuscleConditionKey, { label: string; hint: string }>> =
  Object.fromEntries(MUSCLE_CONDITIONS.map((condition) => [condition.key, { label: condition.label, hint: condition.hint }])) as Record<
    MuscleConditionKey,
    { label: string; hint: string }
  >;

export function isMuscleConditionKey(value: unknown): value is MuscleConditionKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(MUSCLE_CONDITION_BY_KEY, value);
}

/** The warm-up modifier, asked only when it discriminates: pain that eases reads mechanical, pain that worsens does not. */
export type MuscleWarmUp = "eases" | "same" | "worse";

export const MUSCLE_SIDES: readonly ("left" | "right" | "both")[] = ["both", "left", "right"];

// ---------------------------------------------------------------------------
// Check-in records and validation
// ---------------------------------------------------------------------------

export type MuscleSide = "left" | "right" | "both";

export interface MuscleTag {
  muscleId: string;
  soreness: number;
  conditions: MuscleConditionKey[];
  side: MuscleSide;
  /** Asked when soreness >= 4 or a pain tag exists; null when not asked. */
  warmUp: MuscleWarmUp | null;
}

export interface MuscleCheckIn {
  checkInId: string;
  userId: string;
  /** ISO day the feelings are about; never in the future, at most 14 days back. */
  day: string;
  /** The run this check-in follows, when the runner linked one. */
  activityId: string | null;
  muscles: MuscleTag[];
  /** Free text for the coach, at most 200 characters. */
  note: string | null;
  createdAt: string;
}

export const MAX_CHECKIN_MUSCLES = MUSCLE_CATALOG.length;
export const MAX_CHECKIN_NOTE_CHARS = 200;
export const CHECKIN_BACKFILL_DAYS = 14;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addDaysUtc(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The day a check-in may be about: an ISO day, never future, within the backfill window. */
export function validateCheckInDay(day: string, today: string): string | null {
  if (!ISO_DAY.test(day)) return "Pick a valid day.";
  if (day > today) return "The day cannot be in the future.";
  if (day < addDaysUtc(today, -CHECKIN_BACKFILL_DAYS)) return "Check-ins go back at most 14 days.";
  return null;
}

function readWarmUp(value: unknown): MuscleWarmUp | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (value === "eases" || value === "same" || value === "worse") return value;
  return undefined;
}

function readSide(value: unknown): MuscleSide | undefined {
  if (value === undefined || value === null || value === "") return "both";
  if (value === "left" || value === "right" || value === "both") return value;
  return undefined;
}

function readSoreness(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  return rounded >= 0 && rounded <= 10 ? rounded : undefined;
}

/**
 * Parse the per-muscle JSON the client script posts. Each entry is validated against the catalog; unknown
 * muscles, out-of-range severity or unknown condition keys are rejected whole, so a stored check-in is always
 * complete.
 */
export function parseMuscleTagsJson(raw: string | null | undefined): { ok: true; tags: MuscleTag[] } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw.trim().length === 0) return { ok: false, error: "Select at least one muscle." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "The muscle data could not be read." };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return { ok: false, error: "Select at least one muscle." };
  if (parsed.length > MAX_CHECKIN_MUSCLES) return { ok: false, error: `At most ${MAX_CHECKIN_MUSCLES} muscles fit one check-in.` };
  const tags: MuscleTag[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    if (!isObject(item)) return { ok: false, error: "Each muscle entry must be an object." };
    const muscleId = item["muscleId"];
    if (!isMuscleId(muscleId)) return { ok: false, error: `Unknown muscle: ${String(muscleId)}` };
    if (seen.has(muscleId)) return { ok: false, error: `${getMuscle(muscleId)?.name ?? muscleId} is listed twice.` };
    seen.add(muscleId);
    const soreness = readSoreness(item["soreness"]);
    if (soreness === undefined) return { ok: false, error: "Soreness must be 0-10." };
    const rawConditions = item["conditions"];
    if (!Array.isArray(rawConditions)) return { ok: false, error: "Conditions must be a list." };
    const conditions: MuscleConditionKey[] = [];
    for (const condition of rawConditions) {
      if (!isMuscleConditionKey(condition)) return { ok: false, error: `Unknown condition: ${String(condition)}` };
      if (!conditions.includes(condition)) conditions.push(condition);
    }
    const side = readSide(item["side"]);
    if (side === undefined) return { ok: false, error: "Side must be both, left or right." };
    const warmUp = readWarmUp(item["warmUp"]);
    if (warmUp === undefined) return { ok: false, error: "The warm-up answer must be eases, same or worse." };
    tags.push({ muscleId, soreness, conditions, side, warmUp });
  }
  return { ok: true, tags };
}

/**
 * The no-script fallback: one shared severity, one shared condition set and one shared side applied to every
 * checked muscle. The client script upgrades the same form to per-muscle editing, so both paths store the same
 * record shape.
 */
export function buildSharedTags(
  muscleIds: readonly string[],
  soreness: number,
  conditions: readonly MuscleConditionKey[],
  side: MuscleSide,
  warmUp: MuscleWarmUp | null,
): { ok: true; tags: MuscleTag[] } | { ok: false; error: string } {
  if (muscleIds.length === 0) return { ok: false, error: "Select at least one muscle." };
  if (muscleIds.length > MAX_CHECKIN_MUSCLES) return { ok: false, error: `At most ${MAX_CHECKIN_MUSCLES} muscles fit one check-in.` };
  const unique: string[] = [];
  for (const id of muscleIds) {
    if (!isMuscleId(id)) return { ok: false, error: `Unknown muscle: ${id}` };
    if (!unique.includes(id)) unique.push(id);
  }
  const severity = readSoreness(soreness);
  if (severity === undefined) return { ok: false, error: "Soreness must be 0-10." };
  return {
    ok: true,
    tags: unique.map((muscleId) => ({ muscleId, soreness: severity, conditions: [...conditions], side, warmUp })),
  };
}

/** One line for history rows: how many muscles, and the worst of them in the runner's words. */
export function summarizeCheckIn(checkIn: readonly MuscleCheckIn[] | MuscleCheckIn): string {
  const single = Array.isArray(checkIn) ? (checkIn[0] ?? null) : checkIn;
  if (single === null) return "Empty check-in.";
  const count = single.muscles.length;
  const worst = worstTag(single.muscles);
  if (worst === null) return "All clear.";
  const name = muscleShortName(worst.tag.muscleId);
  const conditions = worst.tag.conditions.map((condition) => MUSCLE_CONDITION_BY_KEY[condition].label.toLowerCase()).join(", ");
  const sideText = worst.tag.side === "both" ? "" : `, ${worst.tag.side}`;
  return `${count} muscle${count === 1 ? "" : "s"} · worst: ${name} ${worst.tag.soreness}/10${conditions.length === 0 ? "" : ` (${conditions})`}${sideText}`;
}

// ---------------------------------------------------------------------------
// Interpretation: the deterministic classification
// ---------------------------------------------------------------------------

export type MuscleTagLevel = "ok" | "sore" | "heavy" | "watch" | "warning" | "urgent";

/** The coaching state a level offers, pre-linked to the existing sensitive-state machinery. */
export type MuscleFlagState = "pain_injury" | "medical_red_flag";

export interface MuscleTagReading {
  level: MuscleTagLevel;
  /** Short runner-facing headline. */
  title: string;
  /** The guidance paragraph, care-first and never a scold. */
  guidance: string;
  /** The one-tap coaching state this reading offers, when it offers one. */
  flagState: MuscleFlagState | null;
  /** True when drills should be withheld and the runner pointed to care instead. */
  withholdDrills: boolean;
}

const LEVEL_ORDER: readonly MuscleTagLevel[] = ["ok", "sore", "heavy", "watch", "warning", "urgent"];

export function worstLevel(levels: readonly MuscleTagLevel[]): MuscleTagLevel | null {
  let worst: MuscleTagLevel | null = null;
  for (const level of levels) {
    if (worst === null || LEVEL_ORDER.indexOf(level) > LEVEL_ORDER.indexOf(worst)) worst = level;
  }
  return worst;
}

function worstTag(muscles: readonly MuscleTag[]): { tag: MuscleTag; reading: MuscleTagReading } | null {
  let worst: { tag: MuscleTag; reading: MuscleTagReading } | null = null;
  for (const tag of muscles) {
    const reading = readMuscleTag(tag);
    if (worst === null || LEVEL_ORDER.indexOf(reading.level) > LEVEL_ORDER.indexOf(worst.reading.level)) {
      worst = { tag, reading };
    }
  }
  return worst;
}

const URGENT_GUIDANCE =
  "Severe soreness together with swelling or weakness is beyond what a training app can advise. Check for swelling and for dark, tea-coloured urine, and seek medical care now — rhabdomyolysis needs a blood test, not a drill.";

/**
 * Classify one muscle tag. The rules are ordered: urgent (rhabdomyolysis pattern, nerve signs in the spine) →
 * warning (the injury signature: sharp pain, swelling, numbness, a strong old-injury flare, extreme severity) →
 * watch (tight, cramp, fatigue, a grumble or a mild flare) → heavy (a big but normal response) → sore → ok.
 */
export function readMuscleTag(tag: MuscleTag): MuscleTagReading {
  const muscle = getMuscle(tag.muscleId);
  const name = muscle?.name ?? tag.muscleId;
  const has = (condition: MuscleConditionKey): boolean => tag.conditions.includes(condition);
  const oneSided = tag.side !== "both";
  const oneSidedLine = oneSided ? " It is one-sided, which is worth a clinician's look sooner." : "";

  // Urgent: the rhabdomyolysis pattern, or nerve signs in the spine region.
  if ((tag.soreness >= 8 && has("swelling")) || (tag.soreness >= 9 && has("fatigued")) || (has("numbness") && tag.muscleId === "lower-back")) {
    return {
      level: "urgent",
      title: `${name}: needs medical care now`,
      guidance: `${URGENT_GUIDANCE} Until you have been seen, no training on this area.`,
      flagState: "medical_red_flag",
      withholdDrills: true,
    };
  }

  // Warning: the injury signature — not how DOMS behaves.
  if (has("sharp_pain") || has("swelling") || has("numbness") || (has("old_injury") && tag.soreness >= 7) || tag.soreness >= 9) {
    const reason = has("sharp_pain")
      ? "Sharp, localized pain is not how normal soreness feels — this reads as a possible strain until a clinician says otherwise."
      : has("swelling")
        ? "Swelling in a muscle is a medical sign, not a training signal."
        : has("numbness")
          ? "Numbness or tingling is a nerve sign; it needs an evaluation before this area is loaded again."
          : has("old_injury")
            ? "A flare this strong at an old injury site usually means the load outran the tissue."
            : "Soreness at this level with no let-up is beyond a normal response.";
    const warmUpNote = tag.warmUp === "worse" ? " It got worse as you moved, which strengthens the case for care." : "";
    return {
      level: "warning",
      title: `${name}: take direct loading off it`,
      guidance: `${reason} No hard or direct work on this muscle; gentle pain-free range only. If it is not clearly better in 3-7 days — or swelling, numbness or night pain appears — see a clinician.${oneSidedLine}${warmUpNote}`,
      flagState: "pain_injury",
      withholdDrills: true,
    };
  }

  // Watch: worth a look, not a stop.
  if (has("dull_ache") && tag.warmUp === "worse") {
    return {
      level: "warning",
      title: `${name}: ache that worsens`,
      guidance: `An ache that gets worse as you move is not how normal soreness behaves. Take direct loading off this muscle; gentle pain-free range only, and see a clinician if it is not clearly better in 3-7 days.${oneSidedLine}`,
      flagState: "pain_injury",
      withholdDrills: true,
    };
  }
  if (has("tight")) {
    return {
      level: "watch",
      title: `${name}: tight`,
      guidance: `Tightness is restriction, not damage. Mobilize it gently, activate it lightly, then train — and skip aggressive static stretching as a "fix"; it does not speed soreness down.${oneSidedLine}`,
      flagState: null,
      withholdDrills: false,
    };
  }
  if (has("cramp")) {
    return {
      level: "watch",
      title: `${name}: cramp`,
      guidance: `A cramp is usually a fatigued muscle firing wrong, not an injury. Hydrate, resume at reduced load, and watch for repeats — a cramp that keeps coming back at easy loads is worth a clinician's look.${oneSidedLine}`,
      flagState: null,
      withholdDrills: false,
    };
  }
  if (has("fatigued") || has("dull_ache")) {
    const lead = has("fatigued")
      ? "Heavy-legged weakness rather than pain reads as under-recovery. Cut volume before intensity, and protect sleep and food today."
      : "A dull ache without a clear story is worth logging rather than treating. Keep it easy and see what tomorrow says.";
    return {
      level: "watch",
      title: `${name}: ${has("fatigued") ? "fatigued" : "dull ache"}`,
      guidance: `${lead}${has("dull_ache") ? " If it persists past two sessions or aches at rest, that is a clinician's question." : ""}${oneSidedLine}`,
      flagState: null,
      withholdDrills: false,
    };
  }
  if (has("old_injury")) {
    return {
      level: "watch",
      title: `${name}: old injury flare`,
      guidance: `A mild flare at an old site is data, not disaster — the load probably outran its current tolerance. Step back toward your rehab-level loads and re-run the drills you were given; rebuild over a week or two.${oneSidedLine}`,
      flagState: null,
      withholdDrills: false,
    };
  }

  // Heavy: a big but normal response.
  if (tag.soreness >= 7) {
    const easesNote = tag.warmUp === "eases" ? " It already eases once you are moving, which is a good sign." : "";
    return {
      level: "heavy",
      title: `${name}: a big response`,
      guidance: `This reads as heavy normal soreness, not damage. No hard direct work for 48-72 h; easy movement, food and sleep do the work. It should fall each day from here — if it rises instead, re-check tomorrow.${easesNote}${oneSidedLine}`,
      flagState: null,
      withholdDrills: false,
    };
  }
  if (tag.soreness >= 4) {
    // Pain that worsens with movement is the cheapest strain signal the runner can give.
    if (tag.warmUp === "worse") {
      return {
        level: "heavy",
        title: `${name}: worse when moving`,
        guidance: `It got worse as you moved, so treat today lighter than the plan says. No hard direct work on this muscle today; easy movement, food and sleep do the work — and re-check tomorrow before pushing it.${oneSidedLine}`,
        flagState: null,
        withholdDrills: false,
      };
    }
    const warmUpLine = tag.warmUp === "eases" ? " It eases once you are moving, which is how normal soreness behaves." : "";
    return {
      level: "sore",
      title: `${name}: expected soreness`,
      guidance: `This looks like normal training soreness — it peaks 24-72 h after a session and eases once you are moving. Keep today easier on this muscle; you do not need to skip it.${warmUpLine}${oneSidedLine}`,
      flagState: null,
      withholdDrills: false,
    };
  }
  return {
    level: "ok",
    title: `${name}: fine`,
    guidance: "A normal training response. Keep your plan as it is.",
    flagState: null,
    withholdDrills: false,
  };
}

export type CheckInReadiness = "steady" | "watch" | "care" | "urgent";

export const READINESS_LABELS: Readonly<Record<CheckInReadiness, string>> = {
  steady: "Steady",
  watch: "Watch",
  care: "Care",
  urgent: "Care now",
};

/** The one-word readiness of a whole check-in: the worst muscle names the day. */
export function readinessForCheckIn(muscles: readonly MuscleTag[]): CheckInReadiness {
  const worst = worstLevel(muscles.map((tag) => readMuscleTag(tag).level));
  if (worst === "urgent") return "urgent";
  if (worst === "warning" || worst === "heavy") return "care";
  if (worst === "sore" || worst === "watch") return "watch";
  return "steady";
}

// ---------------------------------------------------------------------------
// Drill suggestions
// ---------------------------------------------------------------------------

export interface MuscleDrillCard {
  muscleId: string;
  muscleName: string;
  level: MuscleTagLevel;
  guidance: string;
  drills: MuscleDrill[];
}

const SUGGESTION_ORDER: readonly MuscleTagLevel[] = ["heavy", "watch", "sore"];

function drillsForLevel(muscle: MuscleDefinition, level: MuscleTagLevel, isTight: boolean): MuscleDrill[] {
  if (level === "heavy") return muscle.drills.filter((drill) => drill.category === "recovery");
  if (level === "watch") {
    const activation = muscle.drills.filter((drill) => drill.category === "activation");
    const mobility = muscle.drills.filter((drill) => drill.category === "mobility");
    return isTight ? [...activation, ...mobility] : [...mobility, ...activation];
  }
  if (level === "sore") {
    return muscle.drills.filter((drill) => drill.category === "mobility" || drill.category === "recovery");
  }
  return [];
}

/**
 * The drill cards for one check-in: actionable levels only (heavy → watch → sore, at most six muscles), each
 * with the drills its level permits. Warning and urgent muscles are deliberately absent — their guidance points
 * to care, and drills there would read as advice the app must not give.
 */
export function drillCardsForCheckIn(muscles: readonly MuscleTag[], limit = 6): readonly MuscleDrillCard[] {
  const cards: MuscleDrillCard[] = [];
  for (const level of SUGGESTION_ORDER) {
    for (const tag of muscles) {
      if (cards.length >= limit) return cards;
      const reading = readMuscleTag(tag);
      if (reading.level !== level || reading.withholdDrills) continue;
      const muscle = getMuscle(tag.muscleId);
      if (muscle === undefined) continue;
      const drills = drillsForLevel(muscle, level, tag.conditions.includes("tight"));
      if (drills.length === 0) continue;
      cards.push({ muscleId: muscle.id, muscleName: muscle.name, level, guidance: reading.guidance, drills });
    }
  }
  return cards;
}

/** The muscles whose reading points to care rather than drills, for the page's care-now section. */
export function careEntriesForCheckIn(muscles: readonly MuscleTag[]): readonly { tag: MuscleTag; reading: MuscleTagReading }[] {
  return muscles
    .map((tag) => ({ tag, reading: readMuscleTag(tag) }))
    .filter((entry) => entry.reading.level === "warning" || entry.reading.level === "urgent");
}

// ---------------------------------------------------------------------------
// Muscles worked by a session
// ---------------------------------------------------------------------------

export interface MuscleWork {
  primary: readonly string[];
  secondary: readonly string[];
}

const RUN_PRIMARY: readonly string[] = ["glutes", "quads", "hamstrings", "calves"];
const RUN_SECONDARY: readonly string[] = ["hip-flexors", "tibialis", "abs", "lower-back"];

function upweight(work: MuscleWork, ids: readonly string[]): MuscleWork {
  const secondary = work.secondary.filter((id) => !ids.includes(id));
  return { primary: [...new Set([...work.primary, ...ids])], secondary };
}

function titleMatches(title: string, patterns: readonly string[]): boolean {
  const lower = title.toLowerCase();
  return patterns.some((pattern) => lower.includes(pattern));
}

/**
 * Map one run to the muscles it worked. The session kind and the title's words adapt the base running pattern:
 * hills load the calves and glutes harder, trails recruit the stabilizers, and cross-training sessions are
 * recognized by their words. Nothing here pretends to be EMG data — it is the honest default for a planner.
 */
export function musclesForRun(input: {
  title: string;
  kind?: SessionKind;
  distanceKm?: number | null;
  elevationGainM?: number | null;
}): MuscleWork {
  let work: MuscleWork = { primary: RUN_PRIMARY, secondary: RUN_SECONDARY };
  const kind = input.kind;
  if (kind === "interval" || kind === "tempo" || kind === "race" || kind === "racewalk") {
    work = upweight(work, ["hip-flexors", "hamstrings"]);
    work = {
      ...work,
      secondary: [...new Set([...work.secondary, "obliques", "adductors", "abductors"])],
    };
  }
  const hillsInTitle = titleMatches(input.title, ["hill", "stairs", "vert"]);
  const bigClimb = typeof input.elevationGainM === "number" && input.elevationGainM >= 100;
  if (hillsInTitle || bigClimb) work = upweight(work, ["calves", "glutes"]);
  if (titleMatches(input.title, ["trail", "mountain", "山地", "山路"])) {
    work = {
      ...work,
      secondary: [...new Set([...work.secondary, "adductors", "abductors", "tibialis"])],
    };
  }
  if (kind === "cross") {
    if (titleMatches(input.title, ["cycle", "bike", "spin", "騎", "單車"])) {
      work = { primary: ["quads", "calves", "glutes"], secondary: ["hamstrings", "abs"] };
    } else if (titleMatches(input.title, ["swim", "pool", "游泳"])) {
      work = { primary: ["lats", "delts", "chest"], secondary: ["abs", "triceps", "forearms"] };
    } else if (titleMatches(input.title, ["gym", "strength", "weights", "lift", "重訓", "肌力"])) {
      work = {
        primary: ["quads", "glutes", "chest", "lats", "abs"],
        secondary: ["delts", "hamstrings", "triceps", "biceps", "forearms"],
      };
    } else {
      work = { primary: ["quads", "glutes", "abs", "calves"], secondary: [] };
    }
  }
  return work;
}

/** Primary movers read bold, secondary read muted; both lists are capped to real catalog ids. */
export function catalogFilter(ids: readonly string[]): readonly string[] {
  return ids.filter((id) => isMuscleId(id));
}

// ---------------------------------------------------------------------------
// Prompt facts and the referenced-muscle context
// ---------------------------------------------------------------------------

function tagPromptLine(tag: MuscleTag): string {
  const name = muscleShortName(tag.muscleId);
  const conditions = tag.conditions.join("+");
  const side = tag.side === "both" ? "" : `, ${tag.side}`;
  const warmUp = tag.warmUp === null ? "" : `, ${tag.warmUp === "eases" ? "eases with warm-up" : tag.warmUp === "worse" ? "worse with warm-up" : "same with warm-up"}`;
  return `${name} ${tag.soreness}/10${conditions.length === 0 ? "" : ` ${conditions}`}${side}${warmUp}`;
}

/**
 * The per-muscle context for a review-muscles turn: the coach knowledge plus the runner's tags for it.
 */
export function referencedMuscleContext(muscleId: string, checkIns: readonly MuscleCheckIn[]): string {
  const muscle = getMuscle(muscleId);
  if (muscle === undefined) return "";
  const lines: string[] = [];
  for (const checkIn of checkIns) {
    const tag = checkIn.muscles.find((entry) => entry.muscleId === muscleId);
    if (tag === undefined) continue;
    lines.push(`- ${checkIn.day}: ${tagPromptLine(tag)}`);
  }
  const drills = muscle.drills.map((drill) => `${drill.name} (${drill.category}, ${drill.how})`).join("; ");
  return [
    `Referenced muscle: ${muscle.name} — group ${muscle.group}`,
    `Function: ${muscle.function}`,
    `Common issues: ${muscle.issues}`,
    `What its soreness usually means: ${muscle.meaning}`,
    `Recovery guidance: ${muscle.recovery}`,
    `Drill library: ${drills}`,
    lines.length === 0 ? "The runner has not tagged this muscle recently." : `The runner's tags for it:\n${lines.join("\n")}`,
  ].join("\n");
}

/** The heat fill for one severity: a neutral-to-red ramp that never relies on green/red alone. */
export function sorenessFill(value: number): string {
  const stops: readonly { max: number; fill: string }[] = [
    { max: 0, fill: "#f6eee6" },
    { max: 2, fill: "#fde8cf" },
    { max: 4, fill: "#fbd5a8" },
    { max: 5, fill: "#f8bd7a" },
    { max: 6, fill: "#f5a257" },
    { max: 7, fill: "#f28034" },
    { max: 8, fill: "#ed5f1f" },
    { max: 9, fill: "#e34515" },
    { max: 10, fill: "#c92d0b" },
  ];
  const clamped = Math.max(0, Math.min(10, Math.round(value)));
  const stop = stops.find((entry) => clamped <= entry.max);
  return stop === undefined ? "#c92d0b" : stop.fill;
}
