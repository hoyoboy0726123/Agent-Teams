// A written choice leaves the phone without the names the player typed.
import test from "node:test";
import assert from "node:assert/strict";
import { nameSwaps, withoutNames } from "../src/sim/privacy.js";

const family = {
  name: "陳志明",
  members: [
    { relation: "partner", label: "伴侶", name: "王小美" },
    { relation: "olderBrother", label: "哥哥", name: "陳志強" },
    { relation: "father", label: "爸爸", name: "陳大文" },
    { relation: "mother", label: "媽媽", name: "" },
  ],
};

test("each typed name and the name the story calls them by get a stand-in word, longest first", () => {
  const swaps = nameSwaps(family);
  const map = Object.fromEntries(swaps);
  assert.equal(map["王小美"], "伴侶");
  assert.equal(map["小美"], "伴侶");
  assert.equal(map["哥哥志強"], "哥哥");
  assert.equal(map["志強"], "哥哥");
  assert.equal(map["陳大文"], "爸爸");
  assert.equal(map["陳志明"], "你");
  assert.equal(map["志明"], "你");
  for (let i = 1; i < swaps.length; i++) assert.ok(swaps[i - 1][0].length >= swaps[i][0].length);
});

test("the question, the context, the buttons and the sentence all go out without the names", () => {
  const payload = {
    situation: "和小美交往 3 年，走到要不要結婚這一步。要結婚嗎？",
    context: "30 歲，男性，工作是工程師，交往中，存款不多",
    options: [{ id: "proposal.yes", label: "跟小美求婚" }, { id: "proposal.wait", label: "再等等" }],
    text: "先跟王小美和哥哥志強商量，存夠錢再說",
  };
  const out = withoutNames(payload, nameSwaps(family));
  assert.equal(out.situation, "和伴侶交往 3 年，走到要不要結婚這一步。要結婚嗎？");
  assert.equal(out.options[0].label, "跟伴侶求婚");
  assert.equal(out.options[0].id, "proposal.yes");
  assert.equal(out.text, "先跟伴侶和哥哥商量，存夠錢再說");
  assert.equal(out.context, payload.context);
  assert.doesNotMatch(JSON.stringify(out), /小美|志強|志明|大文/);
});

test("a nickname is swapped whole, and a one-character name is left alone", () => {
  const swaps = nameSwaps({ members: [{ label: "伴侶", name: "阿美" }, { label: "妹妹", name: "芳" }] });
  assert.deepEqual(swaps, [["伴侶阿美", "伴侶"], ["阿美", "伴侶"]]);
  assert.equal(withoutNames({ situation: "", text: "帶阿美去吃芳芳的店" }, swaps).text, "帶伴侶去吃芳芳的店");
});

test("with no names typed the payload goes out as it is", () => {
  const payload = { situation: "要去日本工作嗎？", context: "", options: [], text: "先問問家人" };
  assert.equal(withoutNames(payload, nameSwaps({})), payload);
  assert.equal(withoutNames(payload, nameSwaps({ name: "", members: [] })), payload);
});
