// The player's own written decision: the English matcher (intent.js), the safety check, the model prompt and reply
// check (interpret.js), and taking names out before anything leaves the browser (privacy.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSim } from "./sim-stubs/load.js";

const { intent, interpret, privacy, actions, act } = await loadSim();
const { matchIntent, safetyCheck, SAFETY_MESSAGES } = intent;

// [what the player wrote, the action it should map to first]
const SAMPLES = [
  ["I'm going to quit my job and travel", "quitJob"],
  ["Send out my resume and look for a new job", "jobSearch"],
  ["Ask my boss for a raise", "negotiate"],
  ["Go back to school for a nursing degree", "study"],
  ["I want to start my own bakery", "startup"],
  ["Let's get married at the courthouse", "marry"],
  ["I think we should break up", "separate"],
  ["File for divorce", "separate"],
  ["I don't want a divorce, let's try couples counseling", "counsel"],
  ["Talk it out with her tonight", "talk"],
  ["Put my savings into an index fund", "invest"],
  ["Buy a house with a 30-year mortgage", "buyHome"],
  ["Take out a loan from the bank", "borrow"],
  ["Lend him the money he needs", "lend"],
  ["Join the Army", "enlist"],
  ["Move to California for a fresh start", "moveHome"],
  ["Move to Canada for good", "emigrate"],
  ["Hire a caregiver for Mom", "hireCare"],
  ["Move Mom in with us and take care of her myself", "care"],
  ["Take turns with my sister", "shareCare"],
  ["Forgive him and move on", "reconcile"],
  ["Stand my ground and fight for my share", "insist"],
  ["Block her number and never talk to her again", "cutOff"],
  ["Call my old boss and ask for help", "seekHelp"],
  ["Take a month off to rest", "rest"],
  ["Go on a road trip", "travel"],
  ["Start running every morning", "exercise"],
  ["Get a checkup at the doctor", "seeDoctor"],
  ["Quit smoking", "quitHabit"],
  ["Stop drinking and go to AA", "quitHabit"],
  ["Drink until I forget", "vice"],
  ["Learn guitar", "hobby"],
  ["Volunteer at the food bank", "volunteer"],
  ["Go to more parties and make new friends", "socialize"],
  ["Pray about it", "spiritual"],
  ["Get my birth chart read by an astrologer", "spiritual"],
  ["Wait and see what happens", "wait"],
  ["Ask her out", "pursue"],
  ["Try for a baby", "haveChild"],
  ["We don't want kids", "noChild"],
  ["Retire early and collect Social Security", "retire"],
  ["Take the civil service exam", "civilService"],
  ["Pick up a side gig driving for Uber", "sideJob"],
  ["Push through until the project ends", "pushThrough"],
  ["Switch to a different company", "jobHop"],
  ["Learn a trade and become an electrician", "careerSwitch"],
  ["Study abroad in Spain", "studyAbroad"],
  ["Accept the overseas posting", "workAbroad"],
  ["Sue the company for wrongful termination", "dispute"],
  ["Go home and help out on the family farm", "familyBusiness"],
  ["Sell the house and split the money", "sellAsset"],
  ["Buy some lottery tickets", "lottery"],
  ["Donate it all to charity", "donate"],
  ["Give it some space for a few days", "avoid"],
  ["Have an affair", "affair"],
  ["See a therapist", "counsel"],
  ["Get life insurance", "insurance"],
  ["Keep things as they are", "wait"],
  ["Save up and cut back on spending", "save"],
  ["I won't quit, I'll ask for a raise instead", "negotiate"],
  ["Instead of moving, I'll ask to work from home", "negotiate"],
];

test(`the English matcher maps ${SAMPLES.length} sample sentences to the right action first`, () => {
  const wrong = SAMPLES.map(([text, want]) => [text, want, (matchIntent(text)[0] || {}).id]).filter(([, want, got]) => got !== want);
  assert.deepEqual(wrong, [], wrong.map(([t, w, g]) => `"${t}": wanted ${w}, got ${g}`).join("\n"));
});

test("every sample maps to an action that exists, and every action has words, a label and a handler", () => {
  for (const [, want] of SAMPLES) assert.ok(actions.ACTIONS[want], want);
  for (const [id, a] of Object.entries(actions.ACTIONS)) {
    assert.ok(a.label && a.desc && a.words.length >= 5, id);
    assert.ok(!/[^\x20-\x7E’éñ]/.test(a.label + a.desc + a.words.join("")), `${id} is plain English`);
  }
  assert.deepEqual(act.UNHANDLED, []);
});

