/**
 * Person-rooted persistence repository for Spiral (`src/lib/db/repository.ts`).
 *
 * Feature overview & use cases:
 * - Implements all server-side reads and writes under the person-rooted Firestore schema
 *   defined in `ARCHITECTURE.md`:
 *   `persons/{personId}` -> `journeys/{journeyId}` -> `sessions/{day}` -> `answers/{answerId}`,
 *   `bridges/{day}`, `patternFlags/{flagId}`, `synthesis/main`, and `safetyEvents/{eventId}`.
 * - Validates every document with Zod (`src/lib/db/schema.ts`) before saving and upon reading.
 * - Uses Cloud Firestore via `firebase-admin` whenever credentials are present (and always
 *   in production). When running locally in development without Firebase credentials yet,
 *   transparently persists the identical person-rooted tree in `.next/spiral-local-firestore.json`
 *   (already gitignored via `.next/`) with strict per-`personId` isolation.
 */

import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { Timestamp } from "firebase-admin/firestore";
import {
  type AnswerDoc,
  AnswerDocSchema,
  type BridgeDoc,
  BridgeDocSchema,
  type CrisisType,
  type JourneyDoc,
  JourneyDocSchema,
  type JourneyStatus,
  type PatternFlagDoc,
  PatternFlagDocSchema,
  type PersonDoc,
  PersonDocSchema,
  type SafetyEventDoc,
  SafetyEventDocSchema,
  type SessionDoc,
  SessionDocSchema,
  type SynthesisDoc,
  SynthesisDocSchema,
} from "@/lib/db/schema";
import {
  getAdminFirestore,
  isFirebaseAdminConfigured,
} from "@/lib/firebase/admin";
import { logInfo } from "@/lib/log";

interface LocalJourneyNode {
  doc: JourneyDoc;
  sessions: Record<string, SessionDoc>;
  answers: Record<string, Record<string, AnswerDoc>>;
  bridges: Record<string, BridgeDoc>;
  patternFlags: Record<string, PatternFlagDoc>;
  synthesisMain: SynthesisDoc | null;
}

interface LocalPersonNode {
  doc: PersonDoc;
  journeys: Record<string, LocalJourneyNode>;
  safetyEvents: Record<string, SafetyEventDoc>;
}

interface LocalStoreRoot {
  persons: Record<string, LocalPersonNode>;
}

const LOCAL_STORE_PATH = join(
  process.cwd(),
  ".next",
  "spiral-local-firestore.json",
);

/**
 * Reads the local dev fallback JSON store from `.next/spiral-local-firestore.json`.
 */
