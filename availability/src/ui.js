// 看板的畫面。**esc 是自己的一份**，不從 passport/ 或 app/ import
//（跟 app/ 同一條規矩：資料夾之間不互相依賴）。
import { labelOf } from "./tz-alias.js";
import { offsetLabel } from "./tz.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const DAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];
export const hhmm = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

// 一週的欄位順序。看板從星期一排到星期日（台灣人習慣），
// 但**儲存的 weekday 仍然是 0 = 星期日**（資料庫欄位註解寫著同一句）。
// 這個陣列就是那兩件事之間唯一的轉換點，不要在別的地方再轉一次。
export const COL_ORDER = [1, 2, 3, 4, 5, 6, 0];

// msg 一定要有地方畫。2026-09-02 加「只能往前看四週」時差點漏掉這件事：
// 設了 S.msg 卻沒有任何模板讀它，等於又做了一個「按了沒反應」的按鈕。
export function shellHTML(tab, inner, weekLabel, msg) {
  // 2026-09-04：logo 與「回入口」搬到 shared 的頂欄，這裡只剩看板內部的分頁與翻週。
  return `<div class="bar">
    <div class="tabs">
      <button data-act="tab" data-t="board" ${tab === "board" ? 'aria-current="true"' : ""}>團隊看板</button>
      <button data-act="tab" data-t="mine"  ${tab === "mine"  ? 'aria-current="true"' : ""}>我的時間</button>
      <button data-act="tab" data-t="who"   ${tab === "who"   ? 'aria-current="true"' : ""}>成員</button>
    </div>
  </div>
  ${weekLabel ? `<div class="weeknav">
    <button class="btn ghost sm" data-act="week" data-d="-1">← 前一週</button>
    <b>${esc(weekLabel)}</b>
    <button class="btn ghost sm" data-act="week" data-d="1">後一週 →</button>
    <button class="btn quiet sm" data-act="week" data-d="0">回本週</button>
  </div>` : ""}
  ${msg ? `<div class="wnote" style="margin-bottom:12px">${esc(msg)}</div>` : ""}
  ${inner}`;
}

// ── 知情同意（規格 §4-5 第 3 點）─────────────────────────────────────
// **這一頁擋在編輯器前面，按了確認才寫 notice_seen_at。**
// 打開頁面就記的話，「他看過了」這件事會變成假的 —— 而這是這個功能
// 唯一的知情同意：看板會把三十個人的完整作息表送進每一個幹部的瀏覽器。
//
// ⚠ **msg 一定要畫出來。** 2026-09-02 的第一版沒有這個參數，於是存檔失敗時
// render() 畫出一模一樣的畫面 —— 使用者按了沒反應，只會再按一次、按五次、
// 然後關掉。這跟邀請碼那一輪學到的是同一件事：**失敗一定要說話。**
export function noticeHTML(msg, busy) {
  return `<div class="card">
    <h2>填之前先知道一件事</h2>
    <div class="sub">這一頁只出現一次。</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    <div class="wnote big">你填的每週時間，<b>其他 BT 幹部看得到</b>。<br>
      他們看得到你哪一天固定有空、哪一天固定不在。</div>
    <p>看板要回答的就是「這個時段有誰有空」，所以每個幹部都會看到全部人的時間，
      不是只看到人數。這是這個功能的形狀，沒有辦法只給你看得到的部分。</p>
    <p>你的護照心得與活動照片<b>不在這裡面</b>，那些仍然只有你自己看得到。</p>
    <div class="row">
      <button class="btn" data-act="notice-ok" ${busy ? "disabled" : ""}>${busy ? "處理中…" : "我知道了，開始填"}</button>
      <a class="btn ghost" href="../app/">先不要</a>
    </div>
  </div>`;
}

