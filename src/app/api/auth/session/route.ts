/**
 * Server-signed anonymous session endpoint for Cloud Run deployments (`src/app/api/auth/session/route.ts`).
 *
 * Feature overview & use cases:
 * - When Spiral runs on Google Cloud Run without Firebase Web Auth client keys configured
 *   (`NEXT_PUBLIC_FIREBASE_API_KEY` unset), mints a cryptographically signed `sr1.<uid>.<hmac>`
 *   anonymous session token on the server so each visitor gets a permanent, tamper-proof
 *   `personId` in Firestore without requiring Firebase Console setup.
 * - Verified in constant time by `verifyRequestPersonId` in `src/lib/firebase/admin.ts`.
 */

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { mintSignedPersonToken } from "@/lib/firebase/admin";
import { logError, logInfo } from "@/lib/log";

/**
 * Issues a fresh HMAC-signed anonymous `personId` bearer token (`POST /api/auth/session`).
 */
export async function POST(): Promise<NextResponse> {
  logInfo("api.auth.session.POST");
  try {
    const personId = `p_${randomUUID().replace(/-/g, "")}`;
    const token = mintSignedPersonToken(personId);
    return NextResponse.json({ token });
  } catch (error: unknown) {
    logError("api.auth.session.error", error);
    return NextResponse.json(
      { error: "Unable to initialize anonymous session." },
      { status: 500 },
    );
  }
}
