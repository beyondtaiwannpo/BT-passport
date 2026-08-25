// 純渲染層：只吃 state（S）與活動/月份資料，吐 HTML 字串。不碰儲存，不碰 DOM 事件。
// passportNo 從 data.js import（data.js 不可以反向依賴這裡，見該檔案的註解）。
import { passportNo } from "./data.js";

// BT 的六個組。**這裡只放團隊，不放職位。**
// 原本第七項是 "President's Office"，2026-08-22 拿掉 —— 那不是 BT 的正式團隊，
// 是原型階段自己加的。
//
// 常見的下一個問題：President 與 Vice President 不屬於任何一組，他們選什麼？
// 答案是**選自己原本出身的那一組**（一進來就是 P/VP、沒有出身組的話，
// 選最常一起做事的那一組）。要讓頭銜看得見的話寫在「護照上的一句話」，
// 那是自由文字，例如「President 2026-27」。
//
// **不要為了他們在這個清單裡加一個選項。** 那正是剛剛拿掉 President's Office 的原因：
// 清單裡一旦混進一個職位，它就不再是「一種東西的清單」，
// 而下一個問題馬上會來 —— 秘書呢？顧問呢？同時在兩個組的人呢？
// 而那一欄顯示在進度牆上，它要回答的是「這個人跟哪一組做事」，不是「他的頭銜是什麼」。
//
// 順帶一提，機讀碼的 teamCode 取團隊名的前六個字母，六個組各自對到
// CURRIC / MENTOR / MARKET / SPONSO / INTERN / COMMUN，互不重複。加東西進來前先確認不會撞。
const TEAMS = ["Curriculum Team", "Mentorship Team", "Marketing Team",
               "Sponsorship Team", "Internship Team", "Community Relations Team"];

// 三個分類的**唯一定義點**。label / short / define 三個欄位分別餵給
// 月份格子的分類標籤、說明頁卡片的標題、說明頁卡片的定義句。
//
// define 那三句跟 activities.json 的 categories.desc 是同一份文字。
// **兩邊消不掉。** activities.json 執行期不會被讀（它是 seed.sql 的人類可讀原稿，
// 前端一律吃資料庫），所以它是文件不是來源；真正要單一來源的話得把分類定義
// 搬進資料庫，那是多一張表加一次查詢，為了三句不會變的話不划算。
// 折衷是兩邊互相指路：改了這裡要同步 activities.json，反之亦然。
export const CATEGORY = {
  gather: { label: "聚會 GATHER", short: "聚會", define: "全 BT 一起做的事", body: "一個月一次，全 BT 一起做一件事。玩遊戲、交換歌單、猜這張照片是誰的。一年下來，你會知道二十九個人的相簿長什麼樣、聽什麼歌、高中是什麼樣子。" },
  prompt: { label: "題目 PROMPT", short: "題目", define: "一個寫的題目，只有自己看得到", body: "一個月一題，寫給七月的自己。九月你寫下想要什麼，七月護照會拿出來給你看。這裡寫的東西只有你看得到，別人打不開，所以可以誠實一點。" },
  frame:  { label: "鏡頭 FRAME",  short: "鏡頭", define: "一張照片題目", body: "一個月一張照片。從醒來、出門、中午、傍晚，一路到關燈前。十一張排起來，是你這一年的一天——同一個中午，有人在教室，有人還在睡。" }
};

// CATNAME 從 CATEGORY 衍生，不要各寫一份 —— 那就又變回兩個真相來源了。
// 保留這個匯出名稱是因為 slotHTML、main.js 的 modal、以及
// test/ui-order.test.mjs 的「SLOT_ORDER 的鍵必須等於 CATNAME 的鍵」都在用它。
export const CATNAME = Object.fromEntries(
  Object.entries(CATEGORY).map(([k, v]) => [k, v.label]));

// 三格的順序：聚會 → 題目 → 鏡頭。**這是設計決定，不是資料庫的字母序。**
// 理由是難度遞增：聚會最輕鬆、題目最花心思、鏡頭最快，收尾在最輕的一格。
//
// 為什麼要寫在前端：data.js 的查詢是 .order("month").order("seq")，而 seed 裡
// **同一個月三格的 seq 是同一個值**（09A/09B/09C 全是 1），等於同月內完全沒有
// 排序鍵，順序由 Postgres 當下決定、不保證、今天對明天可能就跑掉，而且不報錯。
// 依 category 的字母序排也不行 —— 那會變成 frame/gather/prompt，鏡頭跑到最前面。
//
// 改動這個陣列會讓 test/ui-order.test.mjs 紅掉，那是刻意的。
export const SLOT_ORDER = ["gather", "prompt", "frame"];