// ── 時區設定 ────────────────────────────────────────────────────────
// 沒設時區就不讓填（設計提案裡使用者核可的）。**不給預設值** ——
// 猜錯的話他整週的時間會被安靜地畫到別的地方，而畫面看起來完全正常。
export function tzSetupHTML(guess, q, results, msg) {
  return `<div class="card">
    <h2>你在哪裡？</h2>
    <div class="sub">用來把你的時間換算給其他人看。之後可以改。</div>
    ${msg ? `<div class="wnote">${esc(msg)}</div>` : ""}
    ${guess ? `<div class="wnote">看起來你在 <b>${esc(labelOf(guess))}</b>。
      <button class="btn sm" data-act="tz-pick" data-tz="${esc(guess)}">就是這裡</button></div>` : ""}
    <label><i>搜尋城市（中英文都可以）</i>
      <input id="tzq" value="${esc(q || "")}" autocomplete="off" autocapitalize="off"
             autocorrect="off" spellcheck="false" placeholder="密西根、Ann Arbor、台北…"></label>
    <div class="tzlist">${
      (results || []).map(r =>
        `<button class="tzitem" data-act="tz-pick" data-tz="${esc(r.tz)}">
           <b>${esc(r.label)}</b><span>${esc(r.tz)}</span></button>`).join("")
      || (q ? `<div class="empty sm">找不到「${esc(q)}」。換個講法試試，例如打州名或最近的大城市。</div>` : "")
    }</div>
  </div>`;
}

// ── 團隊看板 ────────────────────────────────────────────────────────
// counts: Map("dayIndex:minute" → [memberId]）；viewerTz 只用來顯示欄位標題。
export function boardHTML(S, counts, dates) {
  const total = S.members.filter(m => m.tz).length;
  // ⚠ **空的看板要說話。** 一片空白同時可能是三件事：沒有人填、沒有人設時區、
  // 或者大家真的都沒空。三者長得一模一樣，而使用者只會得到「壞了」這個結論。
  // 2026-09-02 咬過一次類似的：格子其實畫出來了，只是在畫面外。
  const filled = S.members.filter(m => (S.slots.get(m.id) || new Set()).size > 0).length;
  const notice = counts.size === 0 ? `<div class="wnote big">這一週的看板是空的。<br>${
      total === 0 ? "還沒有人設定時區，所以誰的時間都畫不出來。"
    : filled === 0 ? "還沒有人填過自己的每週時間。到「我的時間」填一次，其他人就看得到了。"
    : "有人填過，但這一週沒有任何一格對得上——如果剛改過時區，先確認那邊是對的。"
    }</div>` : "";
  const rows = [];
  for (let min = 0; min < 1440; min += 30) {
    const cells = COL_ORDER.map((_, col) => {
      const who = counts.get(col + ":" + min) || [];
      const lv = !who.length ? 0 : Math.min(4, Math.ceil(who.length / Math.max(1, total) * 4));
      return `<td><button class="cell lv${lv}" data-act="peek" data-c="${col}" data-m="${min}"
        aria-label="${esc(hhmm(min))} ${who.length} 人有空">${who.length || ""}</button></td>`;
    }).join("");
    rows.push(`<tr><th class="hr">${min % 60 === 0 ? esc(hhmm(min)) : ""}</th>${cells}</tr>`);
  }
  return `${notice}<div class="gridwrap"><table class="grid">
    <thead><tr><th></th>${COL_ORDER.map((wd, i) =>
      `<th>${DAY_ZH[wd]}<span>${esc(dates[i] || "")}</span></th>`).join("")}</tr></thead>
    <tbody>${rows.join("")}</tbody></table></div>
    <div class="wnote" style="margin-top:14px">格子裡的數字是有空的人數，點一格看是誰。
      一天完整 24 小時都在，往上下捲得到。
      欄位是<b>你自己的</b>星期與時間 —— 別人的時段已經換算過來了，
      所以台北的週一早上會出現在美東的週日晚上。</div>`;
}

