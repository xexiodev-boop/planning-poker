import { i18n } from "@lingui/core";

export const LOCALES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
];

const SUPPORTED = LOCALES.map((locale) => locale.code);
const STORAGE_KEY = "pointtaken.locale";

// Explicit choice wins; otherwise the browser's preferred languages decide.
export function detectLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED.includes(stored)) return stored;
  } catch {
    // Storage unavailable (private mode / blocked) - detection still works.
  }
  const preferred = [navigator.language, ...(navigator.languages ?? [])];
  for (const tag of preferred) {
    const base = tag?.toLowerCase().split("-")[0];
    if (SUPPORTED.includes(base)) return base;
  }
  return "en";
}

export async function activateLocale(locale) {
  const { messages } = await import(`../locales/${locale}.po`);
  i18n.load(locale, messages);
  i18n.activate(locale);
  document.documentElement.lang = locale;
}

// Only an explicit in-app switch is remembered, so a user who never touches
// the selector keeps following their browser language.
export async function switchLocale(locale) {
  await activateLocale(locale);
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Storage unavailable - the choice simply lasts for this tab.
  }
}
