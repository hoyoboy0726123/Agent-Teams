// The site's display face, Fraunces (SIL Open Font License 1.1, assets/fonts/OFL.txt), served by the site's own Worker
// (worker/index.js) rather than Google Fonts, so no request leaves the site for it. The files are Google Fonts' own
// woff2 subsets (variable weight; latin and latin-ext, upright and italic). The body text uses the system font stack.
// Used by src/index.html (the build fills /*__FONTS__*/) and src/legal.js.
const range = {
  latin: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  "latin-ext": "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
};
// Path → the file in assets/fonts/ (worker/index.js serves these).
export const FONT_FILES = {
  "/fonts/fraunces-latin.woff2": "fraunces-latin.woff2",
  "/fonts/fraunces-latin-ext.woff2": "fraunces-latin-ext.woff2",
  "/fonts/fraunces-italic-latin.woff2": "fraunces-italic-latin.woff2",
  "/fonts/fraunces-italic-latin-ext.woff2": "fraunces-italic-latin-ext.woff2",
};
const face = (style, weight, file, subset) => `@font-face { font-family: "Fraunces"; font-style: ${style}; font-weight: ${weight}; font-display: swap; src: url(/fonts/${file}) format("woff2"); unicode-range: ${range[subset]}; }`;
export const FONT_CSS = [
  face("normal", "400 600", "fraunces-latin-ext.woff2", "latin-ext"),
  face("normal", "400 600", "fraunces-latin.woff2", "latin"),
  face("italic", "500", "fraunces-italic-latin-ext.woff2", "latin-ext"),
  face("italic", "500", "fraunces-italic-latin.woff2", "latin"),
].join("\n");
// The face the first screen shows (the hero title), fetched early.
export const FONT_PRELOAD = `<link rel="preload" href="/fonts/fraunces-latin.woff2" as="font" type="font/woff2" crossorigin>`;
