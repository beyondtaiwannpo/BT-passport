// 每週時間看板（規格 §4、§5）。
import * as AUTH from "../../shared/auth.js";
import { supabase } from "../../shared/supabase.js";
import * as DATA from "./data.js";
import * as UI from "./ui.js";
import { searchTz } from "./tz-alias.js";
import { applyRange, copyDay, quickDays } from "./edit.js";
import { boardCounts as calcCounts, firstBusyMinute } from "./board.js";
import { cellInstant, googleCalUrl, localTimesText, DEFAULT_TITLE } from "./calendar.js";
import { labelOf } from "./tz-alias.js";
import { startOfWeek, detectTz, partsIn, addDays } from "./tz.js";

const root = () => document.getElementById("bt-root");
const K = DATA.key;

let S = {
  user: null, role: null, myTz: null, down: false, ready: false,
  tab: "board", members: [], slots: new Map(),
  mine: new Set(), saved: new Set(), dirty: false, mineMsg: "",
  weekStart: null, weekOffset: 0,
  chips: new Set(), bfrom: 19 * 60, bto: 22 * 60, copyFrom: 1,
  needNotice: false, needTz: false, tzQuery: "", tzResults: [], tzGuess: null,
  peek: null, peekCell: null, peekLines: [], msg: "", busy: false, boardTop: null,
  evTitle: "", copyMsg: ""
};

// ── 換算：把所有人的時段落到觀看者的格子上 ──────────────────────────

function weekDates() {
  const p = partsIn(S.weekStart, S.myTz);
  return [0, 1, 2, 3, 4, 5, 6].map(i => {
    const d = addDays(p.year, p.month, p.day, i);
    return d.month + "/" + d.day;
  });
}
function weekLabel() {
  const p = partsIn(S.weekStart, S.myTz);
  const e = addDays(p.year, p.month, p.day, 6);
  return `${p.month}/${p.day} – ${e.month}/${e.day}` + (S.weekOffset === 0 ? "（本週）" : "");
}

// ── 畫面 ────────────────────────────────────────────────────────────
function render() {
  const el = root();
  if (!el) return;
  if (S.down) { el.innerHTML = UI.downHTML(); return; }
  if (!S.ready) { el.innerHTML = `<div class="empty">載入中…</div>`; return; }
  if (S.role !== "cadre") { el.innerHTML = UI.notCadreHTML(); return; }
  if (S.needNotice) { el.innerHTML = UI.noticeHTML(S.msg, S.busy); return; }
  if (S.needTz) { el.innerHTML = UI.tzSetupHTML(S.tzGuess, S.tzQuery, S.tzResults, S.msg); return; }

  let inner, label = null;
  if (S.tab === "board") {
    const counts = calcCounts(S.members, S.slots, S.weekStart, S.myTz);
    S.boardTop = firstBusyMinute(counts);
    inner = UI.boardHTML(S, counts, weekDates());
    label = weekLabel();
  }
  else if (S.tab === "mine") inner = UI.mineHTML(S);
  else inner = UI.membersHTML(S, Date.now());
  el.innerHTML = UI.shellHTML(S.tab, inner, label, S.msg);
  if (S.peek) el.insertAdjacentHTML("beforeend", S.peek);
  // 看板一打開停在 00:00，而大家有空的時間多半在傍晚 —— 第一格常常在第 38 列，
  // 也就是容器頂端往下 600 多 px，而容器一次只看得到二十幾列。
  // **格子其實畫出來了，使用者卻看到一片空的凌晨然後以為壞了**（2026-09-02 實際發生）。
  // 所以開起來就捲到第一個有人有空的時刻。整天 24 小時仍然都在，只是不從凌晨開始看。
  if (S.tab === "board" && S.boardTop != null) {
    const g = el.querySelector(".gridwrap");
    if (g) g.scrollTop = Math.max(0, (S.boardTop / 30) * 16 - 32);
  }
}

// ── 啟動 ────────────────────────────────────────────────────────────
async function boot() {
  try {
    const who = await AUTH.currentUserDetailed();
    if (who.offline) { S.down = true; render(); return; }
    S.user = who.user;
    if (!S.user) { location.replace("../app/?next=availability"); return; }

    const { data, error } = await supabase
      .from("profiles").select("role, tz").eq("id", S.user.id).maybeSingle();
    if (error) throw error;
    S.role = data ? data.role : null;
    S.myTz = data ? data.tz : null;
    if (S.role !== "cadre") { S.ready = true; render(); return; }

    const all = await DATA.loadAll();
    S.members = all.members; S.slots = all.slots;
    S.saved = new Set(S.slots.get(S.user.id) || []);
    S.mine = new Set(S.saved);

    const me = S.members.find(m => m.id === S.user.id);
    S.needNotice = !(me && me.noticeSeenAt);
    S.needTz = !S.myTz;
    S.tzGuess = detectTz();
    setWeek(0);
    S.ready = true;
    render();
  } catch (e) {
    console.error("看板載入失敗。真正的原因：", e);
    S.down = true; render();
  }
}
function setWeek(off) {
  S.weekOffset = off;
  const base = new Date(Date.now() + off * 7 * 86400000);
  // firstWeekday = 1：一週從星期一開始，跟畫面欄位一致。
  S.weekStart = startOfWeek(base, S.myTz || "UTC", 1);
}

