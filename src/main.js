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
  activities: [], months: [], destinations: [], visas: {},
  page: 0, view: "passport", wall: null, wallLoading: false, wallError: false,
  down: false, justStamped: null, flipped: {}, justFlipped: null
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
  // 這一條要排在所有其他分支前面：連不上資料庫的時候，S.user / S.profile 全是空的，
  // 少了它畫面會掉回登入頁，等於對一個明明登入著的人說「請登入」（spec §8.1）。
  if (S.down) { el.innerHTML = UI.downHTML(); return; }
  if (!S.user) { el.innerHTML = UI.authHTML(S.authMode || "in", S.authMsg); return; }
  // Task 6 之後 trigger 會先建一列空的 passport，所以「有 profile 但兩個名字都空」
  // 也要當成還沒申請過，繼續停在申請畫面（brief Step 6）。
  if (!S.profile || !S.profile.name_zh && !S.profile.name_en) { el.innerHTML = UI.setupHTML(S.profile, S.user); return; }
  // 引導頁擋在這裡，**在「已經有護照」之後**：三張卡講的是護照裡的東西，
  // 先有護照再解釋它，順序才通。核發完 main.js 會 boot() 一次，
  // 那時候 intro_seen 還是 false，所以不必另外呼叫什麼，這一條就會接住。
  //
  // 這裡刻意用嚴格比較 `=== false` 而不是 `!S.profile.intro_seen`：
  // 程式碼會先進 commit，遷移是使用者稍後才手動跑的。這中間欄位不存在，
  // S.profile.intro_seen 是 undefined。用 !undefined 判斷的話結果為真，
  // 引導頁擋住每一個人，而 markIntroSeen() 又會因為欄位不存在而寫入失敗——
  // 只在 console 留一筆——下次載入再擋一次，那是一個進不去護照的死結。
  // 嚴格比較讓這個功能自己等資料庫準備好：欄位不存在時 undefined !== false，
  // 引導頁不出現；遷移跑完之後 default false 才開始生效。
  if (S.profile.intro_seen === false) { el.innerHTML = UI.introHTML(); return; }
  el.innerHTML = UI.barHTML(S) + (S.view === "wall" ? UI.wallHTML(S) : UI.bookHTML(S));
}

async function loadWall() {
  S.wallLoading = true; S.wallError = false; render();
  try {
    S.wall = await DATA.loadWall();
  } catch (e) {
    // Task 6 之前 loadWall 回的是本機資料，不可能失敗，所以這裡本來沒有 catch。
    // 接上資料庫之後它會失敗，而**沒有 catch 的後果不是報錯，是永遠轉圈**：
    // 下面的 wallLoading = false 跑不到，畫面就停在「正在讀取全體進度…」不動。
    // 那看起來像網路很慢而不是壞掉，學生會一直等下去。
    console.error("進度牆讀取失敗：", e);
    S.wallError = true;
  } finally {
    S.wallLoading = false; render();
  }
}

