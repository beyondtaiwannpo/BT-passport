// 時區運算。**這一份是整個看板最容易做錯的地方**（規格 §5）。
//
// 底下 partsIn / offsetOf / toInstant 三支是規格 §5-3 的程式碼**逐字沿用**，
// 它已經在 BT-Scheduler 上線驗證過，包含美國春季 DST 那天不存在的
// 02:00–02:59 會自動收合。**不要自己重寫，也不要引進 moment 或 dayjs。**
// 需要新功能就在下面加，不要動這三支。

export function partsIn(date, tz){
  const f = new Intl.DateTimeFormat("en-US",{timeZone:tz,hour12:false,
    year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",second:"2-digit"});
  const p = {};
  for (const x of f.formatToParts(date)) if (x.type!=="literal") p[x.type]=+x.value;
  if (p.hour === 24) p.hour = 0;
  return p;
}
export function offsetOf(date, tz){
  const p = partsIn(date, tz);
  return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second) - date.getTime();
}
export function toInstant(y,m,d,h,mi,tz){
  const guess = Date.UTC(y,m-1,d,h,mi);
  const o1 = offsetOf(new Date(guess), tz);
  let t = guess - o1;
  const o2 = offsetOf(new Date(t), tz);
  if (o2 !== o1) t = guess - o2;   // 跨越 DST 邊界時修正
  return new Date(t);
}

// ── 以下是看板自己的東西 ────────────────────────────────────────────

// 某年某月某日是星期幾（0 = 星期日，跟 Date.getDay() 一致，也跟資料庫
// availability.weekday 的定義一致 —— 那一欄的註解寫著同一句話）。
//
// ⚠ 這段註解 2026-09-02 改過，舊版是錯的。
// 舊版寫「不能用 new Date(y,m,d).getDay()，那會吃執行環境的時區」——
// **那句話不成立**：那樣建的是當地的零點、讀的也是當地星期，任何時區都回同一個答案。
// 反向驗證時把實作換成那個寫法，測試全綠，我一開始以為是測試不夠嚴，
// 其實是註解在說一件沒發生的事。
//
// 真正的陷阱是**混用**：用 Date.UTC 建、卻用 .getDay()（當地）讀，
// 或者反過來。在 UTC 以西的地方 new Date(Date.UTC(2026,2,1)).getDay() 會是星期六。
// 這裡兩邊都用 UTC，所以是純曆法運算，跟任何時區無關。
// test/tz.test.mjs 那條子行程測試守的就是「換任何時區都回同一個答案」。
export function weekdayOf(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// 曆法加減天數，會自動跨月跨年。
export function addDays(y, m, d, n) {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

// 某個瞬間所在那一週的第一天，在 tz 當地的凌晨零點，回傳那個瞬間。
// firstWeekday 預設 0（星期日）。
export function startOfWeek(date, tz, firstWeekday = 0) {
  const p = partsIn(date, tz);
  const wd = weekdayOf(p.year, p.month, p.day);
  const back = (wd - firstWeekday + 7) % 7;
  const s = addDays(p.year, p.month, p.day, -back);
  return toInstant(s.year, s.month, s.day, 0, 0, tz);
}

// 一個「每週固定」的時段，在某一週裡對應到哪些真實瞬間。
//
// **為什麼回傳陣列**：一個時段有可能落在觀看者這一週之外。
// 主人的時區跟觀看者差半天以上的時候，主人的「週日 00:00」在觀看者的曆上
// 可能是上一週的星期六 —— 那時候這個函式回空陣列，那一格就不該畫。
// 正常情況回一個。
//
// **DST 那兩天實際會發生什麼（2026-09-02 對 America/Detroit 實測，不是推論）：**
//   春季（2026-03-08）不存在的 02:30 → **不是回零個**，是被 toInstant 收合到
//     跟 01:30 同一個瞬間。後果：一個人如果同時填了 01:30 與 02:30，
//     那一天這兩格會疊在同一格上。
//   秋季（2026-11-01）重複的 01:30 → **只回一個**（第一次那個），不是兩個。
// 規格 §5-4 明說這兩天「不用特殊處理，但要知道會發生，不要當成 bug」，
// 所以這裡刻意不修 —— 但上面那兩句必須寫實際結果，不能寫「應該會怎樣」。
// test/tz.test.mjs 有兩條把這個實測行為釘住，哪天 toInstant 換了實作會變紅。
//
// weekStart 是**觀看者**那一週的起點（見 startOfWeek）；
// weekday/minute/tz 是**這個時段的主人**的，三者必須一起用 ——
// 主人的星期幾要用主人的時區去解讀，這正是 §5-4 說的「星期會錯位」。
export function slotInstants(weekStart, weekday, minute, tz) {
  const out = [];
  const end = weekStart.getTime() + 7 * 24 * 3600 * 1000;
  // 從觀看者週起點的前一天掃到後八天：主人的時區可能比觀看者早或晚一整天，
  // 前後各多掃一天才不會漏掉邊界上的那一格。
  const p = partsIn(new Date(weekStart.getTime() - 24 * 3600 * 1000), tz);
  for (let i = 0; i <= 9; i++) {
    const d = addDays(p.year, p.month, p.day, i);
    if (weekdayOf(d.year, d.month, d.day) !== weekday) continue;
    const inst = toInstant(d.year, d.month, d.day, Math.floor(minute / 60), minute % 60, tz);
    if (inst.getTime() >= weekStart.getTime() && inst.getTime() < end) out.push(inst);
  }
  return out;
}

// 一個真實瞬間落在觀看者的哪一格。回 null 代表不在這一週裡。
// dayIndex 是「這一週的第幾欄」（0 起算），不是星期幾 ——
// 週的第一天是哪一天由 startOfWeek 的 firstWeekday 決定，這裡不重複那個決定。
//
// 只用「差幾天」判斷在不在這一週，**不另外比毫秒範圍**。
// 第一版兩個都寫了，反向驗證時把毫秒那條拿掉是全綠的 —— 因為 days 那條已經
// 蓋住了同樣的輸入。而且毫秒那條在 DST 那兩週其實是錯的定義：當地的一週在
// 春季是 167 小時、秋季是 169 小時，不是固定的 7×24。欄位屬於哪一天才是這裡
// 要回答的問題，所以留下正確的那一條，刪掉多餘的那一條。
export function cellOf(instant, weekStart, viewerTz, slotMinutes = 30) {
  const s = partsIn(weekStart, viewerTz);
  const p = partsIn(instant, viewerTz);
  const days = Math.round(
    (Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(s.year, s.month - 1, s.day)) / 86400000);
  if (days < 0 || days > 6) return null;
  const minute = p.hour * 60 + p.minute;
  return { dayIndex: days, minute: Math.floor(minute / slotMinutes) * slotMinutes };
}

// 瀏覽器猜到的時區。猜不到就回 null —— **不要退回一個預設值**。
// 預設值會把一個在密西根的人安靜地畫到台北的時間上，而畫面看起來完全正常。
export function detectTz() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || null;
  } catch (e) { return null; }
}

// 這個時區在某個瞬間的 UTC 偏移，給畫面顯示用（例如「UTC+8」）。
export function offsetLabel(date, tz) {
  const min = Math.round(offsetOf(date, tz) / 60000);
  const sign = min < 0 ? "-" : "+";
  const a = Math.abs(min);
  return "UTC" + sign + String(Math.floor(a / 60)) + (a % 60 ? ":" + String(a % 60).padStart(2, "0") : "");
}
