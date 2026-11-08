// Shared renderer strings follow the active UI language, including dialogs
// opened after a language change. Document content is never translated.
export function getLocale() {
  return typeof document !== "undefined" &&
    document.documentElement.lang === "zh-CN"
    ? "zh-CN"
    : "en";
}

export function t(chinese, english, locale = getLocale()) {
  return locale === "zh-CN" ? chinese : english;
}
