"use client";

import { t } from "@/lib/i18n/store";
export function SourceLink() {
  const sourceUrl = process.env.NEXT_PUBLIC_SOURCE_URL;
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return null;
  return (
    <a
      className="text-button"
      href={sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      {t("Codice sorgente · AGPL-3.0")}
    </a>
  );
}
