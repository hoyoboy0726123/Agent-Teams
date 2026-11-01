// Reading the player's own written decision, in the browser: no network, nothing uploaded. Word matching finds the
// closest actions.
//
// The result is a ranked list; the page shows the top ones for the player to confirm, so a wrong guess costs one tap.
// A model behind the Worker (interpret.js) does the same job better when it is available; both map onto the same
// action ids, and the engine alone decides what happens.
import { ACTIONS } from "./actions.js";

// Never simulated: the page answers with help lines, or asks for another choice. Wording can always slip past a list,
// so the model's reading checks again (interpret.js self_harm / harm).
const SELF_HARM = new RegExp([
  "\\bkill(ing)? my ?self\\b", "\\bkms\\b", "\\bsuicid", "\\bend(ing)? (it all|my life|my own life|everything)\\b", "\\btake my (own )?life\\b",
  "\\b(want|wanna|going|gonna|ready) to die\\b", "\\bwanna die\\b", "\\bwish i (was|were) dead\\b", "\\bbetter off dead\\b",
  "\\b(don't|do not|dont) want to (live|be alive|wake up)\\b", "\\bno (reason|point) (to|in) (live|living|going on)\\b",
  "\\bnot worth living\\b", "\\bhurt(ing)? my ?self\\b", "\\bcut(ting)? my ?self\\b", "\\bself[- ]?harm", "\\bslit my wrists?\\b",
  "\\boverdose\\b", "\\bod on\\b", "\\btake all (my|the) pills\\b", "\\bhang my ?self\\b", "\\bjump(ing)? (off|from) (a|the) (bridge|roof|building)\\b",
  "\\bdisappear forever\\b", "\\bnot be here anymore\\b", "\\bunalive\\b",
].join("|"), "i");
const HARM = new RegExp([
  "\\b(kill|murder|shoot|stab|strangle|poison) (him|her|them|my (wife|husband|boss|dad|mom|father|mother|kids?|son|daughter|partner|brother|sister|neighbor|coworker)|the (boss|kids?|baby)|everyone|people|someone)\\b",
  "\\bmurder\\b", "\\bmass shooting\\b", "\\bshoot up\\b", "\\bbeat (him|her|them|my (wife|husband|kids?|son|daughter|partner))( up)?\\b",
  "\\bhit (my )?(wife|husband|kids?|child|son|daughter|partner|girlfriend|boyfriend)\\b", "\\bbeat up\\b",
  "\\bhurt (him|her|them|my (wife|husband|kids?|baby|partner))\\b", "\\bget revenge\\b", "\\brevenge on\\b", "\\bget even with\\b",
  "\\b(burn|set fire to) (the|his|her|their) (house|car|office|place)\\b", "\\barson\\b", "\\bkidnap", "\\brape\\b", "\\bsexual(ly)? assault",
  "\\babuse (him|her|them|the kids?|my)\\b", "\\brob (a|the) (bank|store|gas station|house)\\b", "\\bholdup\\b", "\\bmug (someone|him|her)\\b",
  "\\bsteal (money|from|a car|his|her|their|the money|cars?)\\b", "\\bembezzle", "\\blaunder (the )?money\\b", "\\bmoney laundering\\b",
  "\\bcommit fraud\\b", "\\binsurance fraud\\b", "\\btax fraud\\b", "\\bevade taxes\\b", "\\bscam (people|old people|seniors|investors|someone)\\b",
  "\\bponzi\\b", "\\bforge (a|the|his|her) (will|check|signature)\\b", "\\bsell(ing)? (drugs|meth|heroin|fentanyl|coke|cocaine)\\b",
  "\\b(deal|dealing) drugs\\b", "\\bcook meth\\b", "\\bdrunk driv", "\\bdrive drunk\\b", "\\bleave (the )?(kids?|baby) (home )?alone\\b",
].join("|"), "i");

export function safetyCheck(text) {
  const t = expandContractions(String(text || "").toLowerCase().replace(/[’‘]/g, "'"));
  if (SELF_HARM.test(t)) return "self_harm";
  if (HARM.test(t)) return "harm";
  return "ok";
}

// What the page shows instead of simulating. 988 is the US Suicide & Crisis Lifeline (call or text, any time).
export const SAFETY_MESSAGES = {
  self_harm: "It sounds like things might be really hard right now, and this game won't play that out. If you're thinking about suicide or hurting yourself, you can call or text 988 any time to reach the Suicide & Crisis Lifeline (or chat at 988lifeline.org). If you're in danger right now, call 911. Outside the US, find a helpline at findahelpline.com. You don't have to go through this alone.",
  harm: "This game won't play out hurting someone or breaking the law. Try another choice.",
};

