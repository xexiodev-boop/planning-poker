import { useLingui } from "@lingui/react/macro";
import { LOCALES, switchLocale } from "../lib/i18n.js";

export function LanguageSwitcher({ iconOnly = false }) {
  const { t, i18n } = useLingui();
  return (
    <label className={`language-switcher${iconOnly ? " icon-only" : ""}`} title={t`Language`}>
      <svg
        className="language-switcher-globe"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
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
