/**
 * Internal Pattern Taxonomy and Label-Leak Sanitizer (`src/lib/patterns/taxonomy.ts`).
 *
 * Feature overview & use cases:
 * - Encodes the complete internal pattern taxonomy from `Design.md` Section 8 (coping
 *   mechanisms, limiting beliefs, root causes, day-specific signal flags, and meta patterns),
 *   including India cultural calibration guidance for Day 5 pattern mapping.
 * - INTERNAL ONLY (`CONSTRAINTS.md`: "No clinical language shown to users. Pattern names
 *   (People-pleasing, Burnout and so on) are internal.").
 * - Provides `findLeakedPatternLabels` and `stripLeakedPatternLabels` so user-facing synthesis
 *   prose and insights can never expose clinical or internal taxonomy terms (`BUGS.md`).
 */

import type { PatternCategory } from "@/lib/db/schema";
import { logInfo } from "@/lib/log";

export interface PatternTaxonomyEntry {
  key: string;
  category: PatternCategory;
  description: string;
  culturalCalibration: string;
}

export const PATTERN_TAXONOMY: readonly PatternTaxonomyEntry[] = [
  // Coping mechanisms
  {
    key: "people_pleasing",
    category: "coping_mechanism",
    description:
      "Answers organized around other people's needs or approval; trouble naming own preferences.",
    culturalCalibration:
      "India: putting family first can be a chosen value. Distinguish chosen care from fear of disapproval.",
  },
  {
    key: "toxic_positivity",
    category: "coping_mechanism",
    description:
      "Pivoting to gratitude mid-answer ('but I'm grateful') right when naming dissatisfaction.",
    culturalCalibration:
      "India: wanting more can feel ungrateful toward family sacrifice. Never mock the gratitude; allow both gratitude and desire.",
  },
  {
    key: "performative_self_awareness",
    category: "coping_mechanism",
    description:
      "Naming the dilemma fluently in polished analytical language to avoid feeling its weight.",
    culturalCalibration:
      "Invite what happens underneath the neat explanation.",
  },
  {
    key: "humor_as_deflection",
    category: "coping_mechanism",
    description:
      "Jokes in 3+ answers right when a question gets close to something tender.",
    culturalCalibration:
      "India: humor can be social grace. Flag only when it replaces an honest answer.",
  },
  {
    key: "avoidance_idk",
    category: "coping_mechanism",
    description: "Repeated 'I don't know' responses where a hard truth sits.",
    culturalCalibration:
      "India: sometimes nobody ever asked what they wanted before.",
  },
  {
    key: "minimizing",
    category: "coping_mechanism",
    description:
      "Downplaying own struggle ('it's not that bad', 'others have it worse').",
    culturalCalibration:
      "India: validate the comparison, then make room for their actual lived experience.",
  },
  {
    key: "over_intellectualizing",
    category: "coping_mechanism",
    description:
      "Offering abstract systems analysis where a personal feeling or memory was asked for.",
    culturalCalibration:
      "India: may reflect unpracticed emotional vocabulary before deliberate avoidance.",
  },

  // Limiting beliefs
  {
    key: "prestige_equals_worth",
    category: "limiting_belief",
    description:
      "Choices justified primarily through brand names, titles, pedigree, or external rankings.",
    culturalCalibration:
      "India: prestige can carry family honor. Let both family pride and personal fit count.",
  },
  {
    key: "alone_equals_unwanted",
    category: "limiting_belief",
    description: "Solitude or stepping off the group path framed as rejection.",
    culturalCalibration:
      "India: being alone can carry real social cost. Acknowledge both internal fear and external reality.",
  },
  {
    key: "productivity_equals_value",
    category: "limiting_belief",
    description:
      "Self described almost exclusively through output, deliverables, and utility.",
    culturalCalibration:
      "India: usefulness can be how care and love were expressed at home.",
  },
  {
    key: "money_equals_safety",
    category: "limiting_belief",
    description:
      "Every option filtered through financial security even when baseline security is met.",
    culturalCalibration:
      "India: money often carries multi-generational family obligations. Ask gently whether the target number is theirs or inherited.",
  },
  {
    key: "vulnerability_equals_weakness",
    category: "limiting_belief",
    description: "Struggle or uncertainty framed as private failure.",
    culturalCalibration:
      "India: privacy can protect family standing; notice which audience they are shielding.",
  },
  {
    key: "help_equals_incompetence",
    category: "limiting_belief",
    description: "Insisting on carrying every decision and burden alone.",
    culturalCalibration:
      "Notice how rarely they let anyone support them without immediately repaying it.",
  },
  {
    key: "rest_equals_failure",
    category: "limiting_belief",
    description: "Rest described as earned, guilty, lazy, or wasted time.",
    culturalCalibration:
      "India: often inherited from parents who sacrificed rest. Honor the origin without keeping the guilt.",
  },

  // Root causes
  {
    key: "comparison_spirals",
    category: "root_cause",
    description:
      "Constant measuring against peers, college batchmates, cousins, or feeds.",
    culturalCalibration:
      "India: comparison is built into ranks and family gatherings. Question where the yardstick came from.",
  },
  {
    key: "relationship_patterns_in_career",
    category: "root_cause",
    description:
      "Repeating the same approval/conflict dynamics with managers as with parents or partners.",
    culturalCalibration:
      "India: family hierarchy often maps onto workplace hierarchy.",
  },
  {
    key: "institutional_dependency",
    category: "root_cause",
    description:
      "Waiting for an external syllabus, employer, or prestigious stamp to say a path is valid.",
    culturalCalibration:
      "India: exam and placement ladders train this early; frame it as old training ready to be outgrown.",
  },
  {
    key: "class_transition_stress",
    category: "root_cause",
    description:
      "First-generation markers, financial conditioning, straddling two economic worlds.",
    culturalCalibration:
      "Honor the distance traveled and the quiet exhaustion of translating between worlds.",
  },
  {
    key: "childhood_conditioning",
    category: "root_cause",
    description: "Choices trace back to early unspoken rules about worth or love.",
    culturalCalibration: "India: never cast parents as villains.",
  },
  {
    key: "depletion_read_as_confusion",
    category: "root_cause",
    description:
      "Deep physical/mental exhaustion misread as 'I don't know what career I want'.",
    culturalCalibration:
      "Distinguish running on empty from lacking direction.",
  },

  // Signal flags
  {
    key: "identity_merged_with_output",
    category: "signal_flag",
    description: "Day 1: every answer — even outside-work ones — circles back to work output.",
    culturalCalibration: "Notice how little room is left for a self outside deliverables.",
  },
  {
    key: "joy_disconnection",
    category: "signal_flag",
    description: "Day 2: struggled or said 'I don't know' to the genuine fun question.",
    culturalCalibration: "Treat forgotten fun gently as a signal of long over-extension.",
  },
  {
    key: "embodiment_deprivation",
    category: "signal_flag",
    description: "Day 2: everything alive is physical/tactile while daily work is pure screens.",
    culturalCalibration: "Highlight the body-vs-screen contrast in plain words.",
  },
  {
    key: "identity_not_career_crisis",
    category: "signal_flag",
    description: "Day 3: no world (school, work, social) felt genuinely like them.",
    culturalCalibration: "Frame reflection around selfhood rather than switching job titles.",
  },
  {
    key: "self_minimization",
    category: "signal_flag",
    description: "Day 3: names the one place they feel real and immediately dismisses it as small.",
    culturalCalibration: "Give weight back to that dismissed corner.",
  },
  {
    key: "values_behavior_gap",
    category: "signal_flag",
    description: "Day 4: top ranked values directly contradict how last week was actually spent.",
    culturalCalibration: "Reflect the gap with curiosity rather than blame.",
  },
  {
    key: "prestige_awareness",
    category: "signal_flag",
    description: "Day 4: sees clearly that prestige feels useful rather than nourishing.",
    culturalCalibration: "Positive clarity — build on their own distinction.",
  },
  {
    key: "burnout_not_confusion",
    category: "signal_flag",
    description: "Day 5: ideal morning or final need centers on rest, quiet, and recovery.",
    culturalCalibration: "Lead with rest before big career moves.",
  },
  {
    key: "already_knows",
    category: "signal_flag",
    description: "Day 5: answered Q28 ('the one thing you know you need to do') immediately and specifically.",
    culturalCalibration: "Reflect their own Q28 answer back as a primary direction.",
  },

  // Meta
  {
    key: "performing_for_spiral",
    category: "meta",
    description: "Polished, essay-like answers written as if for an audience even in private.",
    culturalCalibration: "Notice gently how even private reflection became a stage.",
  },
] as const;