// ---------- matching ----------
const CONTRACTIONS = [
  [/\bwon't\b/g, "will not"], [/\bcan't\b/g, "can not"], [/\bcannot\b/g, "can not"], [/\bshan't\b/g, "shall not"], [/\bain't\b/g, "is not"],
  [/\b(\w+)n't\b/g, "$1 not"], [/\bi'm\b/g, "i am"], [/\b(\w+)'re\b/g, "$1 are"], [/\b(\w+)'ve\b/g, "$1 have"], [/\b(\w+)'ll\b/g, "$1 will"],
  [/\b(\w+)'d\b/g, "$1 would"], [/\bgonna\b/g, "going to"], [/\bwanna\b/g, "want to"], [/\bgotta\b/g, "got to"],
];
function expandContractions(t) {
  return CONTRACTIONS.reduce((x, [re, to]) => x.replace(re, to), t);
}
// A light stemmer, the same for the player's words and the action words: "divorced", "divorcing" and "divorce" all
// become "divorc"; "studies", "studying" and "studied" become "study"; "quitting" becomes "quit".
export function stem(w) {
  let x = w;
  if (x.length > 4 && /ies$/.test(x)) x = x.slice(0, -3) + "y";
  else if (x.length > 4 && /ied$/.test(x)) x = x.slice(0, -3) + "y";
  else if (x.length > 5 && /ing$/.test(x)) x = x.slice(0, -3);
  else if (x.length > 4 && /ed$/.test(x)) x = x.slice(0, -2);
  else if (x.length > 4 && /es$/.test(x) && !/(ss|us|is)es$/.test(x)) x = x.slice(0, -2);
  else if (x.length > 3 && /s$/.test(x) && !/(ss|us|is)$/.test(x)) x = x.slice(0, -1);
  if (/([bdfgklmnprtvz])\1$/.test(x) && !/(ll|ss|zz)$/.test(x)) x = x.slice(0, -1);   // quitt → quit, stopp → stop
  if (x.length > 3 && /e$/.test(x)) x = x.slice(0, -1);
  return x;
}
// The words of a text, lowercased, contractions spelled out, each stemmed; a clause break (. , ; : ! ?) becomes "|",
// which no phrase contains and no negation reaches across.
export function tokens(text) {
  const t = expandContractions(String(text || "").toLowerCase().replace(/[’‘]/g, "'").replace(/\(k\)/g, "k"));
  return t.replace(/[.,;:!?]+/g, " | ").replace(/[^a-z0-9'&$| ]+/g, " ").replace(/'s\b/g, "").replace(/'/g, "").split(/\s+/).filter(Boolean).map(w => (w === "|" ? w : stem(w)));
}
// Kept for callers of the old name: the text as matched.
export const normalise = text => tokens(text).join(" ");

// A phrase preceded by a negation in its clause ("I don't want a divorce", "never quit", "instead of moving") does not
// count for its action. "not", "no", "never", "without" reach four words back, "instead of" and "rather than" too;
// "stop", "quit", "give up" and "avoid" only the word right before ("stop drinking" is not drinking, and "quit and
// start a business" still starts one). A clause break, "but", "so" or "then" ends the reach.
const NEAR = new Set(["not", "no", "never", "without", "nor", "refuse", "against"].map(stem));
const BREAK = new Set(["|", "but", "so", "then", "though", "although"].map(w => (w === "|" ? w : stem(w))));
const RIGHT_BEFORE = new Set(["stop", "quit", "give up", "avoid", "skip", "cancel"].map(w => w.split(" ").map(stem).join(" ")));
const INSTEAD = [["instead", "of"], ["rather", "than"]].map(p => p.map(stem));
function negated(t, at) {
  if (at >= 1 && RIGHT_BEFORE.has(t[at - 1])) return true;
  if (at >= 2 && RIGHT_BEFORE.has(`${t[at - 2]} ${t[at - 1]}`)) return true;
  for (let k = 1; k <= 4 && at - k >= 0; k++) {
    const w = t[at - k];
    if (BREAK.has(w)) return false;
    if (NEAR.has(w)) return true;
    if (k >= 2 && INSTEAD.some(([a, b]) => t[at - k] === a && t[at - k + 1] === b)) return true;
  }
  return false;
}

const compiled = new Map();
const phraseOf = w => { if (!compiled.has(w)) compiled.set(w, tokens(w)); return compiled.get(w); };

function score(t, words) {
  let total = 0;
  const strong = Math.ceil(words.length / 3);
  words.forEach((w, i) => {
    const p = phraseOf(w);
    if (!p.length) return;
    for (let at = 0; at + p.length <= t.length; at++) {
      let hit = true;
      for (let k = 0; k < p.length; k++) if (t[at + k] !== p[k]) { hit = false; break; }
      if (hit && !negated(t, at)) total += (i < strong ? 2 : 1) * (1 + 0.5 * (p.length - 1));
    }
  });
  return total;
}

// Ranked guesses for what the player wrote.
//   options  this choice's own buttons, [{ id, words }]: they win ties over the general actions
//   only     limit the general actions to these ids (all of them by default)
export function matchIntent(text, { options = [], only = null } = {}) {
  const t = tokens(text);
  if (!t.length) return [];
  const general = Object.entries(ACTIONS).filter(([id]) => !only || only.includes(id)).map(([id, a]) => ({ id, words: a.words, own: false }));
  const all = [...options.map(o => ({ id: o.id, words: o.words || [], own: true })), ...general];
  return all
    .map(c => ({ id: c.id, score: score(t, c.words) + (c.own ? 0.25 : 0) }))
    .filter(c => c.score > 0.25)
    .sort((a, b) => b.score - a.score);
}