// 認不得的 category **排到最後，不丟掉**。這條比順序本身更重要：
// 若哪天有人把 category 改名而忘了同步上面那張表，錯誤的表現必須是「順序不對」
// 而不是「那一格從畫面上消失」——  消失沒有任何東西會報錯，而學生會以為
// 自己的章不見了。Array.prototype.sort 自 ES2019 起保證穩定，所以兩個都認不得的
// 格子會維持它們進來時的相對順序。
function orderSlots(acts) {
  const rank = c => {
    const i = SLOT_ORDER.indexOf(c);
    return i === -1 ? SLOT_ORDER.length : i;
  };
  return acts.slice().sort((a, b) => rank(a.category) - rank(b.category));
}

// 里程碑的狀態**只有這一個定義點**。頂欄那行提示與資料頁的清單都問它，
// 不准任何一邊自己再算一次 —— 兩邊各算一次的話，改了其中一邊另一邊會靜靜地說謊。
//
// done 直接數 S.stamps 的鍵，而且整個檔案只准在這裡數一次 ——
// check.sh 用 grep 守住這件事（見該檔案「章的數量」那條）。
// test/ui-milestone.test.mjs 另外驗顯示端（barHTML）有沒有把這個數字印錯。
//
// 沒有「誰達成了什麼」的資料表，達成與否一律即時算（見 supabase/schema.sql 的註解）。
export function milestoneState(S) {
  const done = Object.keys(S.stamps).length;
  // 同門檻時用 id 打破平手，順序才不會在每次載入之間跳動 —— 跟 activities
  // 的 seq 相同時那個坑一樣（見 SLOT_ORDER 的註解）。
  const list = (S.milestones || []).slice()
    .sort((a, b) => a.threshold - b.threshold || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const reached = list.filter(m => done >= m.threshold);
  const next = list.find(m => done < m.threshold) || null;
  return { done, list, reached, next, remaining: next ? next.threshold - done : 0 };
}

// 中文月名是語言常數，不是活動內容，可以留在程式裡（spec §5 只禁止活動內容寫死）。
const MONTH_ZH = { 1:"一月",2:"二月",3:"三月",4:"四月",5:"五月",6:"六月",
                   7:"七月",8:"八月",9:"九月",10:"十月",11:"十一月",12:"十二月" };

export const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const today = () => new Date().toISOString().slice(0, 10);

export function mrz(p) {
  const clean = s => String(s || "").toUpperCase().replace(/[^A-Z ]/g, "").trim().replace(/ +/g, "<");
  const parts = clean(p.name_en).split("<").filter(Boolean);
  const sur = parts.length > 1 ? parts[parts.length - 1] : (parts[0] || "MEMBER");
  const giv = parts.length > 1 ? parts.slice(0, -1).join("<") : "";
  const l1 = ("P<TWN" + sur + "<<" + giv).padEnd(44, "<").slice(0, 44);

  const iso = p.issued || today();
  const yy = iso.slice(2, 4), mm = iso.slice(5, 7), dd = iso.slice(8, 10);
  const expYY = String((Number(yy) + 1) % 100).padStart(2, "0");
  const teamCode = (p.team || "BT").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 6);
  const l2 = (passportNo(p.id) + "7TWN" + yy + mm + dd + "1M" + expYY + mm + dd + "4" + teamCode)
    .padEnd(44, "<").slice(0, 44);
  return [l1, l2];
}

export function barHTML(S) {
  const ms = milestoneState(S);
  return `<div class="bar">
    <img src="./logo.png" alt="Beyond Taiwan">
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected="${S.view === "passport"}" data-act="tab" data-v="passport">我的護照</button>
      <button role="tab" aria-selected="${S.view === "wall"}" data-act="tab" data-v="wall">進度牆</button>
    </div>
    <button class="btn ghost sm" data-act="signout">登出</button>
    <div class="sp"></div>
    <div class="prog"><small>Stamps collected</small>${ms.done} <span style="opacity:.4">/ ${S.activities.length}</span>${ms.next ? `<small class="next">下一個里程碑還差 ${ms.remaining} 個章</small>` : ""}</div>
  </div>`;
}