export const VALID_PATTERN_KEYS = new Set(PATTERN_TAXONOMY.map((p) => p.key));

const FORBIDDEN_LABEL_REPLACEMENTS: ReadonlyArray<{
  pattern: RegExp;
  labelName: string;
  replacement: string;
}> = [
  {
    pattern: /\bpeople[-_ ]pleasing\b/gi,
    labelName: "people-pleasing",
    replacement: "organizing your choices around what others need from you",
  },
  {
    pattern: /\bpeople[-_ ]pleaser\b/gi,
    labelName: "people-pleaser",
    replacement: "someone who puts everyone else's comfort first",
  },
  {
    pattern: /\btoxic[-_ ]positivity\b/gi,
    labelName: "toxic positivity",
    replacement: "rushing into gratitude before letting yourself feel disappointed",
  },
  {
    pattern: /\bperformative[-_ ]self[-_ ]awareness\b/gi,
    labelName: "performative self-awareness",
    replacement: "explaining the feeling neatly from the outside",
  },
  {
    pattern: /\bover[-_ ]intellectualiz(?:ing|ation)\b/gi,
    labelName: "over-intellectualizing",
    replacement: "analyzing a feeling from a safe distance",
  },
  {
    pattern: /\bcoping[-_ ]mechanisms?\b/gi,
    labelName: "coping mechanism",
    replacement: "quiet habit of self-protection",
  },
  {
    pattern: /\blimiting[-_ ]beliefs?\b/gi,
    labelName: "limiting belief",
    replacement: "unspoken rule",
  },
  {
    pattern: /\bburnout\b/gi,
    labelName: "burnout",
    replacement: "deep exhaustion",
  },
  {
    pattern: /\bburned[-_ ]out\b/gi,
    labelName: "burned out",
    replacement: "running on empty",
  },
  {
    pattern: /\binstitutional[-_ ]dependency\b/gi,
    labelName: "institutional dependency",
    replacement: "waiting for an external stamp of approval",
  },
  {
    pattern: /\bcomparison[-_ ]spirals?\b/gi,
    labelName: "comparison spiral",
    replacement: "measuring yourself against everyone around you",
  },
  {
    pattern: /\bchildhood[-_ ]conditioning\b/gi,
    labelName: "childhood conditioning",
    replacement: "early lessons you grew up with",
  },
  {
    pattern: /\bembodiment[-_ ]deprivation\b/gi,
    labelName: "embodiment deprivation",
    replacement: "missing physical, hands-on life away from screens",
  },
];