// ctx: { free, dayLabel, minute, lines, calUrl, title, copyMsg }
// 參數包成一個物件而不是排成一列：這一頁的參數已經七個了，排成一列的話
// 呼叫端漏傳或順序錯都不會報錯，只會靜靜地畫錯東西。
export function peekHTML(S, ctx) {
  const busy = S.members.filter(m => m.tz && !ctx.free.includes(m.id));
  const noTz = S.members.filter(m => !m.tz);
  return `<div class="scrim" data-act="close-peek"><div class="modal">
    <button class="x" data-act="close-peek" aria-label="關起來">✕</button>
    <h3>${esc(ctx.dayLabel)} ${esc(hhmm(ctx.minute))}</h3>
    <div class="sub">${ctx.free.length} 人有空</div>
    <div class="two">
      <div><i>有空</i>${ctx.free.length
        ? `<ul>${ctx.free.map(id => `<li>${esc(nameOf(S, id))}</li>`).join("")}</ul>`
        : `<div class="empty sm">沒有人</div>`}</div>
      <div><i>沒空</i>${busy.length
        ? `<ul class="dim">${busy.map(m => `<li>${esc(m.name)}</li>`).join("")}</ul>`
        : `<div class="empty sm">沒有人</div>`}</div>
    </div>
    ${noTz.length ? `<div class="wnote">${noTz.length} 個人還沒設定時區，
      他們的時間畫不出來，所以不在上面：${esc(noTz.map(m => m.name).join("、"))}</div>` : ""}

    <div class="times">
      <i>各地當地時間</i>
      <pre id="times">${ctx.lines.map(t => esc(t)).join("\n")}</pre>
      <div class="row">
        <button class="btn ghost sm" data-act="copy-times">複製這幾行</button>
        <span class="mini">${esc(ctx.copyMsg || "")}</span>
      </div>
    </div>

    <label style="margin-top:16px"><i>事件標題</i>
      <input id="evtitle" value="${esc(ctx.title)}" autocomplete="off"></label>
    <div class="row">
      <!-- 用 <a> 不用 <button>：長按與中鍵開新分頁才會有作用。
           標題改的時候由 main.js 直接改這個 href。 -->
      <a class="btn" id="callink" href="${esc(ctx.calUrl)}" target="_blank" rel="noopener">加到 Google 日曆</a>
      <button class="btn ghost" data-act="close-peek">關起來</button>
    </div>
    <div class="wnote" style="margin-top:12px">事件會建在<b>你自己的</b>日曆上，
      預設一小時，時間是這一格的絕對時刻 —— 你邀請的人會看到他們自己時區的時間。
      要邀請誰由你決定，這個連結不會自動加任何人。</div>
  </div></div>`;
}

const nameOf = (S, id) => (S.members.find(m => m.id === id) || {}).name || id;

// ── 我的每週時間 ────────────────────────────────────────────────────
// **批次填寫排在格線前面，而且是預設看得到的那一塊。**
// 規格 §4-3 B：拖曳塗一百個格子在手機上不可行，這點已經實測過。
// 格線留著給微調用，不是主要的填法。
export function mineHTML(S) {
  const opts = [];
  for (let m = 0; m <= 1440; m += 30) opts.push(m);
  // 選單的值從 S 來，不是寫死的 —— 重畫之後使用者剛選的時段要還在，
  // 不然他每加一段就得重選一次，那在手機上就是放棄的理由。
  const sel = (id, val) => `<select id="${id}">${opts.filter(m => m < 1440 || id === "bto")
    .map(m => `<option value="${m}"${m === val ? " selected" : ""}>${m === 1440 ? "24:00" : hhmm(m)}</option>`).join("")}</select>`;
  return `<div class="card">
    <h2>我的每週時間</h2>
    <div class="sub">填「每週固定有空」的時段，不是特定日期。改一次可以用一整個學期。</div>

    <div class="batch">
      <div class="brow">
        <i>時段</i>${sel("bfrom", S.bfrom)} <span>到</span> ${sel("bto", S.bto)}
      </div>
      <div class="brow">
        <i>星期</i>
        <div class="chips">${COL_ORDER.map(wd => {
          const on = S.chips.has(wd);
          return `<button class="chip${on ? " on" : ""}" data-act="chip" data-wd="${wd}"
            aria-pressed="${on}">${DAY_ZH[wd]}</button>`;
        }).join("")}</div>
      </div>
      <div class="brow">
        <i>快捷</i>
        <button class="btn quiet sm" data-act="quick" data-q="weekday">平日</button>
        <button class="btn quiet sm" data-act="quick" data-q="weekend">週末</button>
        <button class="btn quiet sm" data-act="quick" data-q="all">全部</button>
        <button class="btn quiet sm" data-act="quick" data-q="none">清除勾選</button>
      </div>
      <div class="row">
        <button class="btn" data-act="apply" data-mode="add">加入這段</button>
        <button class="btn ghost" data-act="apply" data-mode="del">拿掉這段</button>
      </div>
    </div>

    <div class="brow copy">
      <i>複製</i>
      <select id="copyfrom">${COL_ORDER.map(wd =>
        `<option value="${wd}"${wd === S.copyFrom ? " selected" : ""}>星期${DAY_ZH[wd]}</option>`).join("")}</select>
      <span>複製到勾選的那幾天</span>
      <button class="btn sm" data-act="copyday">複製</button>
    </div>

    <div class="gridwrap mine"><table class="grid">
      <thead><tr><th></th>${COL_ORDER.map(wd => `<th>${DAY_ZH[wd]}</th>`).join("")}</tr></thead>
      <tbody>${(() => {
        const rows = [];
        for (let min = 0; min < 1440; min += 30) {
          const cells = COL_ORDER.map(wd => {
            const on = S.mine.has(wd + ":" + min);
            return `<td><button class="cell ${on ? "on" : ""}" data-act="toggle"
              data-wd="${wd}" data-m="${min}" aria-pressed="${on}"
              aria-label="星期${DAY_ZH[wd]} ${hhmm(min)}"></button></td>`;
          }).join("");
          rows.push(`<tr><th class="hr">${min % 60 === 0 ? hhmm(min) : ""}</th>${cells}</tr>`);
        }
        return rows.join("");
      })()}</tbody></table></div>

    <div class="row sticky">
      <button class="btn" data-act="save" ${S.dirty ? "" : "disabled"}>${S.dirty ? "儲存" : "已儲存"}</button>
      <button class="btn ghost sm" data-act="confirm-same">我確認過了，沒有變</button>
      <span class="mini">${esc(S.mineMsg || "")}</span>
    </div>
    <div class="wnote" style="margin-top:14px">時區：<b>${esc(labelOf(S.myTz))}</b>
      <button class="btn quiet sm" data-act="change-tz">改</button><br>
      填的是這個時區的當地時間。搬家的話記得回來改 —— 改完你所有的時段都會照新的時區重新解讀。</div>
  </div>`;
}

