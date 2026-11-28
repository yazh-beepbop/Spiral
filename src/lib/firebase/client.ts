/**
 * Browser-side authentication client (`src/lib/firebase/client.ts`).
 *
 * Feature overview & use cases:
 * - Holds ONLY the user's session/ID token on the client (`ARCHITECTURE.md`:
 *   "The client holds only the Firebase ID token. No API keys, no model names.").
 * - Uses Firebase Anonymous Auth when `NEXT_PUBLIC_FIREBASE_*` is configured, OR
 *   automatically requests a server-signed HMAC session token (`POST /api/auth/session`)
 *   when deployed standalone on Google Cloud Run without Firebase Web client config.
 */

"use client";

import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import {
  type Auth,
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  type User,
} from "firebase/auth";
import { getPublicFirebaseConfig } from "@/lib/config";
import { logInfo } from "@/lib/log";

const SIGNED_SESSION_STORAGE_KEY = "spiral_session_token";

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;

/**
 * Checks whether Firebase Web SDK public environment variables are configured.
 */
export function isFirebaseClientConfigured(): boolean {
  const cfg = getPublicFirebaseConfig();
  return Boolean(cfg.apiKey && cfg.projectId);
}

/**
 * Initializes and memoizes the Firebase Auth instance in the browser.
 */
function getClientAuth(): Auth {
  if (cachedAuth) {
    return cachedAuth;
  }
  const cfg = getPublicFirebaseConfig();
  const existing = getApps();
  cachedApp =
    existing.length > 0
      ? existing[0]
      : initializeApp({
          apiKey: cfg.apiKey,
          authDomain: cfg.authDomain,
          projectId: cfg.projectId,
          appId: cfg.appId,
        });
  cachedAuth = getAuth(cachedApp);
  return cachedAuth;
}

/**
 * Waits for Firebase Auth to restore any existing session before deciding whether to sign in.
 */
function waitForInitialUser(auth: Auth): Promise<User | null> {
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

/**
 * Returns the current signed-in user's token if a session already exists, or `null`
 * if the visitor has not yet started a Spiral.
 */
export async function getExistingAuthToken(): Promise<string | null> {
  logInfo("firebase.client.getExistingAuthToken");
  if (!isFirebaseClientConfigured()) {
    if (typeof window === "undefined") {
      return null;
    }
    const saved = window.localStorage.getItem(SIGNED_SESSION_STORAGE_KEY);
    return saved && saved.startsWith("sr1.") ? saved : null;
  }

  const auth = getClientAuth();
  const user = await waitForInitialUser(auth);
  if (!user) {
    return null;
  }
  return user.getIdToken();
}

/**
 * Ensures the visitor has a valid anonymous session token (via Firebase Auth or
 * Cloud Run's `/api/auth/session` HMAC endpoint) and returns the bearer token.
 */
export async function ensureAnonymousAuthToken(): Promise<string> {
  logInfo("firebase.client.ensureAnonymousAuthToken");
  if (!isFirebaseClientConfigured()) {
    const existing = await getExistingAuthToken();
    if (existing) {
      return existing;
    }
    const res = await fetch("/api/auth/session", {
      method: "POST",
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error("Could not initialize anonymous session.");
    }
    const data = (await res.json()) as { token?: string };
    if (!data.token) {
      throw new Error("Invalid session token response.");
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SIGNED_SESSION_STORAGE_KEY, data.token);
    }
    return data.token;
  }

  const auth = getClientAuth();
  const existingUser = await waitForInitialUser(auth);
  if (existingUser) {
    return existingUser.getIdToken();
  }

  const credential = await signInAnonymously(auth);
  logInfo("firebase.client.signedInAnonymously", {
    uidLength: credential.user.uid.length,
  });
  return credential.user.getIdToken();
}

/**
 * Calls a Spiral server route handler with `Authorization: Bearer <token>`.
 */
export async function authorizedFetch(
  path: string,
  init?: RequestInit & { createSessionIfMissing?: boolean },
): Promise<Response> {
  const token = init?.createSessionIfMissing
    ? await ensureAnonymousAuthToken()
    : await getExistingAuthToken();

  if (!token) {
    throw new Error("AUTH_REQUIRED");
  }

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (
    init?.body &&
    !(typeof FormData !== "undefined" && init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(path, {
    ...init,
    headers,
    cache: "no-store",
  });
}
