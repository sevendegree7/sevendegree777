"use client";

import { setLanguage, useLanguage, useTranslate } from "@/lib/i18n/use-language";
import type { ThemePreference } from "@/lib/ui/preferences";
import { setThemePreference, useThemePreference } from "@/lib/ui/use-theme";

const THEMES: ThemePreference[] = ["light", "dark", "system"];

// the two switches, shared by the account menu on the staff screens and the
// gear on the sign in page - where there is no account to hang them off yet
export function PreferencePanel({
  showLanguage,
}: {
  showLanguage: boolean;
}) {
  const theme = useThemePreference();
  const language = useLanguage();
  const { t } = useTranslate();

  return (
    <>
      <div className="border-b border-line px-4 py-3">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted">
          {t("account.appearance")}
        </p>
        <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-sunken p-1">
          {THEMES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setThemePreference(option)}
              aria-pressed={theme === option}
              className={`rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                theme === option
                  ? "bg-accent-surface text-accent-ink"
                  : "text-muted hover:text-ink"
              }`}
            >
              {t(`account.theme.${option}`)}
            </button>
          ))}
        </div>
      </div>

      {showLanguage ? (
        <div className="border-b border-line px-4 py-3">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted">
            {t("account.language")}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-sunken p-1">
            <button
              type="button"
              onClick={() => setLanguage("en")}
              aria-pressed={language === "en"}
              className={`rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                language === "en"
                  ? "bg-accent-surface text-accent-ink"
                  : "text-muted hover:text-ink"
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setLanguage("ar")}
              aria-pressed={language === "ar"}
              className={`rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                language === "ar"
                  ? "bg-accent-surface text-accent-ink"
                  : "text-muted hover:text-ink"
              }`}
            >
              العربية
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
