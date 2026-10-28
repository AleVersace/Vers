"use client";

import { useEffect, useSyncExternalStore } from "react";
import { isLanguage, languageDetails, SUPPORTED_LANGUAGES } from "@/lib/i18n/languages";
import {
  getLanguage,
  getServerLanguage,
  subscribeLanguage,
  setLanguage,
  LANGUAGE_STORAGE_KEY,
  t,
} from "@/lib/i18n/store";

export const useLanguage = () =>
  useSyncExternalStore(subscribeLanguage, getLanguage, getServerLanguage);

export function LanguageEffects() {
  const language = useLanguage();
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (isLanguage(saved)) setLanguage(saved, false);
    } catch {
      /* Italian is the default when storage is unavailable. */
    }
    const sync = (event: StorageEvent) => {
      if (
        event.key === LANGUAGE_STORAGE_KEY &&
        isLanguage(event.newValue)
      )
        setLanguage(event.newValue, false);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    const title = t("Vers - Il tavolo virtuale per le tue avventure");
    const description = t(
      "Vers è il tavolo virtuale per le tue campagne di gioco di ruolo, con mappe, scene, token, nebbia di guerra, iniziativa, macro e tiri condivisi.",
    );
    const updateMetadata = () => {
      if (document.title !== title) document.title = title;
      const update = (selectors: string[], content: string) => {
        for (const selector of selectors) {
          document.querySelectorAll(selector).forEach((element) => {
            if (element.getAttribute("content") !== content)
              element.setAttribute("content", content);
          });
        }
      };
      update(
        [
          'meta[name="description"]',
          'meta[property="og:description"]',
          'meta[name="twitter:description"]',
        ],
        description,
      );
      update(
        ['meta[property="og:title"]', 'meta[name="twitter:title"]'],
        title,
      );
      update(
        ['meta[property="og:locale"]'],
        languageDetails[language].openGraphLocale,
      );
    };
    updateMetadata();
    // Next can finish streaming its Italian metadata after hydration. Keep the
    // browser's title and descriptions aligned with the saved UI language.
    const observer = new MutationObserver(updateMetadata);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["content"],
    });
    return () => observer.disconnect();
  }, [language]);
  return null;
}

export function LanguageToggle() {
  const language = useLanguage();
  return (
    <div
      className="language-toggle"
      role="group"
      aria-label={t("Scegli la lingua")}
    >
      <div className="language-options">
        {SUPPORTED_LANGUAGES.map((option) => (
          <button
            key={option}
            type="button"
            lang={option}
            aria-label={languageDetails[option].name}
            aria-pressed={language === option}
            onClick={() => setLanguage(option)}
          >
            {languageDetails[option].label}
          </button>
        ))}
      </div>
      <select
        className="language-select"
        aria-label={t("Scegli la lingua")}
        value={language}
        onChange={(event) => {
          if (isLanguage(event.target.value)) setLanguage(event.target.value);
        }}
      >
        {SUPPORTED_LANGUAGES.map((option) => (
          <option key={option} value={option} lang={option}>
            {languageDetails[option].name}
          </option>
        ))}
      </select>
    </div>
  );
}
