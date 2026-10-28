// The English catalog of the engine's text (README「英文版（翻譯層）」), shared by the life page's parts: the story
// (life-app.js createLife), the readings and result cards (core/tr.js setReadingLang), the 合婚 tab and 準爸媽.
// Fetched once, only when English is on and the page is served over http(s); null until then or if it fails.
import { makeLang, loadStoryBundle } from "./sim/lang.js";
import { lang } from "./i18n.js";

const STORY_URL = "/i18n/story-en.json";
let english = null, loading = null;
// Starts the fetch (once) and returns the promise of the translator, or null when it cannot be fetched here.
export function ensureEnglish() {
  if (english || loading) return loading;
  if (typeof location === "undefined" || !/^https?:$/.test(location.protocol)) return null;
  loading = loadStoryBundle(STORY_URL).then(b => (english = makeLang(b))).catch(() => null);
  return loading;
}
// The translator when English is on and the catalog is here; null otherwise (then everything stays Chinese).
export const englishNow = () => (lang() === "en" ? english : null);
