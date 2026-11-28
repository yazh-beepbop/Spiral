/**
 * Journey start server route handler (`src/app/api/journey/start/route.ts`).
 *
 * Feature overview & use cases:
 * - Verifies the visitor's Firebase ID token (`Authorization: Bearer <token>`).
 * - Enforces the mandatory 18+ age attestation (`CONSTRAINTS.md`: "18+ only. No journey starts
 *   without the age attestation.").
 * - Creates or updates `persons/{personId}` as the lifetime root record, and either returns
 *   an existing active/paused journey or initializes a fresh Career Fog journey (`currentDay: 1`,
 *   `idkMode: "standard"`).
 */

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createCareerFogJourney,
  getLatestJourney,
  updateJourney,
  upsertPerson,
} from "@/lib/db/repository";
import { SupportedLanguageSchema } from "@/lib/db/schema";
import {
  UnauthorizedError,
  verifyRequestPersonId,
} from "@/lib/firebase/admin";
import { logError, logInfo } from "@/lib/log";

const StartJourneyBodySchema = z.object({
  ageAttested18: z.literal(true, {
    errorMap: () => ({
      message: "You must confirm that you are 18 or older to start a Spiral.",
    }),
  }),
  entryPoint: z.literal("career_fog").default("career_fog"),
  language: SupportedLanguageSchema.optional(),
  country: z.string().min(2).max(8).optional(),
  forceNew: z.boolean().optional(),
});

/**
 * Handles `POST /api/journey/start` to attest 18+ consent, ensure the person record,
 * and start or resume a Career Fog journey.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  logInfo("api.journey.start.POST");
  try {
    const personId = await verifyRequestPersonId(request);
    const rawBody: unknown = await request.json();
    const parsed = StartJourneyBodySchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            "18+ age attestation is required.",
        },
        { status: 400 },
      );
    }

    const personDoc = await upsertPerson(personId, {
      country: parsed.data.country ?? "IN",
      ...(parsed.data.language ? { language: parsed.data.language } : {}),
    });
    const chosenLanguage = parsed.data.language ?? personDoc.language ?? "en";

    if (!parsed.data.forceNew) {
      const existing = await getLatestJourney(personId);
      if (existing && (existing.status === "active" || existing.status === "paused")) {
        const syncedJourney =
          parsed.data.language && existing.language !== parsed.data.language
            ? await updateJourney(personId, existing.id, {
                language: parsed.data.language,
              })
            : existing;
        logInfo("api.journey.start.resumedExisting", {
          journeyId: syncedJourney.id,
          status: syncedJourney.status,
          currentDay: syncedJourney.currentDay,
          language: syncedJourney.language,
        });
        return NextResponse.json({
          journeyId: syncedJourney.id,
          status: syncedJourney.status,
          currentDay: syncedJourney.currentDay,
          language: syncedJourney.language,
          resumed: true,
        });
      }
    }

    const { journey } = await createCareerFogJourney(personId, chosenLanguage);
    logInfo("api.journey.start.created", {
      journeyId: journey.id,
      entryPoint: journey.entryPoint,
      language: journey.language,
    });

    return NextResponse.json({
      journeyId: journey.id,
      status: journey.status,
      currentDay: journey.currentDay,
      language: journey.language,
      resumed: false,
    });
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    logError("api.journey.start.error", error);
    return NextResponse.json(
      { error: "Unable to start your Spiral right now. Please try again." },
      { status: 500 },
    );
  }
}
