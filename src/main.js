// App 邏輯：state、事件委派、跟 data.js / ui.js 對話。boot() 是具名函式
// （不是原型的匿名 IIFE），因為 Task 5 登入成功後要再呼叫一次。
//
// 原型用 S.photos + hydratePhotos() 做照片延遲載入，因為 window.storage 把
// 照片存在跟其他資料分開的 key 下。這裡的 data.js 用 loadAll() 一次把照片
// 隨 entries/profile 帶回，延遲載入沒有存在理由，留著會變成第二個真相來源，
// 所以整個拿掉：idPageHTML 讀 S.profile.avatar，slotHTML 讀 S.entries[id]。
import * as DATA from "./data.js";
import * as UI from "./ui.js";

let S = {
  user: null, authMode: "in", authMsg: "",
  profile: null, stamps: {}, entries: {},
  activities: [], months: [],
  page: 0, view: "passport", wall: null, wallLoading: false,
  justStamped: null
};

function compress(file, maxDim, quality) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error("read"));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => rej(new Error("decode"));
      img.onload = () => {
        let { width: w, height: h } = img;
        const sc = Math.min(1, maxDim / Math.max(w, h));
        w = Math.round(w * sc); h = Math.round(h * sc);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        res(c.toDataURL("image/jpeg", quality));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

let toastT;
function toast(msg) {
  document.querySelectorAll(".toast").forEach(n => n.remove());
  const d = document.createElement("div");
  d.className = "toast"; d.textContent = msg; d.setAttribute("role", "status");
  document.body.appendChild(d);
  clearTimeout(toastT);
  toastT = setTimeout(() => d.remove(), 2600);
}

/* ---------- render ---------- */
const root = () => document.getElementById("bt-root");

function render() {
  const el = root();
  if (!S.user) { el.innerHTML = UI.authHTML(S.authMode || "in", S.authMsg); return; }
  // Task 6 之後 trigger 會先建一列空的 passport，所以「有 profile 但兩個名字都空」
  // 也要當成還沒申請過，繼續停在申請畫面（brief Step 6）。
  if (!S.profile || !S.profile.name_zh && !S.profile.name_en) { el.innerHTML = UI.setupHTML(S.profile, S.user); return; }
  el.innerHTML = UI.barHTML(S) + (S.view === "wall" ? UI.wallHTML(S) : UI.bookHTML(S));
}

async function loadWall() {
  S.wallLoading = true; render();
  S.wall = await DATA.loadWall();
  S.wallLoading = false; render();
}

/* ---------- modal ---------- */
function openModal(id) {
  const a = S.activities.find(x => x.id === id); if (!a) return;
  const st = S.stamps[id];
  const entry = S.entries[id] || {};
  const d = document.createElement("div");
  d.className = "scrim"; d.id = "scrim";
  d.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${UI.esc(a.title_zh)}">
    <div class="mt">${UI.CATNAME[a.category]} · ${String(a.month).padStart(2, "0")}月</div>
    <h3>${UI.esc(a.title_zh)}</h3>
    <div style="font-size:10px;font-weight:600;letter-spacing:.14em;opacity:.45;text-transform:uppercase;margin-bottom:12px">${UI.esc(a.title_en)}</div>
    <p style="font-size:13.5px;opacity:.7;margin:0 0 18px">${UI.esc(a.description)}</p>
    <label><i>日期 / Date</i><input type="date" id="md" value="${UI.esc(st ? st.date : UI.today())}"></label>
    <label><i>一句話 / One line（選填，最多 60 字）</i><textarea id="mn" maxlength="60" placeholder="那天發生了什麼？">${st ? UI.esc(entry.note || "") : ""}</textarea></label>
    <label><i>照片（選填，只存在你的護照裡）</i><input type="file" id="mf" accept="image/*"></label>
    <img class="prev" id="mp" src="${UI.esc(entry.photo || "")}" style="${entry.photo ? "" : "display:none"}" alt="">
    <div class="row" style="margin-top:14px">
      <button class="btn" data-act="stamp" data-id="${id}">${st ? "更新" : "蓋章"}</button>
      <button class="btn ghost" data-act="close">取消</button>
      ${st ? `<button class="btn ghost sm" data-act="unstamp" data-id="${id}" style="margin-left:auto">撕掉這格</button>` : ""}
    </div>
  </div>`;
  document.body.appendChild(d);
  d.addEventListener("click", e => { if (e.target === d) d.remove(); });
  const f = d.querySelector("#mf");
  f.addEventListener("change", async () => {
    const file = f.files && f.files[0]; if (!file) return;
    try {
      const url = await compress(file, 640, 0.68);
      const p = d.querySelector("#mp");
      p.src = url; p.style.display = "block"; p.dataset.new = "1";
    } catch (e) { toast("這張圖讀不到，換一張試試"); }
  });
  setTimeout(() => { const n = d.querySelector("#mn"); if (n) n.focus(); }, 30);
}

async function doStamp(id) {
  const d = document.getElementById("scrim"); if (!d) return;
  const date = d.querySelector("#md").value || UI.today();
  const note = d.querySelector("#mn").value.trim();
  const p = d.querySelector("#mp");
  const photo = (p.style.display !== "none" && p.src && p.src.startsWith("data:")) ? p.src : null;
  const fresh = !S.stamps[id];

  S.stamps[id] = { date };
  S.entries[id] = { note, photo };
  S.justStamped = fresh ? id : null;
  d.remove();
  render();

  try {
    await DATA.saveStamp(id, { date, note, photo });
    toast(fresh ? "蓋好了。" : "已更新。");
  } catch (e) {
    toast("沒有存起來，再試一次。");
  }
}

/* ---------- events ---------- */
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act;

  if (act === "switch-auth") { S.authMode = b.dataset.m; S.authMsg = ""; render(); return; }

  if (act === "do-signin" || act === "do-signup") {
    const email = document.getElementById("ae").value.trim();
    const pw = document.getElementById("ap").value;
    // 邀請碼的正規化**整套都在資料庫做**，前端不負責。註冊 trigger 的比對是
    //   where upper(btrim(code)) = upper(btrim(v_code))
    // 兩邊都先去掉前後空白、再轉成大寫才比，所以學生打大寫、打小寫、前後多了空白，
    // 都對得到管理員存的那一組；管理員存的是小寫還是前後帶空白，也一樣對得到。
    //
    // 這裡留著的 .trim() 只是順手（送出去的值乾淨一點、console 看起來清楚），
    // **正確性不靠它** —— 就算它哪天被拿掉，資料庫那邊照樣會對到。
    //
    // 為什麼要講到這個地步：2026-08-17 在正式站台上咬到人。當時這一行是 .trim()
    // 加 .toUpperCase()，管理員建了一組小寫的 bt2026test（uses_left = 5，SQL 裡查得到），
    // 學生怎麼打都被告知「這個邀請碼不對，或是已經被用完了」。攔下來的封包是
    //   輸入 "bt2026test" → 送出 "BT2026TEST"
    // 而 trigger 當時是 `where code = v_code`，嚴格相同、分大小寫，對不到 → raise → 500。
    // 前端轉大寫加上資料庫嚴格比對，等於**偷偷規定「所有邀請碼都必須用大寫存」**，
    // 而這條規定沒有寫進 spec、沒有寫進 README、也沒有人告訴過管理員。
    // 真正的病根是「正規化被拆在前端和資料庫兩層、各做一半」，所以修法是把它整個
    // 搬到資料庫（見 supabase/migrations/2026-08-17-invite-code-case-insensitive.sql）。
    // **不要把 .toUpperCase()、也不要把任何其他大小寫轉換加回這一行。**
    // 前端一旦又開始改使用者打進來的值，同一個坑就會以另一個形狀回來。
    const inv = document.getElementById("ai") ? document.getElementById("ai").value.trim() : "";
    // 欄位空的時候不要打網路。實測過（2026-08-17，probe 情境 3 的意外）：email 空著送
    // 出去，GoTrue 回的是 AuthApiError / 400 / validation_failed
    //「Unable to validate email address: invalid format」—— 一趟往返，只為了知道
    // 這一格是空的，而空不空前端自己看得到。擋在這裡就不必白跑。
    // 畫面上顯示的是既有文案（authMessage(null) 取得，文案的真相來源仍然只有
    // data.js 的 MSG 一處）。
    //
    // 「有填但格式不對」（例如 wang@gmail 漏了 .com）刻意**不**擋在這裡：那種要走到
    // 伺服器才知道對不對，而且 spec §6.1 已經有專屬的一句（badEmail），由 data.js 的
    // RULES 認 validation_failed 之後翻出來。不要在這裡自己寫 email 格式的正規表示式 ——
    // 那會變成第二套判斷標準，而且一定跟 GoTrue 的不一樣。
    if (!email || !pw) {
      S.authMsg = DATA.authMessage(null);
      render();
      return;
    }
    try {
      if (act === "do-signup") await DATA.signUp(email, pw, inv);
      else await DATA.signIn(email, pw);
      await boot();
    } catch (e) {
      S.authMsg = e.message;
      render();
    }
    return;
  }

  if (act === "signout") { await DATA.signOut(); location.reload(); return; }

  if (act === "tab") { S.view = b.dataset.v; render(); if (S.view === "wall" && !S.wall) loadWall(); return; }
  if (act === "refresh") { loadWall(); return; }
  if (act === "prev") { S.page = Math.max(0, S.page - 1); render(); return; }
  if (act === "next") { S.page = Math.min(S.months.length, S.page + 1); render(); return; }
  if (act === "go") { S.page = Number(b.dataset.p); render(); return; }
  if (act === "open") { openModal(b.dataset.id); return; }
  if (act === "close") { const d = document.getElementById("scrim"); if (d) d.remove(); return; }
  if (act === "stamp") { doStamp(b.dataset.id); return; }

  if (act === "unstamp") {
    const id = b.dataset.id;
    if (!confirm("撕掉這格？日期、心得和照片都會不見。")) return;
    delete S.stamps[id];
    delete S.entries[id];
    const d = document.getElementById("scrim"); if (d) d.remove();
    render();
    try {
      await DATA.removeStamp(id);
      toast("撕掉了。");
    } catch (e) {
      toast("沒有存起來，再試一次。");
    }
    return;
  }

  if (act === "edit") { root().innerHTML = UI.setupHTML(S.profile, S.user); return; }
  if (act === "cancel") { render(); return; }

  if (act === "issue") {
    const name_zh = document.getElementById("fz").value.trim();
    const name_en = document.getElementById("fe").value.trim();
    if (!name_zh && !name_en) { toast("至少填一個名字"); return; }
    const p = {
      name_zh, name_en: name_en || name_zh,
      team: document.getElementById("ft").value,
      motto: document.getElementById("fm").value.trim()
    };
    try {
      await DATA.saveProfile(p);
      await boot();
      S.view = "passport"; S.page = 0;
      render();
      toast("護照核發完成。");
    } catch (e) { toast("沒有存起來，再試一次。"); }
    return;
  }

  if (act === "avatar") {
    const i = document.createElement("input"); i.type = "file"; i.accept = "image/*";
    i.onchange = async () => {
      const f = i.files && i.files[0]; if (!f) return;
      let url;
      try {
        url = await compress(f, 420, 0.7);
      } catch (err) {
        toast("這張圖讀不到，換一張試試");
        return;
      }
      S.profile.avatar = url;
      render();
      try {
        await DATA.saveAvatar(url);
      } catch (err) {
        toast("大頭照沒有存起來，再試一次");
      }
    };
    i.click(); return;
  }

  if (act === "reset") {
    if (!confirm("清除這本護照？所有的章、心得和照片都會消失，無法復原。")) return;
    try {
      await DATA.clearAll();
    } catch (e) {
      toast("沒有清除成功，再試一次。");
      return;
    }
    // user / authMode / authMsg 一定要帶過去。清除的是護照內容，不是登入狀態 ——
    // 漏掉 user 的話，下一次 render() 會撞上 `if (!S.user)` 掉回登入頁，
    // session 明明還好好的，學生卻以為自己被登出了。
    S = {
      user: S.user, authMode: "in", authMsg: "",
      profile: null, stamps: {}, entries: {},
      activities: S.activities, months: S.months,
      page: 0, view: "passport", wall: null, wallLoading: false,
      justStamped: null
    };
    render();
    return;
  }
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") { const d = document.getElementById("scrim"); if (d) d.remove(); return; }
  if (document.getElementById("scrim") || !S.profile) return;
  if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (S.view !== "passport") return;
  if (e.key === "ArrowLeft" && S.page > 0) { S.page--; render(); }
  if (e.key === "ArrowRight" && S.page < S.months.length) { S.page++; render(); }
});

/* ---------- boot ---------- */
export async function boot() {
  try {
    // 先問「現在是誰」。沒有人登入就到此為止：render() 會停在登入頁，
    // 不去讀護照內容（讀了也只會被 RLS 擋掉）。登入成功後 main.js 會再呼叫一次
    // boot()，那時候 S.user 有值，才會往下走。
    // config.js 填錯時 client 建不出來，這裡拿到空字串以外的東西，
    // 登入頁就會帶著「現在連不上資料庫」那句出現，而不是一片空白（spec §8.1）。
    S.authMsg = DATA.configMessage();
    S.user = await DATA.currentUser();
    if (!S.user) { render(); return; }

    const all = await DATA.loadAll();
    S.activities = all.activities.filter(a => a.active !== false);
    S.months = all.months;
    S.profile = all.profile;
    S.stamps = all.stamps;
    S.entries = all.entries;
    render();
  } catch (e) {
    root().innerHTML = `<div class="empty">活動資料讀不到，重新整理試試。</div>`;
  }
}
boot();