test("a negated phrase does not count, and a choice's own buttons win a tie", () => {
  const ids = text => matchIntent(text).map(r => r.id);
  assert.ok(!ids("I don't want to get divorced").includes("separate"));
  assert.ok(!ids("I will never quit").includes("quitJob"));
  assert.ok(!ids("quit smoking").includes("vice"));
  assert.equal(matchIntent("Take the promotion", { options: [{ id: "promo.yes", words: ["take the promotion", "accept"] }] })[0].id, "promo.yes");
  assert.deepEqual(matchIntent(""), []);
  assert.deepEqual(matchIntent("purple elephants"), []);
  assert.equal(intent.stem("divorced"), intent.stem("divorce"));
  assert.equal(intent.stem("studying"), "study");
  assert.equal(intent.stem("quitting"), "quit");
});

test("the safety check catches self-harm and harm to others, and not everyday figures of speech", () => {
  const selfHarm = ["I want to kill myself", "maybe I should just end it all", "I don't want to be alive anymore", "I'm going to take all my pills", "kms honestly", "I'm gonna hurt myself", "I wish I were dead", "suicide"];
  const harm = ["kill my boss", "Beat him up", "rob a bank", "sell drugs to pay rent", "burn his house down", "drive drunk home, it's fine", "get revenge on my ex", "commit insurance fraud", "hit my wife"];
  const fine = ["This job is killing me, I need a break", "I'm going to kill it at the interview", "Shoot my shot with her", "I'd die for a vacation", "Steal the show at the talent contest", "Quit drinking", "Kill time at the mall", "Beat the traffic and go home early"];
  for (const t of selfHarm) assert.equal(safetyCheck(t), "self_harm", t);
  for (const t of harm) assert.equal(safetyCheck(t), "harm", t);
  for (const t of fine) assert.equal(safetyCheck(t), "ok", t);
  assert.match(SAFETY_MESSAGES.self_harm, /\b988\b/);
  assert.match(SAFETY_MESSAGES.harm, /another choice/);
});

test("the model prompt lists the buttons and actions, and its reply is checked", () => {
  const prompt = interpret.interpretPrompt({ situation: "Your company is laying people off. What now?", context: "34 years old, female", options: [{ id: "layoff.search", label: "Look for work", hint: "income back sooner" }], text: "I'll take some time off" });
  assert.match(prompt, /layoff\.search: Look for work \(income back sooner\)/);
  assert.match(prompt, /- rest: /);
  assert.match(prompt, /I'll take some time off/);
  assert.ok(!/[\u3000-\u9fff]/.test(prompt));
  const reply = interpret.jsonFromText('Sure! ```json\n{"action":"rest","summary":"You decide to take a break","confidence":0.9}\n```');
  assert.deepEqual(interpret.readInterpretation(reply), { action: "rest", summary: "You decide to take a break", confidence: 0.9 });
  assert.equal(interpret.readInterpretation({ action: "winLottery" }).action, "unknown");
  assert.equal(interpret.readInterpretation({ action: "layoff.search" }, { options: [{ id: "layoff.search" }] }).action, "layoff.search");
});

test("names typed by the player are swapped out before a written choice leaves the browser", () => {
  const swaps = privacy.nameSwaps({ name: "Jane Doe", members: [{ name: "Mike Doe", label: "my brother" }, { name: "Chris", label: "my partner" }, { name: "J", label: "my dad" }] });
  const out = privacy.withoutNames({
    situation: "Mike asks Jane for money.", context: "Jane Doe, 34", text: "Tell my brother Mike no, and ask Chris what Jane's options are; Annie can help",
    options: [{ id: "x", label: "Lend Mike the money", hint: "Mike's rent" }],
  }, swaps);
  assert.equal(out.situation, "my brother asks you for money.");
  assert.equal(out.context, "you, 34");
  assert.equal(out.text, "Tell my brother no, and ask my partner what your options are; Annie can help");
  assert.deepEqual(out.options, [{ id: "x", label: "Lend my brother the money", hint: "my brother's rent" }]);
  assert.deepEqual(privacy.withoutNames({ text: "hi" }, []), { text: "hi" });
});
