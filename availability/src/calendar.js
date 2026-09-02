// 從看板的一格產生「加到 Google 日曆」的連結，以及可以複製的各地時間。
// 純函式，不碰 DOM 也不碰網路。
import { partsIn, addDays, toInstant, weekdayOf } from "./tz.js";

// 預設一小時，不是一格的半小時（使用者 2026-09-02 裁定）。
// 三十個人的會不會只開半小時，而**調短比調長容易** ——
// 使用者在 Google 日曆裡把一小時縮成半小時是拖一下，反過來是重新想一次。
export const DEFAULT_MINUTES = 60;
export const DEFAULT_TITLE = "BT 會議";

// 看板上第 col 欄、minute 分的那一格，對應到哪個真實瞬間。
//
// ⚠ **weekStart 帶進來，不要在這裡自己算「本週」。**
// 使用者可能是在翻週的時候點的（規格 §4-3 A 有前後翻週），
// 而 weekStart 已經反映了他當下看的那一週。
// 自己算本週的話，他在下一週點的格子會建出這一週的事件 ——
// 而那個事件看起來完全正常，只是日期錯了一週。
export function cellInstant(weekStart, col, minute, viewerTz) {
  const p = partsIn(weekStart, viewerTz);
  const d = addDays(p.year, p.month, p.day, col);
  return toInstant(d.year, d.month, d.day, Math.floor(minute / 60), minute % 60, viewerTz);
}

const two = n => String(n).padStart(2, "0");
// Google 日曆要的是 YYYYMMDDTHHMMSSZ（UTC）。
function stamp(date) {
  return date.getUTCFullYear() + two(date.getUTCMonth() + 1) + two(date.getUTCDate())
       + "T" + two(date.getUTCHours()) + two(date.getUTCMinutes()) + "00Z";
}

// 加到 Google 日曆的連結。
//
// **時間用 UTC 瞬間送出去（結尾的 Z）。** 那是「絕對的那一刻」，
// Google 會用建立者自己日曆的時區顯示，其他人收到邀請也會自動換算成他們的 ——
// 正好就是使用者要的「用點下去那個人自己的時區」。
// 不傳 ctz：帶 Z 的時間已經沒有歧義，再傳一個時區只會多一個可能矛盾的來源。
//
// **主辦人就是點下去的那個人**，所以這裡不帶任何與會者。
// 看板不知道誰該主辦，它只知道誰有空；邀請誰由他自己在日曆裡決定。
// ⚠ **dates 那一段的斜線刻意不編碼**，所以它不能走 URLSearchParams。
// URLSearchParams 會把 / 編成 %2F。那按規範應該也解得回來，但
// 2026-09-02 我沒有辦法端到端驗證：未登入時 Google 會把 render 端點導到行銷頁，
// 而我沒有使用者的 Google 帳號。**驗不到的時候選有把握的那個形式** ——
// Google 自己的文件與外面所有的例子都是不編碼的斜線。
// text 與 details 仍然要編碼（會有中文與空白）。
export function googleCalUrl(start, minutes, title, details) {
  const end = new Date(start.getTime() + (minutes || DEFAULT_MINUTES) * 60000);
  const parts = [
    "action=TEMPLATE",
    "text=" + encodeURIComponent((title || "").trim() || DEFAULT_TITLE),
    "dates=" + stamp(start) + "/" + stamp(end),
  ];
  if (details) parts.push("details=" + encodeURIComponent(details));
  return "https://calendar.google.com/calendar/render?" + parts.join("&");
}

const DAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];

// 那一格在每個時區的當地時間，一行一個，可以整段複製到群組裡。
// zones 是 IANA 名稱的陣列（呼叫端自己去重與排序）。
export function localTimesText(instant, zones, labelOf) {
  return zones.map(tz => {
    const p = partsIn(instant, tz);
    const wd = weekdayOf(p.year, p.month, p.day);
    const name = labelOf ? labelOf(tz) : tz;
    return `${name}　${p.month}/${p.day}（${DAY_ZH[wd]}）${two(p.hour)}:${two(p.minute)}`;
  });
}
