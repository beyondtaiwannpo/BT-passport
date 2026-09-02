// 從看板的一格產生日曆連結與各地時間。
import { test } from "node:test";
import assert from "node:assert/strict";
import { cellInstant, googleCalUrl, localTimesText, DEFAULT_MINUTES, DEFAULT_TITLE } from "../availability/src/calendar.js";
import { startOfWeek, partsIn } from "../availability/src/tz.js";

const DET = "America/Detroit", TPE = "Asia/Taipei";
const wk = iso => startOfWeek(new Date(iso), DET, 1);

// ★ 使用者 2026-09-02 特別提醒的：使用者可能在翻週的時候點。
// 自己算「本週」的話，他在下一週點的格子會建出這一週的事件 ——
// 而那個事件看起來完全正常，只是日期錯了一週。
test("★ 事件落在他當下看的那一週，不是本週", () => {
  const a = cellInstant(wk("2026-09-02T12:00:00Z"), 0, 19 * 60, DET);
  const b = cellInstant(wk("2026-09-09T12:00:00Z"), 0, 19 * 60, DET);
  assert.equal(a.toISOString(), "2026-08-31T23:00:00.000Z", "本週的星期一");
  assert.equal(b.toISOString(), "2026-09-07T23:00:00.000Z", "下一週的星期一");
  assert.equal(b.getTime() - a.getTime(), 7 * 86400000, "兩者剛好差七天");
});

test("第幾欄就是那一週的第幾天（0 = 星期一）", () => {
  const ws = wk("2026-09-02T12:00:00Z");
  for (const col of [0, 3, 6]) {
    const p = partsIn(cellInstant(ws, col, 12 * 60, DET), DET);
    const s = partsIn(ws, DET);
    const days = Math.round((Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(s.year, s.month - 1, s.day)) / 86400000);
    assert.equal(days, col, `第 ${col} 欄應該是週起點之後第 ${col} 天`);
  }
});

test("連結的時間是 UTC 瞬間，長度預設一小時", () => {
  const inst = cellInstant(wk("2026-09-02T12:00:00Z"), 0, 19 * 60, DET);
  const url = googleCalUrl(inst, DEFAULT_MINUTES, "");
  assert.ok(url.includes("dates=20260831T230000Z/20260901T000000Z"),
    "起訖不對，或者斜線被編碼了：" + url);
  assert.equal(DEFAULT_MINUTES, 60, "預設一小時 —— 調短比調長容易");
});

// URLSearchParams 會把斜線編成 %2F。那按規範應該解得回來，
// 但沒有辦法端到端驗證，所以選 Google 文件與所有例子用的那個形式。
test("★ dates 的斜線不准被編碼成 %2F", () => {
  const url = googleCalUrl(new Date("2026-09-01T00:00:00Z"), 60, "x");
  assert.ok(!url.includes("%2F"), "斜線被編碼了");
  assert.ok(url.includes("Z/2026"), "起訖之間應該是一個裸的斜線");
});

test("標題預設 BT 會議，但傳什麼就用什麼", () => {
  const inst = new Date("2026-09-01T00:00:00Z");
  assert.ok(googleCalUrl(inst, 60, "").includes("text=" + encodeURIComponent(DEFAULT_TITLE)));
  assert.ok(googleCalUrl(inst, 60, "   ").includes("text=" + encodeURIComponent(DEFAULT_TITLE)),
    "只有空白也算沒填 —— 空白標題的事件很難看");
  assert.ok(googleCalUrl(inst, 60, "課程組會議").includes(encodeURIComponent("課程組會議")));
});

test("中文標題有被編碼（不然網址會壞）", () => {
  const url = googleCalUrl(new Date("2026-09-01T00:00:00Z"), 60, "BT 會議");
  assert.ok(!/[一-鿿]/.test(url), "網址裡出現了沒編碼的中文");
});

// 不帶與會者是刻意的：看板不知道誰該主辦，它只知道誰有空。
test("連結不帶任何與會者", () => {
  const url = googleCalUrl(new Date("2026-09-01T00:00:00Z"), 60, "x");
  for (const bad of ["add=", "attendee", "guest"])
    assert.ok(!url.includes(bad), `連結帶了 ${bad} —— 主辦與邀請誰由那個人自己決定`);
});

test("各地時間一行一個，帶星期，跨日看得出來", () => {
  const inst = cellInstant(wk("2026-09-02T12:00:00Z"), 0, 19 * 60, DET);
  const lines = localTimesText(inst, [DET, TPE], null);
  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes("8/31（一）19:00"), "美東那一行不對：" + lines[0]);
  assert.ok(lines[1].includes("9/1（二）07:00"),
    "台北那一行不對 —— 跨日的時候日期與星期都要跟著變：" + lines[1]);
});

test("labelOf 傳進來的話用它，沒傳就顯示 IANA 名稱", () => {
  const inst = new Date("2026-09-01T00:00:00Z");
  assert.ok(localTimesText(inst, [TPE], null)[0].startsWith("Asia/Taipei"));
  assert.ok(localTimesText(inst, [TPE], () => "台北")[0].startsWith("台北"));
});
