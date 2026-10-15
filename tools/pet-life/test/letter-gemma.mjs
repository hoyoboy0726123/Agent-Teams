// Tries the farewell-letter prompt on Gemma 4 26B through the Gemini API (the same open model Workers AI serves),
// so the wording can be checked before deploying. Usage: GOOGLE_API_KEY=... node test/letter-gemma.mjs [index]
import { readLife, buildMessages, cleanLetter, looksRight, PRICES } from "../src/letter.js";
import { SAMPLES } from "./samples.mjs";

const key = process.env.GOOGLE_API_KEY;
if (!key) throw new Error("GOOGLE_API_KEY is not set");
const MODEL = process.env.GEMMA_MODEL || "gemma-4-26b-a4b-it";
const only = process.argv[2] !== undefined ? [SAMPLES[+process.argv[2]]] : SAMPLES;

async function ask(system, user) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    // Gemma 4 reasons before answering unless told not to; Workers AI turns this off with chat_template_kwargs.
    generationConfig: { temperature: 0.85, maxOutputTokens: 1500, thinkingConfig: { thinkingLevel: "minimal" } },
  };
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j.error || j).slice(0, 300));
  const parts = j.candidates?.[0]?.content?.parts || [];
  return { text: parts.filter(p => !p.thought).map(p => p.text || "").join(""), usage: j.usageMetadata || {} };
}

for (const sample of only) {
  const life = readLife(sample);
  const [sys, user] = buildMessages(life);
  const { text, usage } = await ask(sys.content, user.content);
  const letter = cleanLetter(text);
  const [pin, pout] = PRICES["@cf/google/gemma-4-26b-a4b-it"];
  const neurons = Math.ceil(((usage.promptTokenCount || 0) * pin + (usage.candidatesTokenCount || 0) * pout) / 1e6);
  console.log(`\n===== ${life.name || "(沒有名字)"} · ${life.country}${life.city} · ${letter.length} 字 · ok=${looksRight(letter)} · tokens in/out ${usage.promptTokenCount}/${usage.candidatesTokenCount} ≈ ${neurons} neurons on Workers AI`);
  console.log(letter);
}
