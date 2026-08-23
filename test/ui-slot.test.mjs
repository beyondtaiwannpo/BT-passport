// 格子在「未蓋章／已蓋章」兩種狀態下該有什麼。
// 跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { slotHTML } from "../src/ui.js";

const act = {
  id: "09A", month: 9, seq: 1, category: "gather",
  title_zh: "開學電影夜", title_en: "OPENING NIGHT",
  description: "新學年第一次全員上線，選片權給今年的新幹部"
};
const state = (stamps = {}, entries = {}) => ({ stamps, entries, justStamped: null, activities: [act] });

test("未蓋章的格子有說明與「蓋章 →」", () => {
  const html = slotHTML(state(), act);
  assert.ok(html.includes(act.description));
  assert.ok(html.includes("蓋章 →"));
});

test("蓋過章的格子仍然保留活動說明 —— 章不要浮在一片空白中間", () => {
  // 2026-08-23：蓋章之後說明消失，標題與章之間留下 116.8px 的洞（實測）。
  // 格子有 min-height:270px 而且同一列由最高的那格決定高度，空間一定得去某個地方，
  // 所以解法不是把洞變小，是讓內容從上往下連續、餘白落在底部。
  // 說明用 activities 表裡本來就有的那句，不另外編一份文案。
  const html = slotHTML(state({ "09A": { date: "2026-09-05" } }), act);
  assert.ok(html.includes(act.description), "蓋章後仍要印活動說明");
  assert.ok(!html.includes("蓋章 →"), "蓋過章就不該再出現「蓋章 →」");
  assert.ok(html.includes("stampwrap"), "要有章");
});

test("蓋章後心得與照片仍然照舊顯示", () => {
  const html = slotHTML(
    state({ "09A": { date: "2026-09-05" } }, { "09A": { note: "那天我遲到了十分鐘", photo: "data:image/jpeg;base64,AAAA" } }),
    act
  );
  assert.ok(html.includes("那天我遲到了十分鐘"));
  assert.ok(html.includes("class=\"thumb\""));
});
