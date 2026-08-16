// 純渲染層：只吃 state（S）與活動/月份資料，吐 HTML 字串。不碰儲存，不碰 DOM 事件。
// passportNo 從 data.js import（data.js 不可以反向依賴這裡，見該檔案的註解）。
import { passportNo } from "./data.js";

const TEAMS = ["Curriculum Team", "Mentorship Team", "Marketing Team", "Sponsorship Team", "Internship Team", "Community Relations Team", "President's Office"];

export const CATNAME = {
  gather: "聚會 GATHER",
  prompt: "題目 PROMPT",
  frame:  "鏡頭 FRAME"
};

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
  const done = Object.keys(S.stamps).length;
  return `<div class="bar">
    <img src="./logo.png" alt="Beyond Taiwan">
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected="${S.view === "passport"}" data-act="tab" data-v="passport">我的護照</button>
      <button role="tab" aria-selected="${S.view === "wall"}" data-act="tab" data-v="wall">進度牆</button>
    </div>
    <div class="sp"></div>
    <div class="prog"><small>Stamps collected</small>${done} <span style="opacity:.4">/ ${S.activities.length}</span></div>
  </div>`;
}

export function bookHTML(S) {
  return `<div class="book">
    <div class="page turn">${S.page === 0 ? idPageHTML(S) : monthPageHTML(S, S.months[S.page - 1])}</div>
    <div class="nav">
      <button class="arrow" data-act="prev" ${S.page === 0 ? "disabled" : ""}>← 前一頁</button>
      <div class="dots">
        <button data-act="go" data-p="0" aria-current="${S.page === 0}" aria-label="資料頁" title="資料頁"></button>
        ${S.months.map((m, i) => {
          const acts = S.activities.filter(a => a.month === m.month);
          const on = acts.every(a => S.stamps[a.id]) ? 1 : 0;
          const zh = MONTH_ZH[m.month] || String(m.month);
          return `<button data-act="go" data-p="${i + 1}" data-on="${on}" aria-current="${S.page === i + 1}" aria-label="${zh}" title="${zh}"></button>`;
        }).join("")}
      </div>
      <button class="arrow" data-act="next" ${S.page === S.months.length ? "disabled" : ""}>下一頁 →</button>
    </div>
  </div>`;
}

export function idPageHTML(S) {
  const p = S.profile;
  const [l1, l2] = mrz(p);
  const av = S.profile.avatar ? `<img src="${esc(S.profile.avatar)}" alt="">` : `<span>點此上傳<br>大頭照</span>`;
  const done = Object.keys(S.stamps).length;
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
    ${done === total ? `<div class="overprint" style="position:static;display:inline-block;margin-top:22px;transform:rotate(-3deg)">${total} / ${total} · FULL</div>` : ""}
    <div class="mrz">${esc(l1)}<br>${esc(l2)}</div>
    <div class="row" style="margin-top:18px">
      <button class="btn ghost sm" data-act="edit">編輯資料</button>
      <button class="btn ghost sm" data-act="reset">清除這本護照</button>
    </div>`;
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

export function monthPageHTML(S, m) {
  const acts = S.activities.filter(a => a.month === m.month);
  const full = acts.every(a => S.stamps[a.id]);
  const zh = MONTH_ZH[m.month] || String(m.month);
  return `${full ? `<div class="overprint">MONTH CLEARED</div>` : ""}
    <div class="mhead">
      <div class="mnum">${String(m.month).padStart(2, "0")}</div>
      <div class="mzh">${zh}</div>
      <div class="mtheme"><b>${esc(m.theme_zh)}</b><span>${esc(m.theme_en)}</span></div>
    </div>
    <div class="slots">${acts.map(a => slotHTML(S, a)).join("")}</div>`;
}

export function slotHTML(S, a) {
  const st = S.stamps[a.id];
  const entry = S.entries[a.id] || {};
  const anim = st && S.justStamped === a.id;
  if (anim) S.justStamped = null;
  return `<button class="slot" data-act="open" data-id="${a.id}" data-done="${st ? 1 : 0}">
    <span class="cat">${CATNAME[a.category]}</span>
    <span class="ttl">${esc(a.title_zh)}</span>
    <span class="en">${esc(a.title_en)}</span>
    ${st ? `${stampHTML(a, st, anim)}
        ${entry.note ? `<span class="note">${esc(entry.note)}</span>` : ""}
        ${entry.photo ? `<img class="thumb" src="${esc(entry.photo)}" alt="">` : ""}`
      : `<span class="hint">${esc(a.description)}</span><span class="cta">蓋章 →</span>`}
  </button>`;
}

export function wallHTML(S) {
  if (S.wallLoading) return `<div class="wall"><div class="empty">正在讀取全體進度…</div></div>`;
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
        return `<div class="person">
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

export function setupHTML(p) {
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
    </div>
  </div>`;
}
