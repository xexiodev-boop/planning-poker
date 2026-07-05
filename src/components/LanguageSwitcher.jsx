import { useLingui } from "@lingui/react/macro";
import { LOCALES, switchLocale } from "../lib/i18n.js";

export function LanguageSwitcher() {
  const { t, i18n } = useLingui();
  return (
    <label className="language-switcher">
      <span aria-hidden="true">🌐</span>
      <select
        aria-label={t`Language`}
        onChange={(event) => switchLocale(event.target.value)}
        value={i18n.locale}
      >
        {LOCALES.map((locale) => (
          <option key={locale.code} value={locale.code}>
            {locale.label}
          </option>
        ))}
      </select>
    </label>
  );
}