// 書本的頁序。**頁碼只有這裡一個定義點** —— dots、上一頁／下一頁、鍵盤左右、
// bookHTML 的內容分派全部問它，不准任何地方再自己算 page - 1 或 months.length。
//
// 這個函式存在之前，頁碼算術散在六個地方（ui.js 三處、main.js 三處）。
// 在中間插一頁要同時改對六處，漏一處的表現是「翻到某一頁顯示的是別的月份」，
// 不會報錯。之後要再插頁（例如年度回顧），只改這個函式。
//
// S.page 的語意是這個陣列的 0 起算索引。它沒有被持久化到任何地方
// （不進 localStorage、不進備份檔、不進網址），所以改變頁序沒有相容性問題。
export function pagesOf(S) {
  return [
    { kind: "id", label: "資料頁" },
    { kind: "guide", label: "怎麼用" },
    ...S.months.map(m => ({
      kind: "month", month: m, label: MONTH_ZH[m.month] || String(m.month)
    }))
  ];
}

// 這個月的圓點要不要塗橘色。**acts.length 那一半不可以省**：
// [].every(...) 回 true，少了它的話，一個還沒有任何活動的月份會顯示成「已蓋滿」。
function dotOn(S, m) {
  const acts = S.activities.filter(a => a.month === m.month);
  return acts.length && acts.every(a => S.stamps[a.id]) ? 1 : 0;
}

export function bookHTML(S) {
  const pages = pagesOf(S);
  // S.page 落在範圍外時退回第一頁而不是畫出 undefined。正常情況走不到這裡，
  // 但月份資料變少（有人停用了一整個月）時 S.page 可能指向已經不存在的頁。
  const cur = pages[S.page] || pages[0];
  return `<div class="book">
    <div class="page turn">${pageBodyHTML(S, cur)}
      <div class="pageno">PAGE ${String(S.page + 1).padStart(2, "0")} / ${pages.length}</div>
    </div>
    <div class="nav">
      <button class="arrow" data-act="prev" ${S.page === 0 ? "disabled" : ""}>← 前一頁</button>
      <div class="dots">
        ${pages.map((p, i) => {
          const on = p.kind === "month" ? ` data-on="${dotOn(S, p.month)}"` : "";
          return `<button data-act="go" data-p="${i}"${on} aria-current="${S.page === i}" aria-label="${esc(p.label)}" title="${esc(p.label)}"></button>`;
        }).join("")}
      </div>
      <button class="arrow" data-act="next" ${S.page === pages.length - 1 ? "disabled" : ""}>下一頁 →</button>
    </div>
  </div>`;
}

// 一頁的內容由 kind 決定。新增頁型只要在 pagesOf 加一種 kind、在這裡加一條分支。
function pageBodyHTML(S, page) {
  if (page.kind === "id") return idPageHTML(S);
  if (page.kind === "guide") return guidePageHTML();
  return monthPageHTML(S, page.month);
}

// total > 0 不可省（見下面 FULL 疊印那一行）：activities 空的時候 done === total
// 會是 0 === 0，一個章都沒蓋的人會被蓋一個「0 / 0 · FULL」。跟 dotOn 的
// acts.length && 是同一條理由 —— 沒有東西可以完成的時候，不算完成。
export function idPageHTML(S) {
  const p = S.profile;
  const [l1, l2] = mrz(p);
  const av = S.profile.avatar ? `<img src="${esc(S.profile.avatar)}" alt="">` : `<span>點此上傳<br>大頭照</span>`;
  const done = milestoneState(S).done;
  const total = S.activities.length;
  return `<div class="mhead">
      <div class="mnum">00</div>
      <div class="mzh">持照人資料</div>
      <div class="mtheme"><b>BEYOND TAIWAN</b><span>Passport · ${new Date(p.issued).getFullYear()}</span></div>
    </div>
    <div class="idgrid">
      <button class="photo" data-act="avatar" title="上傳大頭照">${av}</button>
      <div>
        <div class="fields">
          <div class="f"><i>Type / 類別</i><b>BT</b></div>
          <div class="f"><i>Code / 代碼</i><b>TWN</b></div>
          <div class="f"><i>Passport No. / 護照號碼</i><b>${passportNo(p.id)}</b></div>
          <div class="f"><i>Date of issue / 核發日</i><b>${esc(p.issued)}</b></div>
          <div class="f wide"><i>Name / 姓名</i><b>${esc(p.name_zh)} · ${esc(p.name_en).toUpperCase()}</b></div>
          <div class="f wide"><i>Team / 所屬團隊</i><b>${esc(p.team)}</b></div>
        </div>
        ${p.motto ? `<div class="motto">「${esc(p.motto)}」</div>` : ""}
      </div>
    </div>
    ${total > 0 && done === total ? `<div class="overprint" style="position:static;display:inline-block;margin-top:22px;transform:rotate(-3deg)">${total} / ${total} · FULL</div>` : ""}
    ${milestonesHTML(S)}
    <div class="mrz">${esc(l1)}<br>${esc(l2)}</div>
    <div class="row" style="margin-top:18px">
      <button class="btn ghost sm" data-act="edit">編輯資料</button>
      <button class="btn ghost sm" data-act="export">匯出備份</button>
      <button class="btn ghost sm" data-act="import">匯入還原</button>
      <button class="btn sm quiet" data-act="reset">清除這本護照</button>
    </div>`;
}

