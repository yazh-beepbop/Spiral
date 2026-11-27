/**
 * Crisis support helpline resources for Spiral (`src/lib/safety/resources.ts`).
 *
 * Feature overview & use cases:
 * - Provides India-first crisis support contact details shown immediately on `/paused`
 *   whenever the safety classifier detects an `acute` risk signal (`Design.md` Section 9).
 * - Treated as protected safety copy (`CONSTRAINTS.md` Section 4: do not alter helpline
 *   content without explicit review).
 */

export interface HelplineResource {
  id: string;
  name: string;
  number: string;
  alternateNumber?: string;
  availability: string;
  description: string;
}

export const SAFETY_PAUSE_COPY = {
  eyebrow: "Session paused with care",
  heading: "Let’s pause here for right now.",
  body: "What you just shared sounds heavy, and you don’t have to sit with it alone. Spiral isn’t equipped to support someone through a moment of crisis — a real person who cares is the right next step.",
  savedNotice: "Your journey is saved. You can come back when you're ready.",
  internationalNote:
    "If you are outside India, contact your local emergency number.",
} as const;

export const INDIA_HELPLINE_RESOURCES: readonly HelplineResource[] = [
  {
    id: "tele-manas",
    name: "Tele-MANAS — National Mental Health Helpline (India)",
    number: "14416",
    alternateNumber: "1-800-891-4416",
    availability: "24 hours · Free & confidential · 20+ languages",
    description:
      "Government of India national mental health support line connecting you directly with trained counsellors and mental health professionals.",
  },
  {
    id: "india-emergency",
    name: "National Emergency Response (India)",
    number: "112",
    availability: "24 hours · Immediate emergency assistance",
    description:
      "Call 112 from any phone if you are in immediate physical danger or need urgent emergency assistance.",
  },
] as const;
