// 城市分配（spec §三 分配規則、§9.9）。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { visasOf } from "../src/ui.js";

const MONTHS = [9,10,11,12,1,2,3,4,5,6,7].map((month, seq) => ({ seq, month }));
const DEST = ["TPE TAIPEI","LAX LOS ANGELES","JFK NEW YORK","BNA NASHVILLE","MSN MADISON",
  "SFO SAN FRANCISCO","SEA SEATTLE","ORD CHICAGO","BOS BOSTON","BWI BALTIMORE",
  "PHL PHILADELPHIA","SAN SAN DIEGO","ROC ROCHESTER","IND INDIANAPOLIS","CLT CHARLOTTE",
  "SLC SALT LAKE CITY","YVR VANCOUVER","YYZ TORONTO","BRU BRUSSELS","AMS AMSTERDAM",
  "LHR LONDON","NRT TOKYO","ICN SEOUL","SYD SYDNEY"]
  .map(s => ({ code: s.slice(0,3), city: s.slice(4), active: true }));

const A = "3f1c9a20-0b7e-4d55-9a11-8c2e6f4b7d01";
const B = "a7e4b108-52dc-41f9-8f30-1d6c9b2e5a44";
const S = (id, visas = {}, dest = DEST) =>
  ({ months: MONTHS, destinations: dest, visas, profile: { id } });
const codes = d => MONTHS.map(m => d[m.month] && d[m.month].code);

test("九月一律是 TPE —— 每本護照都從台灣出發", () => {
  assert.equal(visasOf(S(A))[9].code, "TPE");
  assert.equal(visasOf(S(B))[9].code, "TPE");
});

test("十一個月全部分到，而且不重複", () => {
  const c = codes(visasOf(S(A)));
  assert.equal(c.filter(Boolean).length, 11);
  assert.equal(new Set(c).size, 11, "同一本護照不准出現兩次同一個城市");
});

test("同一個人算幾次都一樣", () => {
  assert.deepEqual(codes(visasOf(S(A))), codes(visasOf(S(A))), "不准用 Math.random()");
});

test("不同人拿到不同的組合", () => {
  assert.notEqual(codes(visasOf(S(A))).join(), codes(visasOf(S(B))).join());
});

test("存下來的城市贏過即時算 —— 這是整張表存在的理由", () => {
  const d = visasOf(S(A, { 3: "SYD" }));
  assert.equal(d[3].code, "SYD");
  assert.equal(d[3].city, "SYDNEY", "code 要換回完整的城市名");
});

test("池子加了新城市之後，存下來的月份不受影響", () => {
  const before = visasOf(S(A));
  const stored = { 9: before[9].code, 10: before[10].code, 11: before[11].code };
  const bigger = [...DEST, { code: "CDG", city: "PARIS", active: true },
                           { code: "SIN", city: "SINGAPORE", active: true }];
  const after = visasOf(S(A, stored, bigger));
  assert.equal(after[9].code,  stored[9]);
  assert.equal(after[10].code, stored[10]);
  assert.equal(after[11].code, stored[11]);
});

test("即時算的月份要避開已經存下來的城市", () => {
  // 把一個「本來會被算給別的月份」的城市，硬存給三月
  const live = visasOf(S(A));
  const victim = live[7].code;          // 七月本來會拿到的
  const d = visasOf(S(A, { 3: victim }));
  const c = codes(d);
  assert.equal(new Set(c).size, 11, "存下來的城市不准又被算給另一個月");
  assert.equal(d[3].code, victim);
});

test("九月已經存了別的城市時，TPE 不會再被硬塞給九月", () => {
  const d = visasOf(S(A, { 9: "LHR" }));
  assert.equal(d[9].code, "LHR");
  assert.equal(new Set(codes(d)).size, 11);
});

test("active=false 的目的地不進池子，但已經存下來的仍然顯示得出來", () => {
  const dest = DEST.map(d => d.code === "LHR" ? { ...d, active: false } : d);
  assert.ok(!codes(visasOf(S(A, {}, dest))).includes("LHR"), "停用的不再被抽到");
  assert.equal(visasOf(S(A, { 5: "LHR" }, dest))[5].code, "LHR",
    "已經發出去的章不能因為城市停用就消失");
});

test("池子是空的時候回空物件，不炸也不假裝有章", () => {
  assert.deepEqual(visasOf({ months: MONTHS, destinations: [], visas: {}, profile: { id: A } }), {});
});

test("池子不夠十一個的時候，只分配得出來的那幾個月", () => {
  const d = visasOf(S(A, {}, DEST.slice(0, 4)));
  assert.equal(Object.keys(d).length, 4);
  assert.equal(d[9].code, "TPE");
});

// 「不同人拿到不同的組合」上面已經有一條，但它只比兩個人 —— 那條在雜湊嚴重偏斜
// 的時候照樣會過。2026-08-26 實測：原本的 FNV-1a 讓 3000 個 uuid 只產生 1149 種
// 組合（1826 個重複），而 23 選 10 有 4.1×10¹² 種排列。
//
// 原因是 FNV-1a 的結構：h = (h ^ c) * p，而字元只有 7 bit，XOR 只動低位。
// 三個字元的 code 跑完之後，各城市雜湊值的差異主要由 code 決定，種子的影響被壓住，
// 於是大家的順序幾乎一樣。修法是在 hash32 結尾加一段 avalanche。
//
// 這條測試釘的是**種子真的有參與洗牌**，不是「湊巧兩個人不一樣」。
test("兩百個種子要產生接近兩百種組合 —— 種子必須真的參與洗牌", () => {
  const seeds = Array.from({ length: 200 }, (_, i) => {
    const a = String(i).padStart(8, "0");
    const z = String(i * 7919 % 100000000).padStart(12, "0");
    return `${a}-0b7e-4d55-9a11-${z}`;
  });
  const sigs = new Set(seeds.map(id => codes(visasOf(S(id))).join()));
  assert.ok(sigs.size >= 195, `只有 ${sigs.size} / 200 種組合，種子沒有真的參與洗牌`);
});