/* ---------- modal ---------- */
function openModal(id) {
  const a = S.activities.find(x => x.id === id); if (!a) return;
  const st = S.stamps[id];
  const entry = S.entries[id] || {};
  const d = document.createElement("div");
  d.className = "scrim"; d.id = "scrim";
  d.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${UI.esc(a.title_zh)}">
    <div class="mt">${UI.esc(UI.CATNAME[a.category] || "")} · ${String(a.month).padStart(2, "0")}月</div>
    <h3>${UI.esc(a.title_zh)}</h3>
    <div style="font-size:10px;font-weight:600;letter-spacing:.14em;opacity:.45;text-transform:uppercase;margin-bottom:12px">${UI.esc(a.title_en)}</div>
    <p style="font-size:13.5px;opacity:.7;margin:0 0 18px">${UI.esc(a.description)}</p>
    <!-- 回望區塊的位置：在活動說明之後、要填的東西之前（spec §7.3「顯示在題目上方」）。
         這個順序是有意義的 —— 先看到自己九月寫的，接著就是今天要寫的那一格，
         視線是連續的。放到輸入框下面的話，人已經開始打字了才看到，等於沒有回望。 -->
    ${UI.callbackHTML(S, a)}
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

  if (act === "intro-done") {
    // 樂觀更新：先讓畫面走，再背景寫資料庫。
    S.profile.intro_seen = true;
    render();
    try { await DATA.markIntroSeen(); }
    catch (e) {
      // **不跳 toast**。寫失敗的後果只是下次登入再看一次引導頁，
      // 那不值得用一句錯誤訊息去打斷一個剛核發完護照的人。
      console.error("intro_seen 沒有寫進資料庫，下次登入會再看到引導頁：", e);
    }
    return;
  }

  if (act === "tab") { S.view = b.dataset.v; render(); if (S.view === "wall" && !S.wall) loadWall(); return; }
  if (act === "refresh") { loadWall(); return; }
  if (act === "prev") { S.page = Math.max(0, S.page - 1); render(); return; }
  // 邊界問 pagesOf，不要自己算 months.length —— 書裡不是只有月份頁。
  if (act === "next") { S.page = Math.min(UI.pagesOf(S).length - 1, S.page + 1); render(); return; }
  if (act === "go") { S.page = Number(b.dataset.p); render(); return; }
  // 翻面。只改介面狀態，不碰資料庫 —— 哪一面朝上不是護照內容（spec §4）。
  if (act === "flip") {
    const id = b.dataset.id;
    S.flipped[id] = b.dataset.to;
    S.justFlipped = id;
    render();
    return;
  }

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
    // spec §6.2 的再次告知。位置是刻意的：**在開檔案選擇器之前**問。
    // 挑完照片才問等於「都選好了，不上傳很可惜」，那不是同意，是沉沒成本。
    // 大頭照跟心得照片不同 —— 心得只有自己看得到，大頭照會出現在全體進度牆上。
    if (!confirm("你的大頭照會出現在全體進度牆上，其他 BT 幹部看得到。要繼續上傳嗎？")) return;
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

  if (act === "retry") {
    // 不先 render()：那會在 S.down 已經是 false、資料卻還沒回來的時候閃一下登入頁或申請頁。
    // 直接寫一句「正在重新連線…」，讓按下去的人知道有反應 —— 重試最長要等 7 秒（見 boot）。
    S.down = false;
    root().innerHTML = `<div class="empty">正在重新連線…</div>`;
    await boot();
    return;
  }

  if (act === "export") {
    try {
      const b = await DATA.exportPassport();
      const blob = new Blob([JSON.stringify(b, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bt-passport-${b.passport_no}-${b.exported_at.slice(0, 10)}.json`;
      a.click();
      // **不要**在 click() 的下一行就 revoke。下載是非同步開始的，網址在瀏覽器真的
      // 去讀它之前被撤銷的話，下載會安靜地失敗 —— 沒有錯誤、沒有檔案，而使用者
      // 剛剛才看到「備份下載好了」。延後釋放，寧可多佔一下記憶體。
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast("備份下載好了。收在你自己的雲端硬碟裡。");
    } catch (e) { toast(e.message); }
    return;
  }

  if (act === "import") {
    const i = document.createElement("input");
    i.type = "file"; i.accept = "application/json,.json";
    i.onchange = async () => {
      const f = i.files && i.files[0]; if (!f) return;
      let b;
      // 這裡用 alert 不是 toast：接下來就是一個會蓋掉資料的決定，
      // 而 toast 兩秒就消失。看不到的錯誤訊息等於沒有錯誤訊息。
      try { b = DATA.parseBackup(await f.text()); }
      catch (e) { alert(e.message); return; }

      // 匯入前顯示摘要（spec §7.4）。passport_no 可能不存在（手工改過的檔案
      // 仍可能通過格式檢查），那時候就不要印出「原本屬於護照 undefined」。
      const summary = `這個備份檔有 ${b.stamps.length} 個章，`
        + `匯出日期 ${String(b.exported_at || "不明").slice(0, 10)}`
        + (b.passport_no ? `，原本屬於護照 ${b.passport_no}。` : "。");
      const has = Object.keys(S.stamps).length;
      // spec §7.4 要的是「說清楚會蓋掉什麼」。護照資料**兩種模式都會被覆蓋** ——
      // 合併只合併章與心得，姓名那些一律換成備份檔裡的。不講的話，選了「合併」的人
      // 會以為自己什麼都沒被動到，然後發現名字變成別人的（跨帳號還原時特別明顯）。
      // 2026-08-17 實測跨帳號合併時撞到：B 選了合併，名字變成 A 的，而對話框從頭到尾沒提。
      const profileNote = "還原也會把你的姓名、團隊、標語和大頭照換成備份檔裡的。";

      let mode = "overwrite";
      if (has > 0) {
        // 目前護照已有內容時，明確詢問覆蓋還是合併；預設覆蓋，並說清楚會蓋掉什麼。
        mode = confirm(
          `${summary}\n\n`
          + `你現在的護照已經有 ${has} 個章。\n\n`
          + `按「確定」＝ 覆蓋：現在這 ${has} 個章、心得和照片會全部刪掉，換成備份檔裡的。\n`
          + `按「取消」＝ 合併：兩邊的章都留，同一格以備份檔的內容為準。\n\n`
          + `${profileNote}（兩種選擇都一樣）`
        ) ? "overwrite" : "merge";
      } else if (!confirm(`${summary}\n\n${profileNote}\n\n要還原到你現在的帳號嗎？`)) {
        return;
      }

      try {
        const r = await DATA.importPassport(b, mode);
        toast(`還原了 ${r.written} 個章。`);
        await boot();
      } catch (e) {
        // 這句話能說得這麼肯定，是因為 importPassport 是先寫後刪的（見該函式的註解）。
        // 換成先刪後寫的話這裡就是在騙人：資料早就沒了。改那個順序之前先改這句話。
        console.error("匯入失敗：", e);
        toast("還原失敗，資料沒有被改動。再試一次。");
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
    // **列出要清掉的，不是列出要保留的。** 要清的正好是「護照內容」，
    // 那是一組穩定的東西；要保留的（user、activities、months、milestones⋯）
    // 每次新增參考資料都要記得加，而那件事已經漏過（見 boot 的註解）。
    // 用 Object.assign 就地覆寫而不是 S = {...}：後者會把沒列到的 key 整個丟掉。
    // 注意 user 不在清單裡——清除的是護照內容不是登入狀態，就地覆寫不列它
    // 就等於不動它，不需要像原本的寫法那樣特地寫 user: S.user 才能保住它。
    //
    // **判準是「參考資料還是護照內容」**，不是「初始 state 有沒有這個 key」。
    // activities、months、milestones、destinations 是參考資料，全站共用、
    // 跟這個人清不清除無關，所以不列。stamps、entries、visas 是護照內容，要列。
    // visas 在這裡：城市是「我到過哪裡」，清除這本護照就是把那句話一起清掉
    // （spec §9.11；資料庫那一側的 delete 見 DATA.clearAll）。
    // destinations 2026-08-26 一度被列進來過 —— 那是控制端 brief 寫錯，
    // 它直接牴觸上面那行「要保留的（user、activities、months、milestones⋯）」。
    Object.assign(S, {
      authMode: "in", authMsg: "",
      profile: null, stamps: {}, entries: {}, visas: {},
      page: 0, view: "passport", wall: null, wallLoading: false, wallError: false,
      down: false, justStamped: null, flipped: {}, justFlipped: null
    });
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
  if (e.key === "ArrowRight" && S.page < UI.pagesOf(S).length - 1) { S.page++; render(); }
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
    // 不能只看「查不查得到人」：連不上的時候也查不到，而那時候顯示登入頁
    // 等於告訴一個登入中的人「你被登出了」。兩者要分開處理（見 data.js 的 currentUserDetailed）。
    const who = await DATA.currentUserDetailed();
    if (who.offline) { S.down = true; render(); return; }
    S.user = who.user;
    if (!S.user) { S.down = false; render(); return; }

    // 連不上資料庫時 loadAll 要 **7 秒** 才會失敗（2026-08-17 實測：postgrest-js 對網路
    // 失敗有內建重試與退避，五個查詢各重試四次，總共 20 次 fetch）。那 7 秒裡畫面上
    // 只有 index.html 的「載入護照中…」，看起來是「很慢」而不是「出事了」，學生會一直等。
    //
    // 這裡**不縮短**那 7 秒，也不加逾時：逾時等於在網路慢的時候，把一條還會成功的連線
    // 主動砍掉，那是拿「已經壞掉的體驗」去換「本來會好的結果」。改成等太久就換句話說。
    const slow = setTimeout(() => {
      const el = root();
      if (el) el.innerHTML = `<div class="empty">還在連資料庫…<br>如果一直停在這裡，可能是資料庫休眠了。</div>`;
    }, 2500);
    let all;
    try { all = await DATA.loadAll(); } finally { clearTimeout(slow); }

    // **整包裝進去，不要手寫逐欄指派。** 手寫的話 loadAll 每多回傳一個東西，
    // 這裡就要記得加一行 —— 而那件事已經漏過：milestones 從上線起就沒被裝進 S，
    // 里程碑 UI 在正式站上是死的，而 milestoneState 的 (S.milestones || [])
    // 讓它不 throw、安靜地不渲染，所以沒有人發現（2026-08-25 抓到）。
    // Object.assign 讓這個 bug class 不存在，而不是被守住。
    Object.assign(S, all);
    // active === false 的活動要濾掉。這一行留在這裡而不是搬進 data.js：
    // data.js 的職責是「把資料庫裡的東西拿回來」，要不要顯示是畫面的事。
    S.activities = all.activities.filter(a => a.active !== false);
    S.down = false;
    render();
  } catch (e) {
    // 畫面上永遠是 spec §8.1 那一句，但**維護者要看得到真正的原因**：休眠、網路斷、
    // 政策改壞了，對學生來說下一步都一樣（寄信給組織），對修的人完全不一樣。
    console.error("載入失敗，畫面顯示的是「資料庫休眠中」那一頁。真正的原因：", e);
    S.down = true;
    render();
  }
}
boot();
