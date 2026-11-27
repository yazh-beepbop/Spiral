/**
 * Resume paused journey server route (`src/app/api/journey/resume/route.ts`).
 *
 * Feature overview & use cases:
 * - Allows a person whose journey was paused after an `acute` safety check to resume
 *   when they feel ready (`CONSTRAINTS.md`: "keep the journey resumable").
 * - Note: the acute answer itself remains permanently `excludedFromAI: true` in Firestore
 *   and is never passed to Bridges, adaptive questions, pattern mapping, or synthesis.
 */

import { type NextRequest, NextResponse } from "next/server";
import { getLatestJourney, updateJourney } from "@/lib/db/repository";
import {
  UnauthorizedError,
  verifyRequestPersonId,
} from "@/lib/firebase/admin";
import { logError, logInfo } from "@/lib/log";

/**
 * Handles `POST /api/journey/resume` to transition a `paused` journey back to `active`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  logInfo("api.journey.resume.POST");
  try {
    const personId = await verifyRequestPersonId(request);
    const journey = await getLatestJourney(personId);

    if (!journey) {
      return NextResponse.json(
        { error: "No saved journey found." },
        { status: 404 },
      );
    }

    if (journey.status === "paused") {
      await updateJourney(personId, journey.id, { status: "active" });
      logInfo("api.journey.resume.resumed", {
        journeyId: journey.id,
        currentDay: journey.currentDay,
      });
    }

    return NextResponse.json({
      ok: true,
      journeyId: journey.id,
      currentDay: journey.currentDay,
    });
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    logError("api.journey.resume.error", error);
    return NextResponse.json(
      { error: "Unable to resume your Spiral right now." },
      { status: 500 },
    );
  }
}
