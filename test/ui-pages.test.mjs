// 書本頁序的契約。頁碼的定義點只有 ui.js 的 pagesOf()，
// 不准任何地方再自己算 page - 1 或 months.length。
// 跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { pagesOf, bookHTML, guideCardsHTML, guidePageHTML, introHTML, monthPageHTML } from "../src/ui.js";

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

test("說明頁卡片的 .ttl 放的是定義句，不是分類短名", () => {
  // 2026-08-23 使用者的決定（對照圖 B）：三句定義已經在 activities.json 定義過，
  // .ttl 不准再寫一次分類短名（那會讓「聚會」在同一張卡上出現兩次）。
  const html = guideCardsHTML();
  assert.ok(html.includes("全 BT 一起做的事"), "gather 那張卡要顯示定義句");
  assert.ok(!html.includes('<span class="ttl">聚會</span>'), ".ttl 不准放分類短名");
});

test("說明頁的 .mhead 帶 solo，且不含 mnum", () => {
  // 2026-08-23 使用者的決定（對照圖 C）：那一頁不是月份，00 已經給了資料頁，
  // .mnum 留空、標題放大到 52px（由 .mhead.solo 這個修飾詞在 CSS 端接手）。
  const html = guidePageHTML();
  assert.ok(html.includes('<div class="mhead solo">'), "說明頁的 .mhead 要帶 solo");
  assert.ok(!html.includes("mnum"), "說明頁不准出現 mnum");
});

test("月份頁的 .mhead 不帶 solo", () => {
  // solo 只准掛在說明頁，否則月份頁的月份數字那一格會被牽連（見 index.html 的
  // .mhead.solo .mzh 只掛在 .mhead.solo 上，不是裸的 .mzh）。
  const month = { seq: 1, month: 9, theme_zh: "07:00", theme_en: "" };
  const state = { activities: [], months: [month], stamps: {}, entries: {}, justStamped: null };
  const html = monthPageHTML(state, month);
  assert.ok(html.includes('<div class="mhead">'), "月份頁的 .mhead 不帶 solo");
  assert.ok(!html.includes('<div class="mhead solo">'), "月份頁不准出現 mhead solo");
});

test(".hint 仍然是待補文案的佔位字，不是自己編的成品文案", () => {
  const html = guideCardsHTML();
  assert.equal((html.match(/【待補文案】/g) || []).length, 3, "三張卡都還沒有正式文案");
});

test("說明頁用的是 .slot 而不是可點的 button", () => {
  const html = guidePageHTML();
  assert.ok(html.includes('<div class="slot">'), "三張卡是 div，不可點");
  assert.ok(!html.includes('data-act="open"'), "說明頁不該有蓋章入口");
  assert.ok(html.includes('<div class="slots guide">'),
    "說明頁的 .slots 要帶 guide 修飾詞，桌機的 min-height 靠它拿掉");
});

test("翻到說明頁時 bookHTML 畫的是說明頁", () => {
  assert.ok(bookHTML(S(1)).includes(guideCardsHTML()));
});

test("引導頁與說明頁用的是同一份三張卡", () => {
  // 兩處各自寫一份文案的話，改了一邊忘了另一邊是遲早的事，
  // 而那時候護照會對同一件事講兩種說法。
  const cards = guideCardsHTML();
  assert.ok(introHTML().includes(cards), "引導頁要包含那三張卡");
  assert.ok(guidePageHTML().includes(cards), "說明頁要包含那三張卡");
});

test("引導頁有一顆送出鍵，而且只有一顆", () => {
  const html = introHTML();
  assert.equal((html.match(/data-act="intro-done"/g) || []).length, 1);
});
