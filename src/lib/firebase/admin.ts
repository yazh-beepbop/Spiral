/**
 * Server-only Firebase Admin / Cloud Firestore & Auth verification (`src/lib/firebase/admin.ts`).
 *
 * Feature overview & use cases:
 * - Initializes Cloud Firestore via `firebase-admin` using `FIREBASE_SERVICE_ACCOUNT` JSON
 *   locally or Application Default Credentials automatically on Google Cloud Run (`K_SERVICE` /
 *   `GOOGLE_CLOUD_PROJECT`).
 * - Verifies `Authorization: Bearer <token>` on every API request:
 *   1. Server-minted HMAC-SHA256 tokens (`sr1.<personId>.<sig>`) for Cloud Run / standalone deployments
 *   2. Firebase Auth ID tokens when Firebase Web Auth is configured
 *   3. Local test tokens (`dev_uid_*`) in non-production automated tests
 */

import { createHmac, timingSafeEqual } from "crypto";
import {
  type App,
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from "firebase-admin/app";
import { type Auth, getAuth } from "firebase-admin/auth";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";
import { getServerConfig } from "@/lib/config";
import { logError, logInfo, logWarn } from "@/lib/log";

let cachedAdminApp: App | null = null;

/**
 * Determines whether Cloud Firestore credentials (`FIREBASE_SERVICE_ACCOUNT`, Cloud Run `K_SERVICE`,
 * `GOOGLE_CLOUD_PROJECT` with ADC, or `GOOGLE_APPLICATION_CREDENTIALS`) are available.
 */
export function isFirebaseAdminConfigured(): boolean {
  const config = getServerConfig();
  return Boolean(
    config.firebaseServiceAccount ||
      process.env.K_SERVICE ||
      process.env.FIREBASE_CONFIG ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
  );
}

/**
 * Initializes and returns the singleton Admin `App` instance on the server.
 */
export function getFirebaseAdminApp(): App {
  if (typeof window !== "undefined") {
    throw new Error("Server Admin SDK must never run on the client.");
  }
  if (cachedAdminApp) {
    return cachedAdminApp;
  }
  const existing = getApps();
  if (existing.length > 0) {
    cachedAdminApp = existing[0];
    return cachedAdminApp;
  }

  const config = getServerConfig();
  if (config.firebaseServiceAccount) {
    const parsed = JSON.parse(config.firebaseServiceAccount) as ServiceAccount;
    cachedAdminApp = initializeApp({
      credential: cert(parsed),
      ...(config.googleCloudProject
        ? { projectId: config.googleCloudProject }
        : {}),
    });
    logInfo("firebase.admin.initializedWithServiceAccount");
    return cachedAdminApp;
  }

  cachedAdminApp = initializeApp({
    credential: applicationDefault(),
    ...(config.googleCloudProject
      ? { projectId: config.googleCloudProject }
      : {}),
  });
  logInfo("firebase.admin.initializedWithADC");
  return cachedAdminApp;
}

/**
 * Returns the server-side Cloud `Firestore` client.
 */
export function getAdminFirestore(): Firestore {
  return getFirestore(getFirebaseAdminApp());
}

/**
 * Returns the server-side Firebase Admin `Auth` client.
 */
export function getAdminAuth(): Auth {
  return getAuth(getFirebaseAdminApp());
}

/**
 * Derives the server-only HMAC signing key for Cloud Run anonymous session tokens.
 */
function getSessionSigningSecret(): string {
  const config = getServerConfig();
  const explicitSecret = process.env.SESSION_SIGNING_SECRET?.trim();
  if (explicitSecret) {
    return explicitSecret;
  }
  if (config.geminiApiKey) {
    return `spiral-hmac:${config.geminiApiKey}`;
  }
  if (process.env.NODE_ENV !== "production") {
    return "spiral-local-dev-hmac-secret";
  }
  throw new Error(
    "Set SESSION_SIGNING_SECRET or GEMINI_API_KEY on the server to sign anonymous sessions.",
  );
}

/**
 * Mints a tamper-proof `sr1.<personId>.<hmacHex>` bearer token on the server.
 */
export function mintSignedPersonToken(personId: string): string {
  if (!/^p_[a-zA-Z0-9_-]{8,64}$/.test(personId)) {
    throw new Error("Invalid personId format for token minting.");
  }
  const sig = createHmac("sha256", getSessionSigningSecret())
    .update(personId)
    .digest("hex");
  return `sr1.${personId}.${sig}`;
}

/**
 * Verifies an `sr1.<personId>.<hmacHex>` bearer token in constant time, returning `personId` or `null`.
 */
function verifySignedPersonToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "sr1") {
    return null;
  }
  const [, personId, providedHex] = parts;
  if (
    !/^p_[a-zA-Z0-9_-]{8,64}$/.test(personId) ||
    !/^[a-f0-9]{64}$/.test(providedHex)
  ) {
    return null;
  }
  const expectedHex = createHmac("sha256", getSessionSigningSecret())
    .update(personId)
    .digest("hex");
  const a = Buffer.from(providedHex, "hex");
  const b = Buffer.from(expectedHex, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }
  return personId;
}

export class UnauthorizedError extends Error {
  public readonly statusCode = 401;

  constructor(message = "Missing or invalid authentication token.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Extracts and verifies the caller's `personId` (`uid`) from `Authorization: Bearer <token>`.
 */
export async function verifyRequestPersonId(
  request: NextRequest,
): Promise<string> {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    throw new UnauthorizedError("Authorization Bearer header is required.");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    throw new UnauthorizedError("Empty Bearer token.");
  }

  if (token.startsWith("sr1.")) {
    const verifiedPersonId = verifySignedPersonToken(token);
    if (!verifiedPersonId) {
      throw new UnauthorizedError("Invalid or forged session signature.");
    }
    return verifiedPersonId;
  }

  if (!isFirebaseAdminConfigured() && process.env.NODE_ENV !== "production") {
    if (/^dev_uid_[a-zA-Z0-9_-]{8,64}$/.test(token)) {
      logWarn(
        "firebase.admin.localDevTokenAccepted",
        "Accepted local test UID token in non-production",
        { uidPrefix: token.slice(0, 12) },
      );
      return token;
    }
    throw new UnauthorizedError("Invalid local development token.");
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    logInfo("firebase.admin.tokenVerified", {
      uidLength: decoded.uid.length,
    });
    return decoded.uid;
  } catch (error: unknown) {
    logError("firebase.admin.verifyTokenFailed", error);
    throw new UnauthorizedError("Invalid or expired authentication token.");
  }
}