// 資料頁的里程碑清單。位置在標語之後、機讀碼之前。
// 已達成的正常顯示，未達成的降低透明度但**門檻數字與名字都看得到** ——
// 使用者的要求是「要讓人看得到還有什麼在前面」。
//
// 狀態同時寫在 .cat 的文字裡（「5 個章 · 已達成」／「5 個章 · 鎖定」），
// 不只靠透明度：只靠顏色的話，讀螢幕的人與色覺不同的人拿不到這個資訊。
//
// 卡片是 <div class="slot"> 不是 <button>：它不可點，沒有任何動作。
function milestonesHTML(S) {
  const ms = milestoneState(S);
  if (!ms.list.length) return "";   // 沒有里程碑（含讀取失敗）就整塊不出現
  return `<div class="mstones-h">Milestones / 里程碑</div>
    <div class="slots mstones">${ms.list.map(m => {
      const got = ms.done >= m.threshold;
      return `<div class="slot" data-locked="${got ? 0 : 1}">
        <span class="cat">${m.threshold} 個章 · ${got ? "已達成" : "鎖定"}</span>
        <span class="ttl">${esc(m.title_zh)}</span>
        ${m.description ? `<span class="hint">${esc(m.description)}</span>` : ""}
      </div>`;
    }).join("")}</div>`;
}

export function stampHTML(act, st, animate) {
  const ink = act.category === "gather" ? "ink-fill" : "ink-navy";
  const rot = ((act.id.charCodeAt(2) * 7) % 11) - 5;   // 角度由 id 決定，固定不變（spec §7.1）
  return `<div class="stampwrap"><div class="tilt" style="transform:rotate(${rot}deg)">
    <div class="stamp ${ink}${animate ? " land" : ""}">
      <div class="s1">Beyond Taiwan</div>
      <div class="s2">${esc(act.title_en)}</div>
      <div class="s3">${esc(st.date).replace(/-/g, ".")}</div>
    </div>
  </div></div>`;
}

// theme_zh 現在放的是時間數字（07:00），theme_en 是空字串。
// 空的時候**不產生**那個 span。
// 這條規則跟版面無關：2026-08-22 實測 <span></span>、<span> </span>、
// <span>\n</span> 與完全不渲染的 .mtheme 高度都是 42.50，一模一樣 ——
// 空的 inline 元素不產生行框。理由是不要在 DOM 裡留一個永遠是空的元素，
// 下一個人看到會以為渲染壞了然後去「修」它。見 spec 2026-08-22 §5.2。
export function monthPageHTML(S, m) {
  const acts = orderSlots(S.activities.filter(a => a.month === m.month));
  const full = acts.every(a => S.stamps[a.id]);
  const zh = MONTH_ZH[m.month] || String(m.month);
  return `${full ? `<div class="overprint">MONTH CLEARED</div>` : ""}
    <div class="mhead">
      <div class="mnum">${String(m.month).padStart(2, "0")}</div>
      <div class="mzh">${zh}</div>
      <div class="mtheme clock"><b>${esc(m.theme_zh)}</b>${m.theme_en ? `<span>${esc(m.theme_en)}</span>` : ""}</div>
    </div>
    <div class="slots">${acts.map(a => slotHTML(S, a)).join("")}</div>`;
}

