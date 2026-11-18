/**
 * Coaching-state catalog: definitions, guardrails, keys and the prompt catalog.
 * Kept separate from detection, lifecycle and rendering so the contract can be reviewed and extended without
 * touching the engine.
 */
import type { CoachStateFamily, CoachStateKey, SessionKind } from "./types";

/** A hard guardrail the gateway can enforce before writing a session. */
export interface CoachStateGuardrail {
  blockedKinds: readonly SessionKind[];
  /** For race_week/taper: only within this many days of the race. For post_race: days since the race. */
  withinDays?: number;
  rule: string;
}

export interface CoachStateDefinition {
  key: CoachStateKey;
  family: CoachStateFamily;
  label: string;
  shortLabel: string;
  description: string;
  priority: number;
  /** States in one group compete for the primary slot; different groups can coexist. */
  exclusiveGroup: string;
  defaultTtlDays: number | null;
  autoDetect: boolean;
  /** Chat proposals start as observing and need the runner to confirm. */
  requiresConfirmation: boolean;
  /** Medical, pregnancy, menstrual-cycle and energy-availability topics; user-set only, never inferred. */
  sensitive: boolean;
  guardrails: readonly CoachStateGuardrail[];
  /** Short guidance included in the prompt when the state is active. */
  prompt: string;
  uiNote: string;
}


function define(
  key: CoachStateKey,
  family: CoachStateFamily,
  label: string,
  shortLabel: string,
  description: string,
  priority: number,
  exclusiveGroup: string,
  defaultTtlDays: number | null,
  prompt: string,
  options: {
    autoDetect?: boolean;
    requiresConfirmation?: boolean;
    sensitive?: boolean;
    guardrails?: readonly CoachStateGuardrail[];
    uiNote?: string;
  } = {},
): CoachStateDefinition {
  return {
    key,
    family,
    label,
    shortLabel,
    description,
    priority,
    exclusiveGroup,
    defaultTtlDays,
    autoDetect: options.autoDetect ?? false,
    requiresConfirmation: options.requiresConfirmation ?? false,
    sensitive: options.sensitive ?? false,
    guardrails: options.guardrails ?? [],
    prompt,
    uiNote: options.uiNote ?? "A coaching state, not a diagnosis.",
  };
}

/** The catalog is intentionally larger than the first detector set: the coach can propose life/safety states, and the
 * runner can set them. Deterministic detection is limited to signals the app actually has. */
