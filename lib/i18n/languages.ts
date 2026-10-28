export const SUPPORTED_LANGUAGES = ["it", "en", "fr", "de"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const languageDetails = {
  it: { name: "Italiano", label: "ITA", locale: "it-IT", openGraphLocale: "it_IT" },
  en: { name: "English", label: "ENG", locale: "en-US", openGraphLocale: "en_US" },
  fr: { name: "Français", label: "FRA", locale: "fr-FR", openGraphLocale: "fr_FR" },
  de: { name: "Deutsch", label: "DEU", locale: "de-DE", openGraphLocale: "de_DE" },
} satisfies Record<Language, {
  name: string;
  label: string;
  locale: string;
  openGraphLocale: string;
}>;

export const isLanguage = (value: unknown): value is Language =>
  SUPPORTED_LANGUAGES.some((language) => language === value);
