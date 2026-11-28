/**
 * Client-side Language Context Provider for Spiral (`src/components/LanguageProvider.tsx`).
 *
 * Feature overview & use cases:
 * - Provides reactive `language` (`en`, `hinglish`, `hi`, `ta`), `setLanguage`, and `t`
 *   (`TranslationDictionary`) to every screen and component via `useI18n()`.
 * - Persists language selection locally in `localStorage` (`spiral_language`), updates `<html lang>`,
 *   hydrates from `GET /api/settings` when an authenticated session exists, and syncs updates
 *   to Firestore via `PATCH /api/settings`.
 */

"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { authorizedFetch, getExistingAuthToken } from "@/lib/firebase/client";
import {
  getLanguageMeta,
  getTranslations,
  normalizeLanguage,
  type SupportedLanguage,
  type TranslationDictionary,
} from "@/lib/i18n";
import { logError, logInfo } from "@/lib/log";

const LANGUAGE_STORAGE_KEY = "spiral_language";
export const LANGUAGE_CHANGED_EVENT = "spiral:language-changed";

interface LanguageContextValue {
  language: SupportedLanguage;
  t: TranslationDictionary;
  savingLanguage: boolean;
  setLanguage: (next: SupportedLanguage) => Promise<void>;
  syncLanguageFromServer: (serverLang?: string | null) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * Provides Spiral's active language and translation dictionary across the app tree.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>("en");
  const [savingLanguage, setSavingLanguage] = useState(false);

  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
        : null;
    if (stored) {
      const normalized = normalizeLanguage(stored);
      setLanguageState(normalized);
      document.documentElement.lang = getLanguageMeta(normalized).htmlLang;
    }

    const hydrateFromServer = async (): Promise<void> => {
      try {
        const token = await getExistingAuthToken();
        if (!token) {
          return;
        }
        const res = await authorizedFetch("/api/settings", { method: "GET" });
        if (res.ok) {
          const data = (await res.json()) as { language?: string };
          if (data.language && !stored) {
            const serverNormalized = normalizeLanguage(data.language);
            setLanguageState(serverNormalized);
            window.localStorage.setItem(LANGUAGE_STORAGE_KEY, serverNormalized);
            document.documentElement.lang =
              getLanguageMeta(serverNormalized).htmlLang;
          }
        }
      } catch (error: unknown) {
        logError("LanguageProvider.hydrateFromServer.failed", error);
      }
    };

    void hydrateFromServer();
  }, []);

  /**
   * Aligns local language state with an authoritative language returned by a journey API call.
   */
  const syncLanguageFromServer = useCallback((serverLang?: string | null) => {
    if (!serverLang) {
      return;
    }
    const normalized = normalizeLanguage(serverLang);
    setLanguageState(normalized);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
      document.documentElement.lang = getLanguageMeta(normalized).htmlLang;
    }
  }, []);

  /**
   * Updates the active language locally and persists it to `/api/settings` when signed in.
   */
  const setLanguage = useCallback(async (next: SupportedLanguage) => {
    logInfo("LanguageProvider.setLanguage", { language: next });
    setLanguageState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
      document.documentElement.lang = getLanguageMeta(next).htmlLang;
    }

    try {
      const token = await getExistingAuthToken();
      if (token) {
        setSavingLanguage(true);
        await authorizedFetch("/api/settings", {
          method: "PATCH",
          body: JSON.stringify({ language: next }),
        });
      }
    } catch (error: unknown) {
      logError("LanguageProvider.setLanguage.persistFailed", error);
    } finally {
      setSavingLanguage(false);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(LANGUAGE_CHANGED_EVENT, { detail: { language: next } }),
        );
      }
    }
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      t: getTranslations(language),
      savingLanguage,
      setLanguage,
      syncLanguageFromServer,
    }),
    [language, savingLanguage, setLanguage, syncLanguageFromServer],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

/**
 * Returns the active language (`language`), translation dictionary (`t`), and `setLanguage` setter.
 */
export function useI18n(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useI18n() must be used inside <LanguageProvider>.");
  }
  return ctx;
}
