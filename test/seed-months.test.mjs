// seed.sql 的 months 必須跟目前的設計一致。
//
// 2026-09-02：這個檔案掛了兩週。2026-08-26 把 theme_zh 全部清空（spec
// 2026-08-26-entry-stamp-design.md），改了正式資料庫與前端，**沒有改 seed.sql**。
// 危害不只是「拿它建新資料庫會不一樣」—— seed.sql 那段有
// `on conflict (seq) do update set theme_zh = excluded.theme_zh`，
// 所以重跑一次就會把時刻塞回正式資料庫，而且不會有任何錯誤。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const seed = readFileSync("supabase/seed.sql", "utf8");
// 只取 insert into months 那一段，不要掃到別的表。
const block = seed.slice(seed.indexOf("insert into months"),
                         seed.indexOf(";", seed.indexOf("insert into months")));

test("讀得到 months 那一段（讀不到的話下面兩條會假通過）", () => {
  assert.ok(block.includes("insert into months"), "找不到那段 insert");
  const rows = [...block.matchAll(/\(\s*\d+,\s*\d+,/g)];
  assert.equal(rows.length, 11, `解析到 ${rows.length} 列，應該是 11 列`);
});

test("★ theme_zh 與 theme_en 都是空字串", () => {
  const rows = [...block.matchAll(/\(\s*(\d+),\s*(\d+),\s*'([^']*)',\s*'([^']*)'\s*\)/g)];
  assert.equal(rows.length, 11, "十一列都要對得上這個形狀");
  for (const [, seq, , zh, en] of rows) {
    assert.equal(zh, "", `seq ${seq} 的 theme_zh 是 "${zh}"，應該是空的`);
    assert.equal(en, "", `seq ${seq} 的 theme_en 是 "${en}"，應該是空的`);
  }
});

// 前端那一行是 `${m.theme_zh ? ... : ""}` —— 空字串就整塊不渲染。
// 這一條守的是「兩邊講的是同一件事」。
test("前端仍然是「空的就不渲染」，跟 seed 的空字串對得上", () => {
  const ui = readFileSync("passport/src/ui.js", "utf8");
  assert.match(ui, /\$\{m\.theme_zh \?/,
    "月份頁不再用 theme_zh 判斷了 —— 那 seed 該放什麼要重新想一次");
});
