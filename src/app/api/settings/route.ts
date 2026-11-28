/**
 * Person & Journey language settings API route (`src/app/api/settings/route.ts`).
 *
 * Feature overview & use cases:
 * - `GET /api/settings`: returns the authenticated visitor's saved `language` (`en`,
 *   `hinglish`, `hi`, `ta`), prioritizing the active journey's language or root person record.
 * - `PATCH /api/settings`: updates `language` on `persons/{personId}` (if attested) and on
 *   the active/latest journey so subsequent questions, Adaptive L3 prompts, and Bridges run
 *   in the newly chosen language immediately.
 */

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getLatestJourney,
  getPerson,
  updateJourney,
  upsertPerson,
} from "@/lib/db/repository";
import { SupportedLanguageSchema } from "@/lib/db/schema";
import {
  UnauthorizedError,
  verifyRequestPersonId,
} from "@/lib/firebase/admin";
import { logError, logInfo } from "@/lib/log";

const PatchSettingsSchema = z.object({
  language: SupportedLanguageSchema,
});

/**
 * Reads the authenticated user's persisted language preference (`GET /api/settings`).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  logInfo("api.settings.GET");
  try {
    const personId = await verifyRequestPersonId(request);
    const [person, journey] = await Promise.all([
      getPerson(personId),
      getLatestJourney(personId),
    ]);

    return NextResponse.json({
      language: journey?.language ?? person?.language ?? "en",
    });
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    logError("api.settings.GET.error", error);
    return NextResponse.json({ language: "en" });
  }
}

/**
 * Updates the authenticated user's language preference (`PATCH /api/settings`).
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  logInfo("api.settings.PATCH");
  try {
    const personId = await verifyRequestPersonId(request);
    const rawBody: unknown = await request.json();
    const parsed = PatchSettingsSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid language selection." },
        { status: 400 },
      );
    }

    const { language } = parsed.data;
    const [person, journey] = await Promise.all([
      getPerson(personId),
      getLatestJourney(personId),
    ]);

    if (person) {
      await upsertPerson(personId, { language });
    }
    if (journey && journey.status !== "completed") {
      await updateJourney(personId, journey.id, { language });
    }

    return NextResponse.json({ ok: true, language });
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    logError("api.settings.PATCH.error", error);
    return NextResponse.json(
      { error: "Unable to update language settings." },
      { status: 500 },
    );
  }
}
