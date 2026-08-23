// 書本頁序的契約。頁碼的定義點只有 ui.js 的 pagesOf()，
// 不准任何地方再自己算 page - 1 或 months.length。
// 跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { pagesOf, bookHTML, guideCardsHTML, guidePageHTML } from "../src/ui.js";

const months = [
  { seq: 1, month: 9,  theme_zh: "07:00", theme_en: "" },
  { seq: 2, month: 10, theme_zh: "08:00", theme_en: "" }
];

const S = page => ({
  page, months, activities: [], stamps: {}, entries: {}, justStamped: null,
  profile: { id: "00000000-0000-0000-0000-000000000000", name_zh: "王小明",
             name_en: "Ming Wang", team: "Sponsorship Team", issued: "2026-08-22" }
});

const dotCount = html => (html.match(/data-act="go"/g) || []).length;

test("pagesOf：資料頁 → 說明頁 → 月份，九月在索引 2", () => {
  const pages = pagesOf(S(0));
  assert.equal(pages[0].kind, "id");
  assert.equal(pages[1].kind, "guide");
  assert.equal(pages[2].kind, "month");
  assert.equal(pages[2].month.month, 9);
  assert.equal(pages.length, months.length + 2);
});

test("圓點數等於 pagesOf 的長度，而且就是 months + 2 顆", () => {
  // 兩個斷言缺一不可：
  // 第一個確認 bookHTML 的圓點迴圈跟 pagesOf 的陣列一一對應（抓 bookHTML 漏畫）。
  // 第二個釘住字面數字（抓 pagesOf 自己少一項）—— 只有第一個的話兩邊同源，
  // pagesOf 少掉資料頁或說明頁時它會一起變小而不會紅。
  assert.equal(dotCount(bookHTML(S(1))), pagesOf(S(1)).length);
  assert.equal(dotCount(bookHTML(S(1))), months.length + 2);
});

test("圓點的 data-p 是 0 起算的連號", () => {
  const html = bookHTML(S(1));
  const ps = [...html.matchAll(/data-p="(\d+)"/g)].map(m => Number(m[1]));
  assert.deepEqual(ps, ps.map((_, i) => i));
});

test("第一頁的『前一頁』與最後一頁的『下一頁』是 disabled", () => {
  const last = pagesOf(S(0)).length - 1;
  const first = bookHTML(S(0));
  assert.match(first, /data-act="prev" disabled/);
  const end = bookHTML(S(last));
  assert.match(end, /data-act="next" disabled/);
});

test("沒有活動的月份，圓點不算蓋滿", () => {
  // acts.every() 對空陣列回 true，直接用會讓一個沒有任何活動的月份顯示成「已蓋滿」。
  const html = bookHTML(S(1));
  assert.ok(!/data-on="1"/.test(html), "沒有活動就不該有橘色圓點");
});

test("說明頁的三張卡也是 聚會 → 題目 → 鏡頭", () => {
  const html = guideCardsHTML();
  const [g, p, f] = ["聚會 GATHER", "題目 PROMPT", "鏡頭 FRAME"].map(n => html.indexOf(n));
  assert.ok(g >= 0 && p >= 0 && f >= 0);
  assert.ok(g < p && p < f);
});

test("說明頁用的是 .slot 而不是可點的 button", () => {
  const html = guidePageHTML();
  assert.ok(html.includes('<div class="slot">'), "三張卡是 div，不可點");
  assert.ok(!html.includes('data-act="open"'), "說明頁不該有蓋章入口");
});

test("翻到說明頁時 bookHTML 畫的是說明頁", () => {
  assert.ok(bookHTML(S(1)).includes(guideCardsHTML()));
});