// ── 事件 ────────────────────────────────────────────────────────────
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;

  if (act === "retry") { location.reload(); return; }
  if (act === "tab") { S.tab = b.dataset.t; S.peek = null; render(); return; }

  if (act === "week") {
    const d = +b.dataset.d;
    // 前後各 4 週（使用者 2026-09-02 裁定）。翻週唯一的作用是看 DST 切換
    // 前後的差別，一年兩次，範圍不需要更大。
    const next = d === 0 ? 0 : Math.max(-4, Math.min(4, S.weekOffset + d));
    // 已經在邊界的話**要說話**，不能按了沒反應 —— 那正是這一頁反覆出現的症狀。
    if (next === S.weekOffset && d !== 0) {
      S.msg = d < 0 ? "只能往前看四週。" : "只能往後看四週。";
      render(); return;
    }
    S.msg = "";
    setWeek(next); render(); return;
  }

  if (act === "notice-ok") {
    // 連點會送出兩次請求。第二次撞主鍵之後現在雖然不會報錯，
    // 但畫面在那兩秒裡完全沒有反應，而「沒有反應」正是這個 bug 的形狀。
    if (S.busy) return;
    S.busy = true; S.msg = ""; render();
    try {
      await DATA.markNoticeSeen(S.user.id);
      S.needNotice = false; S.busy = false; render();
    } catch (err) {
      console.error("記錄告知失敗。真正的原因：", err);
      S.busy = false;
      S.msg = DATA.authMessage(err);
      render();
    }
    return;
  }

  if (act === "tz-pick") {
    // 這一步會打網路。沒有這個 busy 的話，網路慢的時候點下去完全沒反應 ——
    // 跟知情同意那個 bug 是同一個形狀（2026-09-02 順手補的）。
    if (S.busy) return;
    S.busy = true; S.msg = "存起來中…"; render();
    try {
      await DATA.saveTz(S.user.id, b.dataset.tz);
      S.myTz = b.dataset.tz; S.needTz = false; S.msg = ""; S.busy = false;
      setWeek(S.weekOffset); render();
    } catch (err) {
      console.error("設定時區失敗。真正的原因：", err);
      S.busy = false; S.msg = DATA.authMessage(err); render();
    }
    return;
  }
  if (act === "change-tz") { S.needTz = true; S.tzQuery = ""; S.tzResults = []; render(); return; }

  if (act === "chip") {
    const wd = +b.dataset.wd;
    S.chips.has(wd) ? S.chips.delete(wd) : S.chips.add(wd);
    readBatch(); render(); return;
  }
  if (act === "quick") {
    const q = b.dataset.q;
    S.chips = new Set(quickDays(q));
    readBatch(); render(); return;
  }

  if (act === "apply") {
    readBatch();
    if (!S.chips.size) { S.mineMsg = "先選要套用到哪幾天。"; render(); return; }
    if (S.bfrom >= S.bto) { S.mineMsg = "結束時間要比開始時間晚。"; render(); return; }
    const add = b.dataset.mode === "add";
    const r = applyRange(S.mine, [...S.chips], S.bfrom, S.bto, add);
    S.mine = r.set;
    const n = r.changed;
    S.dirty = true;
    S.mineMsg = `${add ? "加了" : "拿掉了"} ${n} 格，記得按儲存。`;
    render(); return;
  }

  if (act === "copyday") {
    readBatch();
    const from = +document.getElementById("copyfrom").value;
    S.copyFrom = from;
    if (!S.chips.size) { S.mineMsg = "先選要複製到哪幾天。"; render(); return; }
    const r = copyDay(S.mine, from, [...S.chips]);
    S.mine = r.set;
    S.dirty = true;
    S.mineMsg = `複製好了，變動 ${r.changed} 格，記得按儲存。`;
    render(); return;
  }

  // 單格微調**不整頁重畫**：336 個格子重畫會讓捲動位置跳掉，
  // 而使用者正在格線中間微調。只改那一顆按鈕的狀態。
  if (act === "toggle") {
    const k = K(+b.dataset.wd, +b.dataset.m);
    const on = !S.mine.has(k);
    on ? S.mine.add(k) : S.mine.delete(k);
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
    S.dirty = true;
    const save = document.querySelector('[data-act="save"]');
    if (save) { save.disabled = false; save.textContent = "儲存"; }
    return;
  }

  if (act === "save") {
    readBatch();
    b.disabled = true; b.textContent = "存檔中…";
    try {
      const r = await DATA.saveMine(S.user.id, S.mine, S.saved);
      S.saved = new Set(S.mine);
      S.slots.set(S.user.id, new Set(S.mine));
      S.dirty = false;
      S.mineMsg = r.add || r.del ? `存好了（+${r.add} / -${r.del}）。` : "沒有變動。";
      const me = S.members.find(m => m.id === S.user.id);
      if (me) me.updatedAt = new Date().toISOString();
    } catch (err) {
      console.error("存檔失敗：", err);
      S.mineMsg = DATA.authMessage(err);
      S.dirty = true;
    }
    render(); return;
  }

  if (act === "confirm-same") {
    // 一樣會打網路，一樣要先講話再等。
    b.disabled = true; b.textContent = "記錄中…";
    try {
      const at = await DATA.confirmUnchanged();
      const me = S.members.find(m => m.id === S.user.id);
      if (me) me.updatedAt = at;
      S.mineMsg = "記下來了，這份時間是最新的。";
    } catch (err) {
      console.error("確認沒變失敗。真正的原因：", err);
      S.mineMsg = DATA.authMessage(err);
    }
    render(); return;
  }

  if (act === "peek") {
    S.peekCell = { col: +b.dataset.c, min: +b.dataset.m };
    S.copyMsg = "";
    S.evTitle = S.evTitle || DEFAULT_TITLE;
    buildPeek(); render(); return;
  }

  if (act === "copy-times") {
    const text = (S.peekLines || []).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      S.copyMsg = "複製好了。";
    } catch (err) {
      // 不是 https、或舊瀏覽器的話 clipboard API 不在。
      // **不要靜靜地失敗** —— 那又是一次「按了沒反應」（README 第 13 項）。
      console.error("複製失敗。真正的原因：", err);
      S.copyMsg = "複製不了，請自己選取上面那幾行。";
    }
    buildPeek(); render(); return;
  }
  if (act === "close-peek") {
    // ⚠ **不要用「祖先有沒有 data-stop」來判斷。**
    // 2026-09-02：原本寫成 `act === "close-peek" && !e.target.closest("[data-stop]")`，
    // 而 data-stop 掛在 .modal 上、關閉鍵就住在 .modal 裡面 ——
    // 那個條件把關閉鍵自己排除掉了，按下去事件有觸發、狀態不會變、畫面完全不動。
    // 實測確認過：act=close-peek 進得來，但有 data-stop 祖先，所以整個分支跳過。
    //
    // 現在改成正面表列**哪兩種情況要關**，而不是反面排除：
    //   按到的是一顆按鈕（關閉鍵、右上角的 ✕）
    //   或者點在遮罩本身（不是彈窗裡面）
    const onScrim = e.target.classList && e.target.classList.contains("scrim");
    if (b.tagName === "BUTTON" || onScrim) { S.peek = null; render(); }
    return;
  }
});

