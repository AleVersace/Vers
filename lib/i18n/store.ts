import {
  translate,
  translateError,
  type Language,
  type TranslationValues,
} from "./translate.ts";
export const LANGUAGE_STORAGE_KEY = "vers:language";
let language: Language = "it";
const listeners = new Set<() => void>();
export const getLanguage = (): Language =>
  typeof window === "undefined" ? "it" : language;
export const getServerLanguage = (): Language => "it";
export const subscribeLanguage = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function setLanguage(next: Language, persist = true) {
  if (next !== "it" && next !== "en") return;
  if (persist && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      /* Language still changes when storage is blocked. */
    }
  }
  if (next === language) return;
  language = next;
  listeners.forEach((listener) => listener());
}
export const t = (text: string, values?: TranslationValues) =>
  translate(text, getLanguage(), values);
export const errorText = (text: string) => translateError(text, getLanguage());
export const uiLocale = (language: Language = getLanguage()) =>
  language === "en" ? "en-US" : "it-IT";