// ── 成員清單 ────────────────────────────────────────────────────────
// 規格 §4-3 C：**這一區是讓看板活下去的關鍵**，沒有它就不知道該催誰。
// 所以「從沒填過」與「沒設時區」的人也要出現（使用者 2026-09-02 裁定）。
export function membersHTML(S, now) {
  const days = t => t == null ? null : Math.floor((now - new Date(t).getTime()) / 86400000);
  return `<div class="card">
    <h2>成員</h2>
    <div class="sub">超過 30 天沒更新的標紅。看板要問的是「這份資料還可信嗎」，
      所以沒有變的人也可以按「我確認過了」把時間往前推。</div>
    <table class="who"><thead><tr><th>名字</th><th>所在地</th><th>上次更新</th></tr></thead><tbody>
    ${S.members.map(m => {
      const d = days(m.updatedAt);
      const stale = d == null || d > 30;
      const filled = (S.slots.get(m.id) || new Set()).size;
      return `<tr class="${stale ? "stale" : ""}">
        <td>${esc(m.name)}${m.team ? `<span class="team">${esc(m.team)}</span>` : ""}</td>
        <td>${m.tz
              ? `${esc(labelOf(m.tz))}<span class="team">${esc(offsetLabel(new Date(now), m.tz))}</span>`
              : `<span class="warn">還沒設定時區</span>`}</td>
        <td>${d == null ? `<span class="warn">還沒填過</span>`
              : `${d} 天前${d > 30 ? `<span class="warn">　該更新了</span>` : ""}${filled ? "" : `<span class="warn">（目前 0 格）</span>`}`}</td>
      </tr>`;
    }).join("")}
    </tbody></table>
    <div class="wnote" style="margin-top:14px">「還沒設定時區」的人，他們填的時間畫不出來，
      所以不會出現在團隊看板上 —— 那不是他們沒空，是我們不知道該把他們畫在哪裡。</div>
  </div>`;
}

export function downHTML() {
  return `<div class="card">
    <h2>連不上資料庫</h2>
    <div class="wnote">現在讀不到看板。你已經填過的時間都還在。
      請寄信到 beyondtaiwan2020@gmail.com 請人看一下。</div>
    <div class="row"><button class="btn ghost" data-act="retry">再試一次</button></div>
  </div>`;
}

export function notCadreHTML() {
  return `<div class="card">
    <h2>這裡只開放給 BT 幹部</h2>
    <div class="wnote">時間看板存的是幹部的每週作息，只有幹部看得到。</div>
    <div class="row"><a class="btn ghost" href="../app/">回入口</a></div>
  </div>`;
}
