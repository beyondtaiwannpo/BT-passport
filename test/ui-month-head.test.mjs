// 月份頁右上角。theme_zh 改放時間數字（07:00），theme_en 改成空字串。
// 跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { monthPageHTML, idPageHTML } from "../passport/src/ui.js";

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

const DEST = [{ code: "TPE", city: "TAIPEI", active: true },
              { code: "SYD", city: "SYDNEY", active: true }];
const M9 = { seq: 0, month: 9, theme_zh: "", theme_en: "" };
const ACTS9 = [
  { id: "09A", month: 9, seq: 1, category: "gather", title_zh: "開學電影夜", title_en: "OPENING NIGHT", description: "說明" },
  { id: "09B", month: 9, seq: 1, category: "prompt", title_zh: "寫給七月的自己", title_en: "LETTER TO JULY", description: "說明" },
  { id: "09C", month: 9, seq: 1, category: "frame",  title_zh: "The Moon",     title_en: "THE MOON",      description: "Shoot it." }
];
// 三格都蓋滿的九月。dates 可以指定每一格的日期，用來驗「取最晚的那一天」。
function full(dates = {}) {
  const stamps = {};
  ACTS9.forEach(a => { stamps[a.id] = { date: dates[a.id] || "2026-09-05" }; });
  return { ...S(), months: [M9], activities: ACTS9, destinations: DEST, visas: {}, stamps };
}

test("蓋滿三格的月份有入境章，帶城市、代碼與日期", () => {
  const html = monthPageHTML(full(), M9);
  assert.ok(html.includes("IMMIGRATION"));
  assert.ok(html.includes("TAIPEI"));
  assert.ok(html.includes("TPE"));
  assert.ok(!html.includes("MONTH CLEARED"), "舊的疊印要整個換掉");
});

test("入境章的日期是三格裡最晚的那一天（spec §9.6）", () => {
  const S9 = full({ "09A": "2026-09-05", "09B": "2026-09-30", "09C": "2026-09-12" });
  assert.ok(monthPageHTML(S9, M9).includes("2026.09.30"));
});

test("章上的城市是存下來的那一個，不是即時算的", () => {
  const S9 = { ...full(), visas: { 9: "SYD" } };
  const html = monthPageHTML(S9, M9);
  assert.ok(html.includes("SYDNEY"));
  assert.ok(!html.includes("TAIPEI"));
});

test("沒有活動的月份不會拿到入境章 —— 空集合的守衛", () => {
  assert.ok(!monthPageHTML({ ...full(), activities: [] }, M9).includes("IMMIGRATION"));
});

test("沒蓋滿就沒有章", () => {
  const S9 = full(); delete S9.stamps["09C"];
  assert.ok(!monthPageHTML(S9, M9).includes("IMMIGRATION"));
});

test("那個月分配不到城市的時候不渲染章，也不產生空的框", () => {
  assert.ok(!monthPageHTML({ ...full(), destinations: [], visas: {} }, M9).includes("estamp"));
});

test("資料頁的 FULL 疊印還是用 .overprint，沒有被入境章連累", () => {
  // .overprint 是一行文字的疊印，資料頁的「33 / 33 · FULL」還在用它。
  // 入境章開新的 .estamp 就是為了不動到它（spec §9.2）。
  const s = S(); s.activities = ACTS9;
  s.stamps = { "09A": { date: "x" }, "09B": { date: "x" }, "09C": { date: "x" } };
  const html = idPageHTML(s);
  assert.ok(html.includes("overprint"), "資料頁的 FULL 仍然是 .overprint");
  assert.ok(!html.includes("estamp"), "資料頁不該出現入境章");
});

test("入境章不用 .overprint，兩者是不同的元件", () => {
  const html = monthPageHTML(full(), M9);
  assert.ok(html.includes("estamp"));
  assert.ok(!html.includes("overprint"), "月份頁不該再有 .overprint");
});