document.addEventListener("input", e => {
  // 標題改了就跟著改連結的 href。**不重畫整個彈窗** ——
  // 重畫會讓輸入框失焦，使用者打第二個字就得再點一次。
  if (e.target.id === "evtitle") {
    S.evTitle = e.target.value;
    const a = document.getElementById("callink");
    if (a && S.peekCell) {
      a.href = googleCalUrl(cellInstant(S.weekStart, S.peekCell.col, S.peekCell.min, S.myTz),
                            undefined, S.evTitle);
    }
    return;
  }
  if (e.target.id === "tzq") {
    S.tzQuery = e.target.value;
    S.tzResults = searchTz(S.tzQuery);
    const list = document.querySelector(".tzlist");
    if (list) list.innerHTML = S.tzResults.map(r =>
      `<button class="tzitem" data-act="tz-pick" data-tz="${r.tz}"><b>${r.label}</b><span>${r.tz}</span></button>`
    ).join("") || `<div class="empty sm">找不到「${S.tzQuery}」。換個講法試試，例如打州名或最近的大城市。</div>`;
  }
});

// 送出前把兩個選單的值收進 S，不然重畫之後會回到預設值。
function readBatch() {
  const f = document.getElementById("bfrom"), t = document.getElementById("bto");
  if (f) S.bfrom = +f.value;
  if (t) S.bto = +t.value;
  const c = document.getElementById("copyfrom");
  if (c) S.copyFrom = +c.value;
}

// 組出詳情彈窗要的一切。
//
// **時間一律從 S.weekStart 算**（見 calendar.js 的 cellInstant）——
// 使用者可能是在翻週的時候點的，用「本週」算的話事件會差一整週，
// 而那個事件看起來完全正常，只是日期錯了。
function buildPeek() {
  const { col, min } = S.peekCell;
  const counts = calcCounts(S.members, S.slots, S.weekStart, S.myTz);
  const free = counts.get(col + ":" + min) || [];
  const inst = cellInstant(S.weekStart, col, min, S.myTz);
  const zones = [...new Set(S.members.filter(m => m.tz).map(m => m.tz))].sort();
  S.peekLines = localTimesText(inst, zones, labelOf);
  S.peek = UI.peekHTML(S, {
    free, minute: min,
    dayLabel: "星期" + UI.DAY_ZH[UI.COL_ORDER[col]],
    lines: S.peekLines,
    calUrl: googleCalUrl(inst, undefined, S.evTitle),
    title: S.evTitle,
    copyMsg: S.copyMsg,
  });
}

boot();
