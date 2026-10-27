import { english, templates, additional } from "./messages.ts";

export type Language = "it" | "en";
export type TranslationValues = Record<string, string | number>;
export const catalog: Record<string, string> = Object.assign(
  Object.create(null),
  english,
  templates,
  additional,
);
const italian: Record<string, string> = {
  Rolls: "Tiri",
  Logout: "Esci",
  "Damage macro": "Macro danni",
};
const escapePattern = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = Object.entries(templates)
  .map(([source, target]) => {
    const keys = [...source.matchAll(/\{(p\d+)\}/g)].map((match) => match[1]);
    const parts = source.split(/\{p\d+\}/g);
    return {
      target,
      keys,
      pattern: new RegExp(
        "^" + parts.map(escapePattern).join("([\\s\\S]*?)") + "$",
      ),
      specificity: parts.join("").length,
    };
  })
  .sort((a, b) => b.specificity - a.specificity);

export function translate(
  text: string,
  language: Language,
  values?: TranslationValues,
): string {
  let result =
    language === "en"
      ? catalog[text]
      : Object.hasOwn(italian, text)
        ? italian[text]
        : text;
  if (result === undefined) {
    const trimmed = text.trim();
    const plain = catalog[trimmed];
    if (plain !== undefined)
      result =
        text.slice(0, text.indexOf(trimmed)) +
        plain +
        text.slice(text.indexOf(trimmed) + trimmed.length);
    else {
      for (const entry of patterns) {
        const match = entry.pattern.exec(text);
        if (!match) continue;
        result = entry.target.replace(
          /\{(p\d+)\}/g,
          (_, key: string) => match[entry.keys.indexOf(key) + 1],
        );
        break;
      }
      result ??= text;
    }
  }
  return values
    ? result.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
        String(values[key] ?? placeholder),
      )
    : result;
}

export function translateError(message: string, language: Language): string {
  const providerErrors: Record<string, string> = {
    "auth/popup-closed-by-user": "Accesso annullato. Riprova quando vuoi.",
    "auth/cancelled-popup-request": "Accesso annullato. Riprova quando vuoi.",
    "auth/popup-blocked": "Consenti il popup per accedere con Google.",
    "auth/network-request-failed":
      "Connessione di rete non disponibile. Riprova.",
    "auth/unauthorized-domain":
      "Questo dominio non è autorizzato per l’accesso Google.",
  };
  for (const [code, copy] of Object.entries(providerErrors)) {
    if (message.includes(code)) return translate(copy, language);
  }
  const known =
    catalog[message] !== undefined ||
    patterns.some((entry) => entry.pattern.test(message));
  if (language === "it" && known) return message;
  const translated = translate(message, language);
  if (translated !== message || known) return translated;
  // Provider diagnostics may include tokens, SQL or user data. Keep the UI
  // message localizable; the original diagnostic belongs in private logs.
  return translate("Operazione non riuscita. Riprova.", language);
}