export const COACH_STATE_DEFINITIONS: readonly CoachStateDefinition[] = [
  define(
    "race_day",
    "race_phase",
    "Race day",
    "Race day",
    "The race is today. Protect sleep, fuel and the warm-up; no hard training.",
    80,
    "race_phase",
    1,
    "Race day: the race is today. Protect sleep, fuel and warm-up; no hard training.",
    {
      autoDetect: true,
      guardrails: [{ blockedKinds: ["interval", "tempo"], rule: "No hard training on race day; the race is the session." }],
      uiNote: "The race itself is the session; hard training is blocked today.",
    },
  ),
  define(
    "race_week",
    "race_phase",
    "Race week",
    "Race week",
    "One to seven days before a race. Keep volume down and avoid hard sessions in the last three days.",
    78,
    "race_phase",
    7,
    "Race week: keep volume down, no hard sessions in the last 3 days, and protect sleep, nutrition and race logistics.",
    {
      autoDetect: true,
      guardrails: [
        {
          blockedKinds: ["interval", "tempo"],
          withinDays: 3,
          rule: "No hard sessions in the last 3 days before the race.",
        },
      ],
      uiNote: "Hard sessions are blocked in the final three days.",
    },
  ),
  define(
    "taper",
    "race_phase",
    "Taper",
    "Taper",
    "Eight to twenty-one days before a race. Reduce volume, keep short intensity and avoid new long runs.",
    70,
    "race_phase",
    21,
    "Taper: reduce volume, keep short intensity, avoid new long runs, and protect sleep and nutrition.",
    {
      autoDetect: true,
      guardrails: [
        {
          blockedKinds: ["long"],
          withinDays: 14,
          rule: "No new long runs in the final two weeks before the race.",
        },
      ],
      uiNote: "Volume comes down; short quality stays.",
    },
  ),
  define(
    "post_race",
    "race_phase",
    "Post-race recovery",
    "Post-race",
    "Zero to fourteen days after a race. Easy or rest for the first week, then rebuild gradually.",
    65,
    "race_phase",
    14,
    "Post-race: easy or rest for the first 7 days; no intensity or racing; rebuild gradually.",
    {
      autoDetect: true,
      guardrails: [
        {
          blockedKinds: ["interval", "tempo", "race", "racewalk"],
          withinDays: 7,
          rule: "No intensity or racing in the first 7 days after a race.",
        },
      ],
      uiNote: "The first week after a race is recovery, not training.",
    },
  ),
  define(
    "load_spike",
    "load",
    "Load is rising",
    "Load spike",
    "The seven-day load is above the recent range. Keep the next sessions easy.",
    55,
    "load",
    7,
    "Load is rising above the recent range; keep the next sessions easy and do not add intensity.",
    {
      autoDetect: true,
      guardrails: [{ blockedKinds: ["interval", "tempo"], rule: "Load is rising; keep the next sessions easy." }],
      uiNote: "A soft load signal, not an injury prediction.",
    },
  ),
  define(
    "high_risk",
    "load",
    "Steep load ramp",
    "High ramp",
    "The acute:chronic workload ratio is high. Back off and avoid intensity until it settles.",
    60,
    "load",
    7,
    "The load ramp is steep; back off, avoid intensity and let the acute load settle.",
    {
      autoDetect: true,
      guardrails: [{ blockedKinds: ["interval", "tempo"], rule: "The load ramp is steep; no intensity until it settles." }],
      uiNote: "ACWR is a soft signal and is debated; treat it as a prompt to back off, not a diagnosis.",
    },
  ),
  define(
    "under_load",
    "load",
    "Load is low",
    "Low load",
    "The seven-day load is below the recent range. Rebuild gradually rather than adding a large week.",
    45,
    "load",
    7,
    "Load is below the recent range; rebuild gradually and do not add a large week.",
    {
      autoDetect: true,
      uiNote: "A gradual rebuild is safer than a catch-up week.",
    },
  ),
  define(
    "hard_easy_imbalance",
    "load",
    "Hard/easy imbalance",
    "Hard/easy",
    "Too much of the recent running is hard. Add easy days before more intensity.",
    50,
    "load",
    7,
    "The hard/easy mix is skewed; add easy days before more intensity.",
    {
      autoDetect: true,
      guardrails: [{ blockedKinds: ["interval", "tempo"], rule: "The hard/easy mix is skewed; add easy days first." }],
      uiNote: "Easy days are training, not filler.",
    },
  ),
  define(
    "consistency_guard",
    "consistency",
    "Rebuild consistency",
    "Consistency",
    "Two or more planned sessions in the last week have no recorded activity. Rebuild the habit before load.",
    40,
    "consistency",
    7,
    "Several planned sessions were missed; rebuild consistency before adding load or intensity.",
    {
      autoDetect: true,
      uiNote: "A missed session is information, not a failure.",
    },
  ),
  define(
    "plan_stale",
    "consistency",
    "Plan is stale",
    "Plan stale",
    "There are no future sessions in the next two weeks. Offer a fresh, realistic block.",
    35,
    "consistency",
    14,
    "No future sessions in the next two weeks; offer a fresh, realistic block.",
    {
      autoDetect: true,
      uiNote: "The plan went stale, not the runner; a fresh block restarts it.",
    },
  ),
  define(
    "data_stale",
    "data",
    "Data is stale",
    "Data stale",
    "A Garmin key exists but there is no recent activity. Coach from the plan and ask for a sync.",
    15,
    "data",
    14,
    "No recent Garmin data; coach from the plan and ask the runner to sync when convenient.",
    {
      autoDetect: true,
      uiNote: "Missing data lowers confidence; it is not a training problem.",
    },
  ),
  define(
    "no_key",
    "setup",
    "No Garmin key",
    "Garmin key",
    "No Garmin Personal API key is saved. Coach from the plan and invite a key when the runner wants recorded runs.",
    10,
    "data",
    30,
    "No Garmin key is saved; coach from the plan and invite a key when the runner wants recorded runs.",
    {
      autoDetect: true,
      uiNote: "A setup state, not a training problem.",
    },
  ),
  define(
    "pain_injury",
    "safety",
    "Pain / injury",
    "Pain",
    "Pain or an injury is present. No intensity or racing; easy, cross or rest; refer to a clinician.",
    90,
    "safety",
    21,
    "Pain or injury: no intensity or racing; easy, cross or rest; refer to a clinician. Do not diagnose.",
    {
      requiresConfirmation: true,
      guardrails: [
        {
          blockedKinds: ["interval", "tempo", "race", "racewalk"],
          rule: "Pain/injury: no intensity or racing; easy, cross or rest, and refer to a clinician.",
        },
      ],
      uiNote: "This is not a diagnosis. If pain is sharp, worsening, or changes your gait, see a clinician.",
    },
  ),
  define(
    "illness",
    "safety",
    "Illness",
    "Illness",
    "Illness is present. Rest; do not train through systemic symptoms; seek care if severe.",
    95,
    "safety",
    10,
    "Illness: rest; do not train through systemic symptoms; seek care if severe.",
    {
      requiresConfirmation: true,
      guardrails: [
        {
          blockedKinds: ["easy", "long", "interval", "tempo", "cross", "race", "racewalk"],
          rule: "Illness: rest; no training until symptoms settle.",
        },
      ],
      uiNote: "This is not a diagnosis. Seek care for severe or persistent symptoms.",
    },
  ),
  define(
    "return_to_run",
    "safety",
    "Return to run",
    "Return",
    "Returning after injury or illness. Run/walk, pain-guided, no pace targets.",
    85,
    "safety",
    21,
    "Return to run: run/walk, pain-guided, no pace targets, and stop for sharp or worsening pain.",
    {
      requiresConfirmation: true,
      guardrails: [
        {
          blockedKinds: ["interval", "tempo", "race", "racewalk"],
          rule: "Return to run: run/walk only; no intensity or racing.",
        },
      ],
      uiNote: "This is not a diagnosis. Follow your clinician's return-to-run advice.",
    },
  ),
  define(
    "medical_red_flag",
    "safety",
    "Medical red flag",
    "Red flag",
    "Chest pain, fainting, severe breathlessness, or another red flag. Stop training and seek urgent care.",
    100,
    "safety",
    7,
    "Medical red flag: stop training and seek urgent clinical care; do not book sessions.",
    {
      requiresConfirmation: true,
      sensitive: true,
      guardrails: [
        {
          blockedKinds: ["easy", "long", "interval", "tempo", "rest", "cross", "race", "racewalk"],
          rule: "Medical red flag: no booking; seek urgent clinical care.",
        },
      ],
      uiNote: "This is not a diagnosis. Seek urgent care for chest pain, fainting, severe breathlessness or similar.",
    },
  ),
  define(
    "travel",
    "life",
    "Travel",
    "Travel",
    "Travel is changing the week. Prefer hotel/treadmill options, shorter sessions and protected sleep.",
    30,
    "life",
    14,
    "Travel: prefer hotel/treadmill options, shorter sessions and protected sleep; keep the key workout.",
    {
      requiresConfirmation: false,
      uiNote: "Set the return date so the state can expire.",
    },
  ),
  define(
    "heat",
    "environment",
    "Heat",
    "Heat",
    "Hot conditions. Adjust pace and HR, hydrate, and avoid hard efforts in the heat.",
    30,
    "environment",
    7,
    "Heat: adjust pace and HR, hydrate, and avoid hard efforts in the heat.",
    {
      uiNote: "Heat acclimation takes days; this state is about today's conditions.",
    },
  ),
  define(
    "time_crunch",
    "life",
    "Time crunch",
    "Time crunch",
    "Limited training time. Shorter or split sessions; protect the key workout.",
    25,
    "life",
    14,
    "Time crunch: shorter or split sessions; protect the key workout and drop the optional volume.",
    {
      uiNote: "Consistency beats a perfect week.",
    },
  ),
  define(
    "sleep_debt",
    "wellbeing",
    "Sleep debt",
    "Sleep",
    "Sleep is short. Reduce intensity and volume; prioritize sleep.",
    25,
    "wellbeing",
    7,
    "Sleep debt: reduce intensity and volume; prioritize sleep before adding training.",
    {
      uiNote: "Sleep is a training input, not a luxury.",
    },
  ),
  define(
    "high_stress",
    "wellbeing",
    "High life stress",
    "Stress",
    "Life stress is high. Keep training easy and reduce load.",
    25,
    "wellbeing",
    7,
    "High life stress: keep training easy and reduce load; do not add a hard block.",
    {
      uiNote: "Training should support the week, not compete with it.",
    },
  ),
  define(
    "motivation_dip",
    "wellbeing",
    "Motivation dip",
    "Motivation",
    "Motivation is low. Short, easy, enjoyable sessions; rebuild gently.",
    20,
    "wellbeing",
    14,
    "Motivation dip: short, easy, enjoyable sessions; rebuild gently and do not prescribe a hard block.",
    {
      uiNote: "Lower the barrier; do not lower the habit.",
    },
  ),
  define(
    "altitude",
    "environment",
    "Altitude",
    "Altitude",
    "Altitude is higher than usual. Expect an easier pace and higher HR; hydrate.",
    30,
    "environment",
    14,
    "Altitude: expect an easier pace and higher HR; hydrate and avoid judging fitness by pace.",
    {
      uiNote: "Pace targets do not transfer to altitude.",
    },
  ),
  define(
    "air_quality",
    "environment",
    "Air quality",
    "Air",
    "Air quality is poor. Train indoors/easy or rest; no hard outdoor efforts.",
    30,
    "environment",
    3,
    "Poor air quality: train indoors/easy or rest; no hard outdoor efforts.",
    {
      uiNote: "Check the local index before outdoor quality.",
    },
  ),
  define(
    "cold_ice",
    "environment",
    "Cold / ice",
    "Cold",
    "Cold or icy conditions. Warm up, choose safe traction, and keep the pace easy.",
    25,
    "environment",
    7,
    "Cold or icy conditions: warm up, choose safe traction, and keep the pace easy.",
    {
      uiNote: "Safety and traction come before pace.",
    },
  ),
  define(
    "indoor_treadmill",
    "environment",
    "Indoor / treadmill",
    "Treadmill",
    "Training indoors. Adjust incline and pace; keep the effort easy.",
    20,
    "environment",
    14,
    "Indoor/treadmill: adjust incline and pace; keep the effort easy and use the belt honestly.",
    {
      uiNote: "Treadmill pace is not outdoor pace.",
    },
  ),
  define(
    "beginner",
    "runner",
    "Beginner",
    "Beginner",
    "New to running. Gradual progression, walk breaks, no pace pressure.",
    20,
    "runner",
    56,
    "Beginner: gradual progression, walk breaks, no pace pressure, and celebrate consistency.",
    {
      uiNote: "The goal is a habit, not a personal best.",
    },
  ),
  define(
    "returning",
    "runner",
    "Returning runner",
    "Returning",
    "Returning after a break. Rebuild gradually; no race pace yet.",
    30,
    "runner",
    42,
    "Returning after a break: rebuild gradually; no race pace yet; use easy/walk-run sessions.",
    {
      uiNote: "Fitness returns faster than tissue tolerance.",
    },
  ),
  define(
    "masters",
    "runner",
    "Masters runner",
    "Masters",
    "Masters runner. More recovery and conservative load progression.",
    20,
    "runner",
    365,
    "Masters runner: allow more recovery and progress load conservatively.",
    {
      uiNote: "Recovery is part of the plan.",
    },
  ),
  define(
    "strength_focus",
    "runner",
    "Strength focus",
    "Strength",
    "A strength block is the priority. One or two strength sessions; keep run volume steady.",
    15,
    "runner",
    28,
    "Strength focus: one or two strength sessions; keep run volume steady and easy.",
    {
      uiNote: "Strength supports running; it is not extra mileage.",
    },
  ),
  define(
    "speed_focus",
    "runner",
    "Speed focus",
    "Speed",
    "A speed block is the priority. One quality session; easy support.",
    15,
    "runner",
    28,
    "Speed focus: one quality session and easy support; do not stack hard days.",
    {
      uiNote: "One quality session beats three mediocre hard days.",
    },
  ),
  define(
    "pregnancy_postpartum",
    "safety",
    "Pregnancy / postpartum",
    "Pregnancy",
    "Pregnancy or postpartum. Follow clinician guidance; no diagnosis; keep the effort conversational.",
    100,
    "safety",
    365,
    "Pregnancy/postpartum: follow clinician guidance; no diagnosis; keep the effort conversational and do not prescribe intensity.",
    {
      requiresConfirmation: true,
      sensitive: true,
      uiNote: "This is not medical advice. Follow your obstetric/clinician guidance.",
    },
  ),
  define(
    "menstrual_cycle_support",
    "wellbeing",
    "Menstrual-cycle support",
    "Cycle support",
    "Menstrual-cycle support. Individual; adjust by symptoms; never infer the cycle.",
    60,
    "wellbeing",
    28,
    "Menstrual-cycle support: individual; adjust by symptoms; never infer the cycle or give medical advice.",
    {
      requiresConfirmation: true,
      sensitive: true,
      uiNote: "This is not a diagnosis or medical advice. Set it yourself if it helps.",
    },
  ),
  define(
    "low_energy_availability",
    "safety",
    "Low energy availability",
    "Low energy",
    "Low energy availability concern. No diet or weight advice; refer to a clinician or sports dietitian.",
    100,
    "safety",
    28,
    "Low energy availability: no diet or weight advice; refer to a clinician or sports dietitian.",
    {
      requiresConfirmation: true,
      sensitive: true,
      uiNote: "This is not a diagnosis. Seek a clinician or sports dietitian.",
    },
  ),
];

