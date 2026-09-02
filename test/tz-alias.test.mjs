// 時區別名表。規格 §5-4：至少要蓋住 destinations 那 24 個城市。
// 跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { searchTz, labelOf, TZ_ALIAS } from "../availability/src/tz-alias.js";

// 名單直接從 migration 檔讀出來，不在測試裡再抄一份 ——
// 抄一份的話那份會跟資料庫漂移，而漂移的那天這條測試仍然全綠。
function destinationCities() {
  const sql = readFileSync("supabase/migrations/2026-08-26-destinations.sql", "utf8");
  const rows = [...sql.matchAll(/\(\s*'([A-Z]{3})'\s*,\s*'([^']+)'/g)];
  return rows.map(m => ({ code: m[1], city: m[2] }));
}

test("讀得到 destinations 的名單（沒讀到的話下面那條會假通過）", () => {
  const cities = destinationCities();
  assert.ok(cities.length >= 20, `只讀到 ${cities.length} 個城市，解析大概壞了`);
});

// ★ 規格 §5-4。小城市正是使用者最猜不到自己該選哪個 IANA 時區的情況。
test("★ destinations 的每一個城市都搜得到時區", () => {
  const missing = [];
  for (const { code, city } of destinationCities())
    if (searchTz(city).length === 0) missing.push(`${code} ${city}`);
  assert.deepEqual(missing, [],
    `這幾個城市在別名表裡找不到，那裡的幹部只能自己猜 IANA 名稱：${missing.join("、")}`);
});

test("每一筆別名都有中英文各至少一個，而且 tz 是 IANA 形狀", () => {
  for (const e of TZ_ALIAS) {
    assert.ok(e.zh.length > 0, `${e.tz} 沒有中文別名`);
    assert.ok(e.en.length > 0, `${e.tz} 沒有英文別名`);
    assert.match(e.tz, /^[A-Za-z_]+\/[A-Za-z_\/]+$/, `${e.tz} 不像 IANA 名稱`);
  }
});

test("別名表裡的每個時區，Intl 都真的認得", () => {
  for (const e of TZ_ALIAS)
    assert.doesNotThrow(() => new Intl.DateTimeFormat("en-US", { timeZone: e.tz }),
      `${e.tz} 這個時區 Intl 不認得 —— 打錯字了`);
});

test("同一個 IANA 時區不准出現兩列", () => {
  const seen = new Set();
  for (const e of TZ_ALIAS) {
    assert.ok(!seen.has(e.tz), `${e.tz} 出現了兩次，搜尋只會回第一列`);
    seen.add(e.tz);
  }
});

test("搜尋不分大小寫與空白", () => {
  for (const q of ["Ann Arbor", "ann arbor", "ANNARBOR", "annarbor"])
    assert.equal(searchTz(q)[0]?.tz, "America/Detroit", `「${q}」搜不到`);
});

// 不做模糊比對是刻意的：選錯時區的後果是他整週的時間都畫在錯的地方，
// 而畫面上看起來完全正常。寧可搜不到讓他再打一次。
test("不做模糊比對 —— 東京不會搜出京都", () => {
  const tokyo = searchTz("東京").map(x => x.tz);
  assert.deepEqual(tokyo, ["Asia/Tokyo"]);
  assert.equal(searchTz("完全不存在的地方").length, 0);
});

test("labelOf 查不到就原樣回那個名稱，不回空字串", () => {
  assert.equal(labelOf("America/Detroit"), "底特律 / Detroit");
  assert.equal(labelOf("Antarctica/Troll"), "Antarctica/Troll");
});