// 07B 的回望（spec §7.3）。由 activities.callback_to 驅動，**不寫死 07B** ——
// 未來任何一格在資料庫設了 callback_to，打開時就自動有這個行為，一行程式都不用改。
//
// 兩句文案逐字抄自 spec §7.3（「你在九月寫的」／「你九月沒有寫這格」），改文案要先改 spec。
// 這裡刻意不用「先組一句再 replace 成另一句」的寫法：那種接龍看起來省事，
// 但只要有人動了其中一句的措辭，另一句就會靜靜地產出半句不通的中文，而且沒有東西會報錯。
//
// 日期取自 stamps 不是 entries —— entries 沒有日期欄位（spec §7.3 明說）。
export function callbackHTML(S, act) {
  if (!act.callback_to) return "";
  const src = S.activities.find(a => a.id === act.callback_to);
  // 來源那格可能被停用（boot 會濾掉 active === false），這時候講不出是哪個月，
  // 退成不提月份的說法。不能因此整塊不顯示：那個人的心得還在，還是該給他看。
  const when = src ? MONTH_ZH[src.month] : "";
  const e = S.entries[act.callback_to];
  const st = S.stamps[act.callback_to];

  if (!e || !e.note) {
    // spec §7.3：沒寫過時照樣可作答，**不阻擋**。所以這裡只是一段說明，
    // 不是警告，也不會關掉下面的輸入框。
    const none = when ? `你${when}沒有寫這格` : "你之前沒有寫這格";
    return `<div class="wnote" style="margin:0 0 16px">${esc(none)}。沒關係，這格照樣可以寫。</div>`;
  }
  const label = when ? `你在${when}寫的` : "你之前寫的";
  return `<div class="wnote" style="margin:0 0 16px">
    <b>${esc(label)}</b>${st ? `　<span style="opacity:.7">${esc(st.date)}</span>` : ""}
    <div style="margin-top:6px;font-size:13px;opacity:.9">「${esc(e.note)}」</div>
  </div>`;
}

export function slotHTML(S, a) {
  const st = S.stamps[a.id];
  const entry = S.entries[a.id] || {};
  const anim = st && S.justStamped === a.id;
  if (anim) S.justStamped = null;
  // CATNAME 取不到就印空字串。取不到代表有人改了 category 名稱，
  // 那時候該壞的是順序（排到最後），不是在畫面上出現「undefined」四個字。
  //
  // 這段刻意是 JS 註解而不是 template literal 裡的 HTML 註解：
  // 放進 template 的話它會變成輸出的一部分，而 test/ui-order.test.mjs 的
  // mutation 測試斷言的正是「輸出裡不准出現 undefined 這個字」——
  // 註解自己會把那個測試弄紅。另外 slotHTML 每次整頁渲染會被呼叫 33 次，
  // HTML 註解等於同一段文字送 33 份到瀏覽器。
  return `<button class="slot" data-act="open" data-id="${a.id}" data-done="${st ? 1 : 0}">
    <span class="cat">${esc(CATNAME[a.category] || "")}</span>
    <span class="ttl">${esc(a.title_zh)}</span>
    <span class="en">${esc(a.title_en)}</span>
    ${st ? `<span class="hint">${esc(a.description)}</span>${stampHTML(a, st, anim)}
        ${entry.note ? `<span class="note">${esc(entry.note)}</span>` : ""}
        ${entry.photo ? `<img class="thumb" src="${esc(entry.photo)}" alt="">` : ""}`
      : `<span class="hint">${esc(a.description)}</span><span class="cta">蓋章 →</span>`}
  </button>`;
}

// ┌──────────────────────────────────────────────────────────────────────────┐
// │ 三張卡的文案。**兩處共用這一份**：第一次核發護照後的引導頁（introHTML）  │
// │ 與書裡固定的說明頁（guidePageHTML）。改文案只改這裡，兩邊永遠不會        │
// │ 講不一樣的話。                                                            │
// │                                                                          │
// │ .ttl 放的是 CATEGORY[c].define（那三句定義），不是分類短名 ——            │
// │ 分類短名已經在 .cat 那一格出現過一次，再放一次 .ttl 會讓「聚會」在同一   │
// │ 張卡上出現兩次。2026-08-23 使用者看過對照圖後的決定。                    │
// │                                                                          │
// │ .hint 印的是 CATEGORY[c].body，2026-08-23 使用者親手寫的三段文案，       │
// │ 逐字收在 CATEGORY 裡。**這裡沒有預設字串**：少一個分類的 body 不會讓     │
// │ 渲染失敗，esc(undefined) 只會變成空字串，靜靜地印一行空白給幹部看 ——     │
// │ 真正擋住它的是 test/ui-pages.test.mjs 那條檢查每個分類都有非空文案的     │
// │ 測試，不是靠渲染失敗。                                                   │
// └──────────────────────────────────────────────────────────────────────────┘
// 順序直接用 SLOT_ORDER 產生，不在這裡再寫死一次三個 category ——
// 那會變成第二個順序的真相來源，而兩個真相來源遲早會不一致。
// 卡片是 <div class="slot"> 不是 <button>：它不可點，沒有蓋章入口。
export function guideCardsHTML() {
  return `<div class="slots guide">${SLOT_ORDER.map(c => {
    const g = CATEGORY[c];
    if (!g) return "";
    return `<div class="slot">
      <span class="cat">${esc(g.label)}</span>
      <span class="ttl">${esc(g.define)}</span>
      <span class="hint">${esc(g.body)}</span>
    </div>`;
  }).join("")}</div>`;
}

