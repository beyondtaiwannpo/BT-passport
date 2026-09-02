// 「我的每週時間」的批次填寫。規格 §4-3 B：
// 拖曳塗一百個格子在手機上不可行，已經實測過 —— 所以批次是主要的填法，
// 而主要的填法要有測試。
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRange, copyDay, quickDays, diff, key, groupByWeekday } from "../availability/src/edit.js";

const S = (...ks) => new Set(ks);
const sorted = s => [...s].sort();

test("套一段時間到選中的那幾天", () => {
  const r = applyRange(S(), [1, 3], 19 * 60, 21 * 60, true);
  assert.equal(r.changed, 8, "兩天各四格");
  assert.deepEqual(sorted(r.set), sorted(S(
    key(1, 1140), key(1, 1170), key(1, 1200), key(1, 1230),
    key(3, 1140), key(3, 1170), key(3, 1200), key(3, 1230))));
});

// ★ 左閉右開。使用者講「到 22:00」的意思是 22:00 就結束了；
// 把 22:00 那一格也塗上去等於他被排到 22:30。
test("★ 結束時間那一格不算進去", () => {
  const r = applyRange(S(), [1], 19 * 60, 22 * 60, true);
  assert.ok(r.set.has(key(1, 21 * 60 + 30)), "21:30 應該在裡面");
  assert.ok(!r.set.has(key(1, 22 * 60)), "22:00 不應該在裡面 —— 那會讓他被排到 22:30");
  assert.equal(r.changed, 6);
});

test("再套一次同一段不會重複計數", () => {
  const a = applyRange(S(), [1], 600, 660, true);
  const b = applyRange(a.set, [1], 600, 660, true);
  assert.equal(b.changed, 0, "本來就有的格子不算變動");
  assert.equal(b.set.size, a.set.size);
});

test("拿掉一段只拿掉有的那幾格", () => {
  const a = applyRange(S(), [1], 600, 720, true);   // 4 格
  const b = applyRange(a.set, [1], 630, 900, false);
  assert.equal(b.changed, 3, "只有三格原本是有的");
  assert.deepEqual(sorted(b.set), [key(1, 600)]);
});

test("沒選星期、或起訖顛倒，都不動任何東西", () => {
  const base = S(key(1, 600));
  for (const [wds, f, t] of [[[], 600, 700], [[1], 700, 600], [[1], 600, 600]]) {
    const r = applyRange(base, wds, f, t, true);
    assert.equal(r.changed, 0);
    assert.deepEqual(sorted(r.set), sorted(base));
  }
});

test("原本的 Set 不會被改到", () => {
  const base = S(key(1, 600));
  applyRange(base, [2], 600, 700, true);
  assert.deepEqual(sorted(base), [key(1, 600)], "applyRange 動到了傳進去的那個 Set");
});

// ★ 複製是覆蓋不是疊加。疊加的話使用者沒辦法用它修正，只能越加越多。
test("★ 複製某一天是覆蓋，目標日原本有的會被清掉", () => {
  const base = S(key(1, 600), key(3, 1200));   // 一：10:00　三：20:00
  const r = copyDay(base, 1, [3]);
  assert.ok(r.set.has(key(3, 600)), "星期三應該多出 10:00");
  assert.ok(!r.set.has(key(3, 1200)), "星期三原本的 20:00 應該被清掉 —— 這是覆蓋不是疊加");
  assert.ok(r.set.has(key(1, 600)), "來源日不該被動到");
});

test("複製到自己身上不做事", () => {
  const base = S(key(1, 600));
  const r = copyDay(base, 1, [1]);
  assert.equal(r.changed, 0);
  assert.deepEqual(sorted(r.set), sorted(base));
});

test("快捷選的是對的那幾天（0 是星期日）", () => {
  assert.deepEqual(quickDays("weekday"), [1, 2, 3, 4, 5]);
  assert.deepEqual(quickDays("weekend"), [0, 6]);
  assert.deepEqual(quickDays("all"), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(quickDays("none"), []);
  assert.deepEqual(quickDays("亂打"), [], "不認得的快捷要回空的，不是回全部");
});

// 這一條守的是「手滑按到全部」的後果。回全部的話，一個打錯的參數
// 會把七天整個塗滿，而他要一格一格清掉。
test("平日與週末加起來剛好是全部，沒有重疊也沒有漏", () => {
  const all = [...quickDays("weekday"), ...quickDays("weekend")].sort();
  assert.deepEqual(all, quickDays("all"));
  assert.equal(new Set(all).size, 7);
});

test("差集只送真的變了的那幾格", () => {
  const cur = S(key(1, 600), key(1, 630));
  const want = S(key(1, 630), key(2, 600));
  const d = diff(want, cur);
  assert.deepEqual(d.add, [key(2, 600)]);
  assert.deepEqual(d.del, [key(1, 600)]);
});

test("沒有變動時差集是空的（不會白送一趟請求）", () => {
  const s = S(key(1, 600));
  const d = diff(new Set(s), s);
  assert.deepEqual(d.add, []);
  assert.deepEqual(d.del, []);
});

// weekdays 傳 null / undefined 時不准爆掉。空陣列與起訖顛倒**不需要**特別擋 ——
// for...of 空陣列不會跑、m < to 在顛倒時第一次就不成立。
// 2026-09-02 反向驗證時發現原本那個 if 是在防一件不會發生的事（README 第 12 項）。
test("weekdays 是 null 時安靜地什麼都不做，不丟例外", () => {
  const base = S(key(1, 600));
  for (const bad of [null, undefined]) {
    let r;
    assert.doesNotThrow(() => { r = applyRange(base, bad, 600, 700, true); });
    assert.equal(r.changed, 0);
    assert.deepEqual(sorted(r.set), sorted(base));
  }
});

// 刪除照星期分組：PostgREST 的 or 語法在幾十個條件時會很長。
// 這一段本來埋在 data.js 的 saveMine 裡，要 mock 整個 supabase client 才測得動。
test("刪除照星期分組，一天一批", () => {
  const g = groupByWeekday(["1:600", "1:630", "3:1200", "0:0"]);
  assert.equal(g.size, 3, "三個不同的星期就是三批");
  assert.deepEqual(g.get(1), [600, 630]);
  assert.deepEqual(g.get(3), [1200]);
  assert.deepEqual(g.get(0), [0], "星期日是 0，不能被當成假值漏掉");
});

test("沒有東西要刪的時候是空的，不會送出任何一批", () => {
  assert.equal(groupByWeekday([]).size, 0);
});

// 整週都要刪的話是七批，不是一個超長的請求。
test("整週都刪也只有七批", () => {
  const all = [];
  for (let d = 0; d < 7; d++) for (let m = 0; m < 1440; m += 30) all.push(d + ":" + m);
  const g = groupByWeekday(all);
  assert.equal(g.size, 7);
  assert.equal(g.get(0).length, 48);
});