function readLocalStore(): LocalStoreRoot {
  if (!existsSync(LOCAL_STORE_PATH)) {
    return { persons: {} };
  }
  try {
    const raw = readFileSync(LOCAL_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as LocalStoreRoot;
    return parsed && typeof parsed === "object" && parsed.persons
      ? parsed
      : { persons: {} };
  } catch {
    return { persons: {} };
  }
}

/**
 * Writes the local dev fallback JSON store atomically under `.next/`.
 */
function writeLocalStore(store: LocalStoreRoot): void {
  const dir = dirname(LOCAL_STORE_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(LOCAL_STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

/**
 * Converts Firestore `Timestamp` fields into ISO-8601 strings before Zod parsing.
 */
function normalizeTimestamps(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v instanceof Timestamp) {
      out[k] = v.toDate().toISOString();
    } else if (
      v &&
      typeof v === "object" &&
      "toDate" in v &&
      typeof (v as { toDate: unknown }).toDate === "function"
    ) {
      out[k] = (v as { toDate: () => Date }).toDate().toISOString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Creates or updates the root `persons/{personId}` record after 18+ attestation.
 */
export async function upsertPerson(
  personId: string,
  params: { country?: string; anniversaryOptIn?: boolean } = {},
): Promise<PersonDoc> {
  logInfo("db.upsertPerson", { personIdLen: personId.length });
  const nowIso = new Date().toISOString();

  if (!isFirebaseAdminConfigured() && process.env.NODE_ENV !== "production") {
    const store = readLocalStore();
    const existing = store.persons[personId]?.doc;
    const personDoc = PersonDocSchema.parse({
      createdAt: existing?.createdAt ?? nowIso,
      ageAttested18: true,
      country: params.country ?? existing?.country ?? "IN",
      anniversaryOptIn:
        params.anniversaryOptIn ?? existing?.anniversaryOptIn ?? false,
    });
    store.persons[personId] = store.persons[personId] ?? {
      doc: personDoc,
      journeys: {},
      safetyEvents: {},
    };
    store.persons[personId].doc = personDoc;
    writeLocalStore(store);
    return personDoc;
  }

  const db = getAdminFirestore();
  const ref = db.collection("persons").doc(personId);
  const snap = await ref.get();
  const existingData = snap.exists
    ? normalizeTimestamps(snap.data() as Record<string, unknown>)
    : null;

  const personDoc = PersonDocSchema.parse({
    createdAt: (existingData?.createdAt as string | undefined) ?? nowIso,
    ageAttested18: true,
    country: params.country ?? (existingData?.country as string | undefined) ?? "IN",
    anniversaryOptIn:
      params.anniversaryOptIn ??
      (existingData?.anniversaryOptIn as boolean | undefined) ??
      false,
  });

  await ref.set(personDoc, { merge: true });
  return personDoc;
}

/**
 * Fetches `persons/{personId}` or returns `null` if the visitor has not attested yet.
 */
export async function getPerson(personId: string): Promise<PersonDoc | null> {
  logInfo("db.getPerson", { personIdLen: personId.length });

  if (!isFirebaseAdminConfigured() && process.env.NODE_ENV !== "production") {
    const store = readLocalStore();
    const person = store.persons[personId]?.doc;
    return person ? PersonDocSchema.parse(person) : null;
  }

  const snap = await getAdminFirestore().collection("persons").doc(personId).get();
  if (!snap.exists) {
    return null;
  }
  return PersonDocSchema.parse(
    normalizeTimestamps(snap.data() as Record<string, unknown>),
  );
}

/**
 * Creates a new Career Fog journey under `persons/{personId}/journeys/{journeyId}`
 * and opens its Day 1 session document.
 */
export async function createCareerFogJourney(
  personId: string,
): Promise<{ journey: JourneyDoc; session: SessionDoc }> {
  logInfo("db.createCareerFogJourney", { personIdLen: personId.length });
  const nowIso = new Date().toISOString();
  const journeyId = `j_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

  const journey = JourneyDocSchema.parse({
    id: journeyId,
    entryPoint: "career_fog",
    idkMode: "standard",
    status: "active",
    currentDay: 1,
    nextUnlockAt: null,
    crisisType: null,
    startedAt: nowIso,
    completedAt: null,
  });

  const session = SessionDocSchema.parse({
    day: 1,
    openedAt: nowIso,
    completedAt: null,
    overnightReflection: null,
    adaptiveQuestions: {},
    idkCounts: {},
  });

  if (!isFirebaseAdminConfigured() && process.env.NODE_ENV !== "production") {
    const store = readLocalStore();
    if (!store.persons[personId]) {
      throw new Error("Person record must exist before creating a journey.");
    }
    store.persons[personId].journeys[journeyId] = {
      doc: journey,
      sessions: { "1": session },
      answers: { "1": {} },
      bridges: {},
      patternFlags: {},
      synthesisMain: null,
    };
    writeLocalStore(store);
    return { journey, session };
  }

  const db = getAdminFirestore();
  const journeyRef = db
    .collection("persons")
    .doc(personId)
    .collection("journeys")
    .doc(journeyId);

  const batch = db.batch();
  batch.set(journeyRef, {
    ...journey,
    nextUnlockAt: null,
  });
  batch.set(journeyRef.collection("sessions").doc("1"), session);
  await batch.commit();

  return { journey, session };
}

/**
 * Loads the person's most recent non-abandoned journey (`active`, `paused`, or `completed`),
 * or `null` if none exists.
 */
export async function getLatestJourney(
  personId: string,
): Promise<JourneyDoc | null> {
  logInfo("db.getLatestJourney", { personIdLen: personId.length });

  if (!isFirebaseAdminConfigured() && process.env.NODE_ENV !== "production") {
    const store = readLocalStore();
    const personNode = store.persons[personId];
    if (!personNode) {
      return null;
    }
    const list = Object.values(personNode.journeys)
      .map((j) => JourneyDocSchema.parse(j.doc))
      .filter((j) => j.status !== "abandoned")
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return list[0] ?? null;
  }

  const snap = await getAdminFirestore()
    .collection("persons")
    .doc(personId)
    .collection("journeys")
    .orderBy("startedAt", "desc")
    .limit(5)
    .get();

  for (const docSnap of snap.docs) {
    const normalized = normalizeTimestamps({
      id: docSnap.id,
      ...(docSnap.data() as Record<string, unknown>),
    });
    const parsed = JourneyDocSchema.parse(normalized);
    if (parsed.status !== "abandoned") {
      return parsed;
    }
  }
  return null;
}

/**
 * Fetches a specific journey under `persons/{personId}/journeys/{journeyId}`.
 */
export async function getJourneyById(
  personId: string,
  journeyId: string,
): Promise<JourneyDoc | null> {
  logInfo("db.getJourneyById", { personIdLen: personId.length, journeyId });

  if (!isFirebaseAdminConfigured() && process.env.NODE_ENV !== "production") {
    const store = readLocalStore();
    const j = store.persons[personId]?.journeys[journeyId]?.doc;
    return j ? JourneyDocSchema.parse(j) : null;
  }

  const snap = await getAdminFirestore()
    .collection("persons")
    .doc(personId)
    .collection("journeys")
    .doc(journeyId)
    .get();

  if (!snap.exists) {
    return null;
  }
  return JourneyDocSchema.parse(
    normalizeTimestamps({
      id: snap.id,
      ...(snap.data() as Record<string, unknown>),
    }),
  );
}

/**
 * Updates mutable server-controlled fields on `persons/{personId}/journeys/{journeyId}`
 * (`status`, `currentDay`, `nextUnlockAt`, `crisisType`, `completedAt`).
 */
export async function updateJourney(
  personId: string,
  journeyId: string,
  patch: Partial<
    Pick<
      JourneyDoc,
      "status" | "currentDay" | "nextUnlockAt" | "crisisType" | "completedAt"
    >
  >,
): Promise<JourneyDoc> {
  logInfo("db.updateJourney", {
    personIdLen: personId.length,
    journeyId,
    fields: Object.keys(patch),
  });

  if (!isFirebaseAdminConfigured() && process.env.NODE_ENV !== "production") {
    const store = readLocalStore();
    const node = store.persons[personId]?.journeys[journeyId];
    if (!node) {
      throw new Error(`Journey not found: ${journeyId}`);
    }
    const updated = JourneyDocSchema.parse({
      ...node.doc,
      ...patch,
    });
    node.doc = updated;
    writeLocalStore(store);
    return updated;
  }

  const ref = getAdminFirestore()
    .collection("persons")
    .doc(personId)
    .collection("journeys")
    .doc(journeyId);

  const firestorePatch: Record<string, unknown> = { ...patch };
  if ("nextUnlockAt" in patch) {
    firestorePatch.nextUnlockAt = patch.nextUnlockAt
      ? Timestamp.fromDate(new Date(patch.nextUnlockAt))
      : null;
  }

  await ref.set(firestorePatch, { merge: true });
  const fresh = await getJourneyById(personId, journeyId);
  if (!fresh) {
    throw new Error(`Journey disappeared after update: ${journeyId}`);
  }
  return fresh;
}

/**
 * Gets or initializes `sessions/{day}` under a journey.
 */
export async function getOrCreateSession(
  personId: string,
  journeyId: string,
  day: number,
): Promise<SessionDoc> {
  logInfo("db.getOrCreateSession", {
    personIdLen: personId.length,
    journeyId,
    day,
  });
  const dayKey = String(day);
  const nowIso = new Date().toISOString();

  if (!isFirebaseAdminConfigured() && process.env.NODE_ENV !== "production") {
    const store = readLocalStore();
    const node = store.persons[personId]?.journeys[journeyId];
    if (!node) {
      throw new Error(`Journey not found: ${journeyId}`);
    }
    if (node.sessions[dayKey]) {
      return SessionDocSchema.parse(node.sessions[dayKey]);
    }
    const created = SessionDocSchema.parse({
      day,
      openedAt: nowIso,
      completedAt: null,
      overnightReflection: null,
      adaptiveQuestions: {},
      idkCounts: {},
    });
    node.sessions[dayKey] = created;
    node.answers[dayKey] = node.answers[dayKey] ?? {};
    writeLocalStore(store);
    return created;
  }

  const ref = getAdminFirestore()
    .collection("persons")
    .doc(personId)
    .collection("journeys")
    .doc(journeyId)
    .collection("sessions")
    .doc(dayKey);

  const snap = await ref.get();
  if (snap.exists) {
    return SessionDocSchema.parse(
      normalizeTimestamps(snap.data() as Record<string, unknown>),
    );
  }

  const created = SessionDocSchema.parse({
    day,
    openedAt: nowIso,
    completedAt: null,
    overnightReflection: null,
    adaptiveQuestions: {},
    idkCounts: {},
  });
  await ref.set(created);
  return created;
}

/**
 * Updates fields on `sessions/{day}` (`completedAt`, `overnightReflection`, `adaptiveQuestions`, `idkCounts`).
 */
export async function updateSession(
  personId: string,
  journeyId: string,
  day: number,
  patch: Partial<
    Pick<
      SessionDoc,
      "completedAt" | "overnightReflection" | "adaptiveQuestions" | "idkCounts"
    >
  >,
): Promise<SessionDoc> {
  logInfo("db.updateSession", {
    personIdLen: personId.length,
    journeyId,
    day,
    fields: Object.keys(patch),
  });
  const dayKey = String(day);
  const current = await getOrCreateSession(personId, journeyId, day);
  const merged = SessionDocSchema.parse({
    ...current,
    ...patch,
  });

  if (!isFirebaseAdminConfigured() && process.env.NODE_ENV !== "production") {
    const store = readLocalStore();
    const node = store.persons[personId]?.journeys[journeyId];
    if (!node) {
      throw new Error(`Journey not found: ${journeyId}`);
    }
    node.sessions[dayKey] = merged;
    writeLocalStore(store);
    return merged;
  }

  await getAdminFirestore()
    .collection("persons")
    .doc(personId)
    .collection("journeys")
    .doc(journeyId)
    .collection("sessions")
    .doc(dayKey)
    .set(merged, { merge: true });

  return merged;
}

/**
 * Saves a screened answer document under `sessions/{day}/answers/{answerId}`
 * (keyed deterministically by `q_{qid}` for final answers or unique ID for paused acute events).
 */
export async function saveAnswer(
  personId: string,
  journeyId: string,
  day: number,
  answer: Omit<AnswerDoc, "id" | "createdAt"> & { id?: string; createdAt?: string },
): Promise<AnswerDoc> {
  const answerId =
    answer.id ??
    (answer.excludedFromAI
      ? `acute_${answer.qid}_${randomUUID().slice(0, 8)}`
      : `q_${answer.qid}`);

  const validated = AnswerDocSchema.parse({
    ...answer,
    id: answerId,
    createdAt: answer.createdAt ?? new Date().toISOString(),
  });

  logInfo("db.saveAnswer", {
    personIdLen: personId.length,
    journeyId,
    day,
    qid: validated.qid,
    answerId: validated.id,
    textLength: validated.text.length,
    idkCount: validated.idkCount,
    idkFlagged: validated.idkFlagged,
    safetyLevel: validated.safety.level,
    excludedFromAI: validated.excludedFromAI,
  });

  const dayKey = String(day);
  await getOrCreateSession(personId, journeyId, day);

  if (!isFirebaseAdminConfigured() && process.env.NODE_ENV !== "production") {
    const store = readLocalStore();
    const node = store.persons[personId]?.journeys[journeyId];
    if (!node) {
      throw new Error(`Journey not found: ${journeyId}`);
    }
    node.answers[dayKey] = node.answers[dayKey] ?? {};
    node.answers[dayKey][validated.id] = validated;
    writeLocalStore(store);
    return validated;
  }

  await getAdminFirestore()
    .collection("persons")
    .doc(personId)
    .collection("journeys")
    .doc(journeyId)
    .collection("sessions")
    .doc(dayKey)
    .collection("answers")
    .doc(validated.id)
    .set(validated);

  return validated;
}

/**
 * Lists all answers saved for a single `day`, sorted by `createdAt`.
 */
export async function listDayAnswers(
  personId: string,
  journeyId: string,
  day: number,
  options: { excludeFlaggedSafety?: boolean } = {},
): Promise<AnswerDoc[]> {
  logInfo("db.listDayAnswers", {
    personIdLen: personId.length,
    journeyId,
    day,
    excludeFlaggedSafety: Boolean(options.excludeFlaggedSafety),
  });
  const dayKey = String(day);

  let answers: AnswerDoc[] = [];
  if (!isFirebaseAdminConfigured() && process.env.NODE_ENV !== "production") {
    const store = readLocalStore();
    const map = store.persons[personId]?.journeys[journeyId]?.answers[dayKey] ?? {};
    answers = Object.values(map).map((a) => AnswerDocSchema.parse(a));
  } else {
    const snap = await getAdminFirestore()
      .collection("persons")
      .doc(personId)
      .collection("journeys")
      .doc(journeyId)
      .collection("sessions")
      .doc(dayKey)
      .collection("answers")
      .get();
    answers = snap.docs.map((d) =>
      AnswerDocSchema.parse(
        normalizeTimestamps({
          id: d.id,
          ...(d.data() as Record<string, unknown>),
        }),
      ),
    );
  }

  if (options.excludeFlaggedSafety) {
    answers = answers.filter((a) => !a.excludedFromAI);
  }
  return answers.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Lists answers across all days (`1..5`) of a journey, optionally filtering out
 * `excludedFromAI === true` answers before any AI generation step (`CONSTRAINTS.md`).
 */
export async function listJourneyAnswers(
  personId: string,
  journeyId: string,
  options: { excludeFlaggedSafety?: boolean } = { excludeFlaggedSafety: true },
): Promise<Array<AnswerDoc & { day: number }>> {
  logInfo("db.listJourneyAnswers", {
    personIdLen: personId.length,
    journeyId,
    excludeFlaggedSafety: Boolean(options.excludeFlaggedSafety),
  });
  const results: Array<AnswerDoc & { day: number }> = [];
  for (let day = 1; day <= 5; day++) {
    const dayAnswers = await listDayAnswers(personId, journeyId, day, options);
    for (const ans of dayAnswers) {
      results.push({ ...ans, day });
    }
  }
  return results;
}

/**
 * Saves an end-of-day Bridge Question under `bridges/{day}`.
 */
export async function saveBridge(
  personId: string,
  journeyId: string,
  bridge: Omit<BridgeDoc, "createdAt"> & { createdAt?: string },
): Promise<BridgeDoc> {
  const validated = BridgeDocSchema.parse({
    ...bridge,
    createdAt: bridge.createdAt ?? new Date().toISOString(),
  });
  logInfo("db.saveBridge", {
    personIdLen: personId.length,
    journeyId,
    day: validated.day,
    format: validated.format,
    wordCount: validated.wordCount,
  });

  const dayKey = String(validated.day);
  if (!isFirebaseAdminConfigured() && process.env.NODE_ENV !== "production") {
    const store = readLocalStore();
    const node = store.persons[personId]?.journeys[journeyId];
    if (!node) {
      throw new Error(`Journey not found: ${journeyId}`);
    }
    node.bridges[dayKey] = validated;
    writeLocalStore(store);
    return validated;
  }

  await getAdminFirestore()
    .collection("persons")
    .doc(personId)
    .collection("journeys")
    .doc(journeyId)
    .collection("bridges")
    .doc(dayKey)
    .set(validated);

  return validated;
}

/**
 * Fetches `bridges/{day}` or `null` if that day's Bridge has not been generated yet.
 */
export async function getBridgeForDay(
  personId: string,
  journeyId: string,
  day: number,
): Promise<BridgeDoc | null> {
  logInfo("db.getBridgeForDay", {
    personIdLen: personId.length,
    journeyId,
    day,
  });
  const dayKey = String(day);

  if (!isFirebaseAdminConfigured() && process.env.NODE_ENV !== "production") {
    const store = readLocalStore();
    const bridge = store.persons[personId]?.journeys[journeyId]?.bridges[dayKey];
    return bridge ? BridgeDocSchema.parse(bridge) : null;
  }

  const snap = await getAdminFirestore()
    .collection("persons")
    .doc(personId)
    .collection("journeys")
    .doc(journeyId)
    .collection("bridges")
    .doc(dayKey)
    .get();

  if (!snap.exists) {
    return null;
  }
  return BridgeDocSchema.parse(
    normalizeTimestamps(snap.data() as Record<string, unknown>),
  );
}

/**
 * Lists all saved Bridges (`1..5`) for a journey ordered by day.
 */
export async function listJourneyBridges(
  personId: string,
  journeyId: string,
): Promise<BridgeDoc[]> {
  logInfo("db.listJourneyBridges", { personIdLen: personId.length, journeyId });
  const bridges: BridgeDoc[] = [];
  for (let day = 1; day <= 5; day++) {
    const b = await getBridgeForDay(personId, journeyId, day);
    if (b) {
      bridges.push(b);
    }
  }
  return bridges;
}

/**
 * Saves Day 5 structured pattern flags under `patternFlags/{flagId}` and sets `journey.crisisType`.
 */
export async function savePatternFlags(
  personId: string,
  journeyId: string,
  flags: PatternFlagDoc[],
  crisisType: CrisisType,
): Promise<void> {
  const validatedFlags = flags.map((f) => PatternFlagDocSchema.parse(f));
  logInfo("db.savePatternFlags", {
    personIdLen: personId.length,
    journeyId,
    flagCount: validatedFlags.length,
  });

  if (!isFirebaseAdminConfigured() && process.env.NODE_ENV !== "production") {
    const store = readLocalStore();
    const node = store.persons[personId]?.journeys[journeyId];
    if (!node) {
      throw new Error(`Journey not found: ${journeyId}`);
    }
    node.patternFlags = {};
    for (const flag of validatedFlags) {
      node.patternFlags[flag.id] = flag;
    }
    node.doc = JourneyDocSchema.parse({
      ...node.doc,
      crisisType,
    });
    writeLocalStore(store);
    return;
  }

  const db = getAdminFirestore();
  const journeyRef = db
    .collection("persons")
    .doc(personId)
    .collection("journeys")
    .doc(journeyId);

  const batch = db.batch();
  batch.set(journeyRef, { crisisType }, { merge: true });
  for (const flag of validatedFlags) {
    batch.set(journeyRef.collection("patternFlags").doc(flag.id), flag);
  }
  await batch.commit();
}

/**
 * Saves Day 5 synthesis under `synthesis/main` and marks the journey `completed`.
 */
export async function saveSynthesis(
  personId: string,
  journeyId: string,
  synthesis: Omit<SynthesisDoc, "createdAt"> & { createdAt?: string },
  markCompleted: JourneyStatus = "completed",
): Promise<SynthesisDoc> {
  const validated = SynthesisDocSchema.parse({
    ...synthesis,
    createdAt: synthesis.createdAt ?? new Date().toISOString(),
  });
  logInfo("db.saveSynthesis", {
    personIdLen: personId.length,
    journeyId,
    insightCount: validated.insights.length,
    textLength: validated.text.length,
  });

  if (!isFirebaseAdminConfigured() && process.env.NODE_ENV !== "production") {
    const store = readLocalStore();
    const node = store.persons[personId]?.journeys[journeyId];
    if (!node) {
      throw new Error(`Journey not found: ${journeyId}`);
    }
    node.synthesisMain = validated;
    node.doc = JourneyDocSchema.parse({
      ...node.doc,
      status: markCompleted,
      completedAt: validated.createdAt,
      nextUnlockAt: null,
    });
    writeLocalStore(store);
    return validated;
  }

  const db = getAdminFirestore();
  const journeyRef = db
    .collection("persons")
    .doc(personId)
    .collection("journeys")
    .doc(journeyId);

  const batch = db.batch();
  batch.set(journeyRef.collection("synthesis").doc("main"), validated);
  batch.set(
    journeyRef,
    {
      status: markCompleted,
      completedAt: validated.createdAt,
      nextUnlockAt: null,
    },
    { merge: true },
  );
  await batch.commit();
  return validated;
}

/**
 * Fetches `synthesis/main` for a journey, or `null` if not yet generated.
 */
export async function getSynthesis(
  personId: string,
  journeyId: string,
): Promise<SynthesisDoc | null> {
  logInfo("db.getSynthesis", { personIdLen: personId.length, journeyId });

  if (!isFirebaseAdminConfigured() && process.env.NODE_ENV !== "production") {
    const store = readLocalStore();
    const syn = store.persons[personId]?.journeys[journeyId]?.synthesisMain;
    return syn ? SynthesisDocSchema.parse(syn) : null;
  }

  const snap = await getAdminFirestore()
    .collection("persons")
    .doc(personId)
    .collection("journeys")
    .doc(journeyId)
    .collection("synthesis")
    .doc("main")
    .get();

  if (!snap.exists) {
    return null;
  }
  return SynthesisDocSchema.parse(
    normalizeTimestamps(snap.data() as Record<string, unknown>),
  );
}

/**
 * Updates `landed` (`true | false`) feedback on a single insight inside `synthesis/main`.
 */
export async function updateSynthesisInsightFeedback(
  personId: string,
  journeyId: string,
  insightId: string,
  landed: boolean,
): Promise<SynthesisDoc> {
  logInfo("db.updateSynthesisInsightFeedback", {
    personIdLen: personId.length,
    journeyId,
    insightId,
    landed,
  });

  const existing = await getSynthesis(personId, journeyId);
  if (!existing) {
    throw new Error("Synthesis document does not exist yet.");
  }

  let matched = false;
  const updatedInsights = existing.insights.map((ins) => {
    if (ins.id === insightId) {
      matched = true;
      return { ...ins, landed };
    }
    return ins;
  });

  if (!matched) {
    throw new Error(`Insight ID not found: ${insightId}`);
  }

  const updated = SynthesisDocSchema.parse({
    ...existing,
    insights: updatedInsights,
  });

  if (!isFirebaseAdminConfigured() && process.env.NODE_ENV !== "production") {
    const store = readLocalStore();
    const node = store.persons[personId]?.journeys[journeyId];
    if (!node) {
      throw new Error(`Journey not found: ${journeyId}`);
    }
    node.synthesisMain = updated;
    writeLocalStore(store);
    return updated;
  }

  await getAdminFirestore()
    .collection("persons")
    .doc(personId)
    .collection("journeys")
    .doc(journeyId)
    .collection("synthesis")
    .doc("main")
    .set(updated, { merge: true });

  return updated;
}

/**
 * Updates the `"None of these fit me"` (`noneFitMe`) flag on `synthesis/main`.
 */
export async function updateSynthesisNoneFitMe(
  personId: string,
  journeyId: string,
  noneFitMe: boolean,
): Promise<SynthesisDoc> {
  logInfo("db.updateSynthesisNoneFitMe", {
    personIdLen: personId.length,
    journeyId,
    noneFitMe,
  });

  const existing = await getSynthesis(personId, journeyId);
  if (!existing) {
    throw new Error("Synthesis document does not exist yet.");
  }

  const updated = SynthesisDocSchema.parse({
    ...existing,
    noneFitMe,
  });

  if (!isFirebaseAdminConfigured() && process.env.NODE_ENV !== "production") {
    const store = readLocalStore();
    const node = store.persons[personId]?.journeys[journeyId];
    if (!node) {
      throw new Error(`Journey not found: ${journeyId}`);
    }
    node.synthesisMain = updated;
    writeLocalStore(store);
    return updated;
  }

  await getAdminFirestore()
    .collection("persons")
    .doc(personId)
    .collection("journeys")
    .doc(journeyId)
    .collection("synthesis")
    .doc("main")
    .set(updated, { merge: true });

  return updated;
}

/**
 * Logs a `concern` or `acute` safety event under `persons/{personId}/safetyEvents/{eventId}`.
 */
export async function recordSafetyEvent(
  personId: string,
  event: Omit<SafetyEventDoc, "id" | "createdAt">,
): Promise<SafetyEventDoc> {
  const eventDoc = SafetyEventDocSchema.parse({
    ...event,
    id: `se_${randomUUID().replace(/-/g, "").slice(0, 14)}`,
    createdAt: new Date().toISOString(),
  });

  logInfo("db.recordSafetyEvent", {
    personIdLen: personId.length,
    level: eventDoc.level,
    action: eventDoc.action,
  });

  if (!isFirebaseAdminConfigured() && process.env.NODE_ENV !== "production") {
    const store = readLocalStore();
    if (store.persons[personId]) {
      store.persons[personId].safetyEvents[eventDoc.id] = eventDoc;
      writeLocalStore(store);
    }
    return eventDoc;
  }

  await getAdminFirestore()
    .collection("persons")
    .doc(personId)
    .collection("safetyEvents")
    .doc(eventDoc.id)
    .set(eventDoc);

  return eventDoc;
}