// 書裡固定的說明頁。位置在資料頁之後、九月之前（見 pagesOf）。
//
// 沒有 .mnum：那一頁不是月份，本來就不該有月份數字，而且 00 已經給了資料頁，
// 硬塞一個符號進去只會讓人多看一眼想「這是第幾頁」。少了左邊的數字，
// .mhead 的重心會偏，所以改用 .mhead.solo 把標題推到數字那一級的大小來補
// （CSS 在 index.html 的 .mhead.solo .mzh，52px 跟月份頁「09 九月」的
// 視覺重量對得上）。2026-08-23 使用者看過對照圖後的決定。
export function guidePageHTML() {
  return `<div class="mhead solo">
      <div class="mzh">怎麼用這本護照</div>
    </div>
    ${guideCardsHTML()}`;
}

// 第一次核發護照之後擋一次的引導頁。看完就進護照，之後不再出現
// （記在 passports.intro_seen）。內容跟書裡的說明頁是同一份卡（guideCardsHTML）。
//
// 沿用 .card，只用 inline style 放寬 max-width —— .card 預設 560px 放不下三欄，
// 那是尺寸不是新元件，仍符合原規格 §3.4。
export function introHTML() {
  return `<div class="card" style="max-width:940px">
    <img src="./logo.png" alt="Beyond Taiwan" style="height:30px;display:block;margin-bottom:18px">
    <h2>怎麼用這本護照</h2>
    <div class="sub">一年 33 格，每個月三格。這一頁之後在護照裡隨時翻得到。</div>
    ${guideCardsHTML()}
    <div class="row" style="margin-top:22px">
      <button class="btn" data-act="intro-done">開始蓋章</button>
    </div>
  </div>`;
}

export function wallHTML(S) {
  if (S.wallLoading) return `<div class="wall"><div class="empty">正在讀取全體進度…</div></div>`;
  // 讀失敗要說出來，而且要留一個按得到的重新整理鍵。少了這一段的話，main.js 的
  // loadWall() 一旦拋錯，畫面會永遠停在上面那句「正在讀取全體進度…」——
  // 那看起來像網路很慢，學生會一直等，不會知道該按什麼。
  if (S.wallError) return `<div class="wall">
    <h3>全體進度牆</h3>
    <div class="empty">進度牆讀不到。按下面的重新整理再試一次，你自己的護照不受影響。</div>
    <div class="row" style="margin-top:20px"><button class="btn ghost sm" data-act="refresh">重新整理</button></div>
  </div>`;
  const total = S.activities.length;
  const people = (S.wall || []).map(p => Object.assign({}, p, { count: (p.stamps || []).length }))
    .sort((a, b) => b.count - a.count);
  const feed = [];
  people.forEach(p => (p.stamps || []).forEach(s => feed.push({ who: p.name_zh || p.name_en, id: s.act_id, d: s.stamped_on })));
  feed.sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : 0);

  return `<div class="wall">
    <h3>全體進度牆</h3>
    <div class="wnote">這面牆是公開的：所有 BT 幹部都看得到你的名字、團隊、大頭照與蓋章紀錄。你寫的心得和上傳的活動照片不會出現在這裡，其他幹部看不到。</div>
    ${people.length === 0 ? `<div class="empty">還沒有人蓋章。去蓋第一個吧。</div>` :
      `<div class="people">${people.map(p => {
        const on = new Set((p.stamps || []).map(s => s.act_id));
        // 大頭照只用既有的 .person 樣式加一段 inline 的圓形裁切，不新增 class（spec §3.4）。
        // 邊框用的是允許的三個底色之一 rgba(16,42,134,…)，見 check.sh 的 §11-14。
        const av = p.avatar
          ? `<img src="${esc(p.avatar)}" alt="" style="width:34px;height:34px;border-radius:50%;object-fit:cover;float:right;border:1px solid rgba(16,42,134,.2)">`
          : "";
        return `<div class="person">
          ${av}
          <b>${esc(p.name_zh || p.name_en)}</b>
          <span class="team">${esc(p.team || "")}</span>
          <div class="track">${S.months.map(m => {
            const acts = S.activities.filter(a => a.month === m.month);
            const got = acts.filter(a => on.has(a.id)).length;
            const op = got === 0 ? 1 : (0.34 + 0.66 * got / acts.length);
            const zh = MONTH_ZH[m.month] || String(m.month);
            return `<i data-on="${got > 0 ? 1 : 0}" style="opacity:${op.toFixed(2)}" title="${zh} ${got}/${acts.length}"></i>`;
          }).join("")}</div>
          <div class="cnt">${p.count || 0} / ${total}</div>
        </div>`;
      }).join("")}</div>`}
    ${feed.length ? `<div class="feed"><h3>最近蓋的章</h3>
      ${feed.slice(0, 20).map(f => {
        const a = S.activities.find(x => x.id === f.id);
        return `<div class="fitem"><time>${esc(f.d)}</time><span><b>${esc(f.who)}</b> 蓋了 <b>${a ? esc(a.title_zh) : esc(f.id)}</b></span></div>`;
      }).join("")}</div>` : ""}
    <div class="row" style="margin-top:20px"><button class="btn ghost sm" data-act="refresh">重新整理</button></div>
  </div>`;
}

