// 里程碑的狀態計算。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { milestoneState } from "../src/ui.js";

const MS = [
  { id: "m22", threshold: 22, title_zh: "二十二", title_en: "TBD", description: "d" },
  { id: "m05", threshold: 5,  title_zh: "五",     title_en: "TBD", description: "d" },
  { id: "m33", threshold: 33, title_zh: "三十三", title_en: "TBD", description: "d" },
  { id: "m11", threshold: 11, title_zh: "十一",   title_en: "TBD", description: "d" }
];
const stateWith = n => ({
  milestones: MS,
  stamps: Object.fromEntries(Array.from({ length: n }, (_, i) => [`a${i}`, { date: "2026-09-01" }]))
});

test("list 依 threshold 排序，不管進來的順序", () => {
  assert.deepEqual(milestoneState(stateWith(0)).list.map(m => m.threshold), [5, 11, 22, 33]);
});

test("邊界：0 / 4 / 5 / 32 / 33 / 34 個章", () => {
  const cases = [
    [0,  0, 5,  5],
    [4,  0, 5,  1],
    [5,  1, 11, 6],
    [32, 3, 33, 1],
    [33, 4, null, 0],
    [34, 4, null, 0]
  ];
  for (const [done, reachedN, nextThreshold, remaining] of cases) {
    const s = milestoneState(stateWith(done));
    assert.equal(s.done, done, `done=${done}`);
    assert.equal(s.reached.length, reachedN, `done=${done} 的 reached`);
    assert.equal(s.next ? s.next.threshold : null, nextThreshold, `done=${done} 的 next`);
    assert.equal(s.remaining, remaining, `done=${done} 的 remaining`);
  }
});

test("剛好達到門檻算達成，不是超過才算", () => {
  // 5 個章要解鎖門檻 5 的那個。差一個字就差一整個里程碑。
  assert.equal(milestoneState(stateWith(5)).reached.length, 1);
  assert.equal(milestoneState(stateWith(4)).reached.length, 0);
});

test("milestones 是空陣列時不炸 —— 那是容錯路徑的實際表現", () => {
  // data.js 在 milestones 查詢失敗時回空陣列（護照其餘部分照常）。
  // 這條測的就是那個狀態下的計算結果，不是假設。
  const s = milestoneState({ milestones: [], stamps: { a: {} } });
  assert.deepEqual(s.list, []);
  assert.deepEqual(s.reached, []);
  assert.equal(s.next, null);
  assert.equal(s.remaining, 0);
  assert.equal(s.done, 1);
});

test("milestones 是 undefined 時也不炸", () => {
  // 未登入的早期 return 若漏了 milestones、或呼叫端傳了舊形狀的 state。
  const s = milestoneState({ stamps: {} });
  assert.deepEqual(s.list, []);
  assert.equal(s.next, null);
});
