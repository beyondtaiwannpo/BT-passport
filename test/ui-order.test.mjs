// 三格順序與「category 改名不准讓格子消失」的釘子。
// 跑法：node --test test/*.test.mjs    （node 內建，不需要 npm、不需要 jsdom）
//
// 這支測試存在的理由：順序不對是看得出來的，**格子消失是看不出來的** ——
// 33 格裡少一格不會報錯、不會變紅，只會有一個人某天發現他的章不見了。
import { test } from "node:test";
import assert from "node:assert/strict";
import { monthPageHTML, slotHTML, CATNAME, SLOT_ORDER } from "../src/ui.js";

const MONTH = { seq: 1, month: 9, theme_zh: "07:00", theme_en: "" };

const act = (id, category, title_zh) => ({
  id, month: 9, seq: 1, category, title_zh,
  title_en: "TITLE", description: "說明", active: true
});

// monthPageHTML 只讀這幾個欄位，其他不必給。
const stateWith = acts => ({
  activities: acts, months: [MONTH], stamps: {}, entries: {}, justStamped: null
});

const positions = html => ["聚會 GATHER", "題目 PROMPT", "鏡頭 FRAME"].map(n => html.indexOf(n));
const slotCount = html => html.split('class="slot"').length - 1;

test("三格順序固定是 聚會 → 題目 → 鏡頭，不管輸入順序", () => {
  // 刻意用資料庫 order by category 會給的順序餵進去（frame/gather/prompt）。
  const html = monthPageHTML(stateWith([
    act("09C", "frame", "開學第一天"),
    act("09A", "gather", "開學電影夜"),
    act("09B", "prompt", "我是怎麼進來的")
  ]), MONTH);
  const [g, p, f] = positions(html);
  assert.ok(g >= 0 && p >= 0 && f >= 0, "三格都要在");
  assert.ok(g < p, `聚會要排在題目前面，實際 ${g} vs ${p}`);
  assert.ok(p < f, `題目要排在鏡頭前面，實際 ${p} vs ${f}`);
});

test("SLOT_ORDER 的成員必須跟 CATNAME 的鍵完全一致", () => {
  // 有人加了新的 category 卻忘了把它排進順序表，這裡就紅。
  assert.deepEqual([...SLOT_ORDER].sort(), Object.keys(CATNAME).sort());
});

test("mutation：塞一個不存在的 category，那一格排到最後但不准消失", () => {
  const html = monthPageHTML(stateWith([
    act("09A", "gather", "開學電影夜"),
    act("09B", "prompt", "我是怎麼進來的"),
    act("09C", "frame", "開學第一天"),
    act("09D", "vlog", "這格是實驗")
  ]), MONTH);
  assert.equal(slotCount(html), 4, "四格都要在，不准少一格");
  assert.ok(html.includes("這格是實驗"), "認不得的 category 那一格的標題要出現");
  const [g, p, f] = positions(html);
  assert.ok(g < p && p < f, "前三格順序不受影響");
  assert.ok(html.indexOf("這格是實驗") > f, "認不得的排到最後");
  assert.ok(!html.includes("undefined"), "不准把 undefined 印到畫面上");
});

test("mutation：把 frame 改名成 frame_v2，三格都還在", () => {
  // 模擬「之後有人改 category 名稱」。失敗的表現必須是順序不對，不是格子消失。
  const html = monthPageHTML(stateWith([
    act("09A", "gather", "開學電影夜"),
    act("09B", "prompt", "我是怎麼進來的"),
    act("09C", "frame_v2", "開學第一天")
  ]), MONTH);
  assert.equal(slotCount(html), 3, "三格都要在");
  assert.ok(html.includes("開學第一天"), "改名那一格的標題要出現");
  assert.ok(!html.includes("undefined"), "不准把 undefined 印到畫面上");
});

test("slotHTML 對認不得的 category 印空字串，不印 undefined", () => {
  const html = slotHTML(stateWith([]), act("09D", "vlog", "這格是實驗"));
  assert.ok(!html.includes("undefined"));
  assert.ok(html.includes("這格是實驗"));
});