// 只用既有的 .card / label / .btn / .wnote，不新增任何樣式（spec §3.4）。
// 忘記密碼只有登入頁底部那一行提示：不做自助重設、不做重設畫面、
// 不呼叫 resetPasswordForEmail（spec §6.3）。
export function authHTML(mode, msg) {
  const up = mode === "up";
  return `<div class="card">
    <img src="./logo.png" alt="Beyond Taiwan" style="height:30px;display:block;margin-bottom:18px">
    <h2>${up ? "註冊 BT 護照" : "登入"}</h2>
    <div class="sub">${up ? "需要一組 BT 邀請碼。跟你的組長拿。" : "用你註冊時的 email 登入。"}</div>
    ${msg ? `<div class="wnote" style="margin:0 0 16px">${esc(msg)}</div>` : ""}
    <!-- 邀請碼那格的 autocapitalize/autocorrect/spellcheck 全部關掉。
         **大小寫那一半已經不再是理由**：trigger 現在是
         where upper(btrim(code)) = upper(btrim(v_code))，手機鍵盤把第一個字母變成大寫
         也對得到（見 supabase/migrations/2026-08-17-invite-code-case-insensitive.sql）。
         留著這幾個屬性是為了另外那一半，而那一半沒有變：autocorrect 與 spellcheck 會把
         它不認得的字串**換成別的字**，那是使用者看不見的竄改，資料庫救不了 ——
         學生只會看到「這個邀請碼不對」，然後把同一組碼再打十次。
         2026-08-17 那個把小寫碼轉成大寫的 bug 就是這一類，只是發生在程式裡
         （見 main.js 那段註解）。
         email 那格同樣關掉：GoTrue 自己會把 email 正規化成小寫，所以大小寫不致命，
         但 autocorrect 會把不認得的字串改掉，那是同一種「使用者看不見的竄改」。
         密碼那格不必：type="password" 本來就不會自動大寫或自動更正。 -->
    <label><i>Email</i><input id="ae" type="email" autocomplete="email" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="you@example.com"></label>
    <label><i>密碼 / Password${up ? "（至少 6 個字）" : ""}</i><input id="ap" type="password" autocomplete="${up ? "new-password" : "current-password"}"></label>
    ${up ? `<label><i>邀請碼 / Invite code</i><input id="ai" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="跟組長拿"></label>` : ""}
    ${up ? `<div class="wnote" style="margin:0 0 16px">送出後，你的姓名、團隊、大頭照與蓋章紀錄會出現在全體進度牆上，<b>其他 BT 幹部看得到，包含你的大頭照</b>。你寫的心得和上傳的活動照片只留在你自己的護照裡，<b>其他幹部看不到</b>。</div>` : ""}
    <div class="row">
      <button class="btn" data-act="${up ? "do-signup" : "do-signin"}">${up ? "註冊" : "登入"}</button>
      <button class="btn ghost" data-act="switch-auth" data-m="${up ? "in" : "up"}">${up ? "我已經有帳號了" : "我有邀請碼，要註冊"}</button>
    </div>
    ${up ? "" : `<div class="wnote" style="margin:16px 0 0">忘記密碼？寄信到 beyondtaiwan2020@gmail.com，我們會幫你重設。你的資料都還在。</div>`}
  </div>`;
}

