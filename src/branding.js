/** Unmodified artwork from the supplied inkstone-brand kit. See docs/BRANDING.md. */
export const brandAssets = Object.freeze({
  horizontal: new URL(
    "./assets/brand/inkstone-logo-horizontal.svg",
    import.meta.url,
  ).href,
  horizontalReversed: new URL(
    "./assets/brand/inkstone-logo-horizontal-reversed.svg",
    import.meta.url,
  ).href,
  horizontalEnglish: new URL(
    "./assets/brand/inkstone-logo-horizontal-en.svg",
    import.meta.url,
  ).href,
  horizontalEnglishReversed: new URL(
    "./assets/brand/inkstone-logo-horizontal-en-reversed.svg",
    import.meta.url,
  ).href,
  mark: new URL("./assets/brand/inkstone-mark.svg", import.meta.url).href,
  markReversed: new URL(
    "./assets/brand/inkstone-mark-reversed.svg",
    import.meta.url,
  ).href,
});
function escapeText(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}
function themedArtwork(light, dark, className, label) {
  return `<span class="${className}" role="img" aria-label="${escapeText(label)}"><img class="brand-artwork brand-artwork-light" src="${light}" alt="" aria-hidden="true" draggable="false"><img class="brand-artwork brand-artwork-dark" src="${dark}" alt="" aria-hidden="true" draggable="false"></span>`;
}
export function brandLogo(locale = "zh-CN") {
  const chinese = locale.startsWith("zh");
  return themedArtwork(
    chinese ? brandAssets.horizontal : brandAssets.horizontalEnglish,
    chinese
      ? brandAssets.horizontalReversed
      : brandAssets.horizontalEnglishReversed,
    "brand-lockup",
    chinese ? "Inkstone 墨石" : "Inkstone",
  );
}
export function brandMark() {
  return themedArtwork(
    brandAssets.mark,
    brandAssets.markReversed,
    "brand-mark",
    "Inkstone",
  );
}
export function brandIdentity(tagline = "", locale = "zh-CN") {
  return `<div class="brand-identity">${brandLogo(locale)}${tagline ? `<span class="brand-tagline">${escapeText(tagline)}</span>` : ""}</div>`;
}