export const COACH_STATE_KEYS: readonly CoachStateKey[] = COACH_STATE_DEFINITIONS.map((definition) => definition.key);

export const COACH_STATE_BY_KEY: Readonly<Record<CoachStateKey, CoachStateDefinition>> = Object.fromEntries(
  COACH_STATE_DEFINITIONS.map((definition) => [definition.key, definition]),
) as Record<CoachStateKey, CoachStateDefinition>;

export function isCoachStateKey(value: unknown): value is CoachStateKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(COACH_STATE_BY_KEY, value);
}

export function getCoachStateDefinition(key: CoachStateKey): CoachStateDefinition {
  return COACH_STATE_BY_KEY[key];
}

/** The catalog is included in the prompt so the model proposes exact keys, never invented ones. */
export function renderCoachStateCatalog(): string {
  const lines = [
    "Coaching state catalog (use these exact keys in stateProposals; propose only durable situations):",
  ];
  for (const definition of COACH_STATE_DEFINITIONS) {
    const flags = definition.sensitive
      ? " [sensitive: user-set/confirm; no diagnosis]"
      : definition.requiresConfirmation
        ? " [ask the runner to confirm]"
        : "";
    lines.push(`- ${definition.key}: ${definition.label} — ${definition.description}${flags}`);
  }
  return lines.join("\n");
}