// user 有值時多一顆登出。這個畫面沒有 barHTML，沒有這顆的話，註冊完但還沒填資料的人
// 在這裡是走不掉的 —— 唯一的登出鍵在他還看不到的那條 bar 上。
// DB 連不上時的畫面（spec §8.1）。**這一頁存在的唯一理由是「不得空白」**。
//
// 文案逐字照 spec §8.1，一個字都不要改，也不要加上任何人的名字或私人聯絡方式
// （spec §11-20 全站規則）。
//
// 它說的是「休眠中」，但實際上任何讀取失敗都會走到這裡 —— 真的休眠、網路斷掉、
// 政策改壞了，畫面上都是同一句。這是刻意的：對學生來說下一步都一樣（寄信給組織），
// 分辨原因是維護者的事，所以原始錯誤留在 console（見 main.js 的 boot）。
export function downHTML() {
  return `<div class="card">
    <img src="./logo.png" alt="Beyond Taiwan" style="height:30px;display:block;margin-bottom:18px">
    <h2>資料庫休眠中</h2>
    <div class="wnote" style="margin:16px 0 0">
      資料庫休眠中，你的資料都還在。請寄信到 beyondtaiwan2020@gmail.com 請人恢復。
    </div>
    <div class="row" style="margin-top:18px"><button class="btn ghost" data-act="retry">再試一次</button></div>
  </div>`;
}

export function setupHTML(p, user) {
  p = p || {};
  return `<div class="card">
    <img src="./logo.png" alt="Beyond Taiwan" style="height:30px;display:block;margin-bottom:18px">
    <h2>${p.id ? "編輯護照資料" : "申請你的 BT 護照"}</h2>
    <div class="sub">${p.id ? "改完按儲存，章不會消失。" : "一年 33 格，每個月三個。蓋滿的人，年底會有一整本回憶。"}</div>
    <label><i>中文名 / Name</i><input id="fz" value="${esc(p.name_zh || "")}" placeholder="王小明" maxlength="20"></label>
    <label><i>英文名 / Name in English（會印在機讀碼上）</i><input id="fe" value="${esc(p.name_en || "")}" placeholder="Ming Wang" maxlength="30"></label>
    <label><i>所屬團隊 / Team</i><select id="ft">${TEAMS.map(t => `<option ${p.team === t ? "selected" : ""}>${t}</option>`).join("")}</select></label>
    <label><i>護照上的一句話 / Your line（選填）</i><textarea id="fm" maxlength="60" placeholder="你無法選擇你從未看見的東西。">${esc(p.motto || "")}</textarea></label>
    <div class="wnote" style="margin:0 0 16px">送出後，你的姓名、團隊、大頭照與蓋章紀錄會出現在全體進度牆上，<b>其他 BT 幹部看得到，包含你的大頭照</b>。你寫的心得和上傳的活動照片只留在你自己的護照裡，<b>其他幹部看不到</b>。</div>
    <div class="row">
      <button class="btn" data-act="issue">${p.id ? "儲存" : "核發護照"}</button>
      ${p.id ? `<button class="btn ghost" data-act="cancel">取消</button>` : ""}
      <!-- 沒有名字 = 這個人現在**到不了資料頁**，而匯入還原的另一顆按鈕就在資料頁上。
           不放這一顆的話，spec §11-10 的「匯出 → 清除護照 → 匯入還原」根本走不完：
           清完之後畫面就停在這一頁，只有「核發護照」跟「登出」，備份檔沒有地方可以餵進去。
           spec §7.4 的跨帳號還原也一樣卡住 —— 剛註冊完的帳號同樣停在這一頁。
           （2026-08-17 實測確認過這個死路，不是推測。）

           判斷條件是「有沒有名字」而不是「有沒有 p.id」：清除護照之後那一列還在
           （clearAll 只把欄位設成 null，不刪列），所以重整一次 p.id 就會有值，
           用 p.id 判斷的話這顆按鈕會在重整後消失，死路又回來了。
           從資料頁按「編輯資料」進來的人一定有名字，所以那條路上不會多出這顆。 -->
      ${(p.name_zh || p.name_en) ? "" : `<button class="btn ghost sm" data-act="import">匯入還原</button>`}
      ${user ? `<button class="btn ghost sm" data-act="signout" style="margin-left:auto">登出</button>` : ""}
    </div>
  </div>`;
}
