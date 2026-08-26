// 月份頁右上角。theme_zh 改放時間數字（07:00），theme_en 改成空字串。
// 跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { monthPageHTML, idPageHTML } from "../src/ui.js";

// 沒有既有的 state 工廠可沿用（原本是單一個 const 物件），這裡把它改成
// 每次呼叫回傳新物件的工廠，讓後面新增的測試可以用 S()。
function S() {
  return { activities: [], months: [], stamps: {}, entries: {}, justStamped: null,
            profile: { id: "00000000-0000-0000-0000-000000000000", name_zh: "王小明",
                       name_en: "Ming Wang", team: "Sponsorship Team", issued: "2026-08-22" } };
}

test("theme_en 是空字串時不產生 span", () => {
  // 版面上這個 span 是零高度的（2026-08-22 實測，見 spec §5.2），所以這條規則
  // 跟版面無關 —— 它是為了不要在 DOM 裡留一個永遠是空的元素，
  // 讓下一個人以為是渲染壞掉然後去「修」它。
  const html = monthPageHTML(S(), { seq: 1, month: 9, theme_zh: "07:00", theme_en: "" });
  assert.ok(html.includes("07:00"));
  assert.ok(!html.includes("<span></span>"), "不准留空的 span");
});

test("theme_en 有值時照樣渲染", () => {
  const html = monthPageHTML(S(), { seq: 1, month: 9, theme_zh: "開學", theme_en: "FIRST WEEK" });
  assert.ok(html.includes("<span>FIRST WEEK</span>"));
});

test("月份頁的 .mtheme 帶 clock，資料頁的不帶", () => {
  // 放大只能掛在修飾 class 上。直接改 .mtheme b 的話，資料頁右上角的
  // 「BEYOND TAIWAN」會跟著變 34px，把版面撐爆。
  const month = monthPageHTML(S(), { seq: 1, month: 9, theme_zh: "07:00", theme_en: "" });
  assert.ok(month.includes('class="mtheme clock"'));
  const id = idPageHTML(S());
  assert.ok(id.includes('class="mtheme"'), "資料頁仍是沒有修飾的 .mtheme");
  assert.ok(!id.includes("clock"), "資料頁不准帶 clock");
});

test("theme_zh 與 theme_en 都空的時候，整個 .mtheme 不渲染", () => {
  const html = monthPageHTML(S(), { month: 9, theme_zh: "", theme_en: "" });
  assert.ok(!html.includes("mtheme"), "不要在 DOM 裡留一個永遠是空的元素");
  assert.ok(html.includes("九月"), "月名還在");
});

test("theme_zh 還有值的時候照舊渲染", () => {
  const html = monthPageHTML(S(), { month: 9, theme_zh: "07:00", theme_en: "" });
  assert.ok(html.includes('class="mtheme clock"'));
  assert.ok(html.includes("07:00"));
});
