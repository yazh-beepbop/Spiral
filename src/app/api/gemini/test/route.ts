/**
 * Server diagnostic route for T1 Gemini client verification (`src/app/api/gemini/test/route.ts`).
 *
 * Feature overview & use cases:
 * - Verifies that both the `fast` model and the `deep` model configured in `src/lib/config.ts`
 *   respond through the Interactions API wrapper (`src/lib/gemini/client.ts`) and emit
 *   structured `genai_call` log entries (`ROADMAP.md` T1).
 * - Restricted to non-production or explicit `DEMO_MODE=true` so public visitors cannot
 *   trigger arbitrary model calls in production.
 */

import { NextResponse } from "next/server";
import { getServerConfig } from "@/lib/config";
import { generateInteraction } from "@/lib/gemini/client";
import { logError, logInfo } from "@/lib/log";

/**
 * Executes one short round-trip against the fast model and one against the deep model,
 * returning replies and metadata without exposing model IDs to untrusted clients in prod.
 */
export async function GET(): Promise<NextResponse> {
  logInfo("api.gemini.test.GET");
  const config = getServerConfig();

  if (process.env.NODE_ENV === "production" && !config.demoMode) {
    return NextResponse.json(
      { error: "Test route disabled in production." },
      { status: 403 },
    );
  }

  try {
    const [fastReply, deepReply] = await Promise.all([
      generateInteraction({
        caller: "api.gemini.test.fast",
        tier: "fast",
        thinkingLevel: "low",
        prompt: "Reply in one calm sentence under 12 words: confirm fast flow is live.",
      }),
      generateInteraction({
        caller: "api.gemini.test.deep",
        tier: "deep",
        thinkingLevel: "medium",
        prompt: "Reply in one calm reflective question under 15 words.",
      }),
    ]);

    return NextResponse.json({
      ok: true,
      fast: {
        interactionId: fastReply.interactionId,
        reply: fastReply.text,
        fallbackUsed: fastReply.fallbackUsed,
        attempts: fastReply.attempts,
        durationMs: fastReply.durationMs,
      },
      deep: {
        interactionId: deepReply.interactionId,
        reply: deepReply.text,
        fallbackUsed: deepReply.fallbackUsed,
        attempts: deepReply.attempts,
        durationMs: deepReply.durationMs,
      },
    });
  } catch (error: unknown) {
    logError("api.gemini.test.failed", error);
    const message =
      error instanceof Error ? error.message : "Gemini test route failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
