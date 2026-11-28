/**
 * Demo Journey Seeder API route (`src/app/api/demo/seed/route.ts`).
 *
 * Feature overview & use cases:
 * - `GET /api/demo/seed`: reports `{ demoMode: boolean }` from `src/lib/config.ts` so `/start`
 *   knows whether to offer the one-click `"Load Day 5 Demo Journey"` shortcut.
 * - `POST /api/demo/seed`: guarded strictly by `config.demoMode === true` and `ageAttested18 === true`;
 *   populates Days 1–4 of Career Fog under the caller's `personId` so judges can experience
 *   Day 5 -> Bridge -> Synthesis live without waiting 40 hours (`DECISIONS.md` S8).
 */

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerConfig } from "@/lib/config";
import { SupportedLanguageSchema } from "@/lib/db/schema";
import { seedCareerFogDemoJourney } from "@/lib/demo/seed";
import {
  UnauthorizedError,
  verifyRequestPersonId,
} from "@/lib/firebase/admin";
import { logError, logInfo } from "@/lib/log";

const SeedRequestSchema = z.object({
  ageAttested18: z.literal(true),
  includeDay5Answers: z.boolean().optional(),
  language: SupportedLanguageSchema.optional(),
});

/**
 * Returns whether sprint `DEMO_MODE` is enabled on the server.
 */
export async function GET(): Promise<NextResponse> {
  const { demoMode } = getServerConfig();
  return NextResponse.json({ demoMode });
}

/**
 * Seeds a Days 1–4 completed Career Fog journey for the authenticated visitor when `DEMO_MODE=true`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  logInfo("api.demo.seed.POST");
  const { demoMode } = getServerConfig();
  if (!demoMode) {
    return NextResponse.json(
      { error: "Demo seeding is disabled when DEMO_MODE is false." },
      { status: 403 },
    );
  }

  try {
    const personId = await verifyRequestPersonId(request);
    const rawBody: unknown = await request.json();
    const parsed = SeedRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "18+ age attestation is required." },
        { status: 400 },
      );
    }

    const seeded = await seedCareerFogDemoJourney(personId, {
      includeDay5Answers: parsed.data.includeDay5Answers,
      language: parsed.data.language,
    });

    return NextResponse.json({
      ok: true,
      journeyId: seeded.journeyId,
      currentDay: seeded.currentDay,
    });
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    logError("api.demo.seed.error", error);
    return NextResponse.json(
      { error: "Unable to seed demo journey." },
      { status: 500 },
    );
  }
}