/**
 * Scans user-facing synthesis prose or insight text for any leaked internal taxonomy keys
 * or clinical/jargon labels (`CHECKLIST.md`: "people-pleasing", "burnout", "limiting belief").
 */
export function findLeakedPatternLabels(text: string): string[] {
  logInfo("patterns.findLeakedPatternLabels", { textLength: text.length });
  const leaks: string[] = [];
  for (const rule of FORBIDDEN_LABEL_REPLACEMENTS) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(text)) {
      leaks.push(rule.labelName);
    }
  }
  for (const entry of PATTERN_TAXONOMY) {
    if (text.includes(entry.key)) {
      leaks.push(entry.key);
    }
  }
  return Array.from(new Set(leaks));
}

/**
 * Replaces any leaked clinical/taxonomy terms with plain, human descriptions as a final
 * defense-in-depth post-check (`BUGS.md`).
 */
export function stripLeakedPatternLabels(text: string): string {
  logInfo("patterns.stripLeakedPatternLabels", { textLength: text.length });
  let out = text;
  for (const rule of FORBIDDEN_LABEL_REPLACEMENTS) {
    out = out.replace(rule.pattern, rule.replacement);
  }
  for (const entry of PATTERN_TAXONOMY) {
    if (out.includes(entry.key)) {
      out = out.split(entry.key).join(entry.key.replace(/_/g, " "));
    }
  }
  return out;
}
