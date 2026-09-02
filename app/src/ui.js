// /app/ 的畫面。登入、註冊、忘記密碼、以及「你還不是幹部」那一頁。
//
// 2026-09-02（階段 7 前置）：這幾支從 passport/src/ui.js 原樣搬過來。
// 搬的理由是規格 §2-1 的分工：`/app/` 是登入後的入口，`/passport/` 只剩護照本身。
// 登入表單留在護照裡的話，「護照」這個資料夾同時是登入頁、升級頁與護照，
// 而階段 7 要重做視覺的時候會分不清哪些樣式屬於哪一件事。
//
// **esc 是這裡自己的一份，不是從護照 import 的。** 兩行字的東西，
// 為了它讓 /app/ 去依賴 /passport/ 的模組，等於把「護照壞掉」變成
// 「連登入頁都打不開」。這兩個資料夾之間**不要有任何 import**。

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ⚠ 這裡原本有一段註解寫著「不做自助重設、不做重設畫面、不呼叫
// resetPasswordForEmail（spec §6.3）」。**那段話 2026-09-01 起是錯的** ——
// 自助重設做了，重設畫面在 /reset/，resetPasswordForEmail 在 shared/auth.js。
// 那是規格早期的決定，被實作推翻之後沒有人回來改這段字，於是它變成一句
// 會擋住下一個人的指示。留這幾行是為了說明它被推翻過，不是要繼續守它。
// mode：in（登入）／up（註冊）／forgot（要重設連結）／sent（寄出去了）
// email 只有 sent 用得到，用來把使用者剛才打的字回顯 —— 打錯字的人才看得出來。
export function authHTML(mode, msg, email) {
  const up = mode === "up";

  // ── 忘記密碼：輸入 email ──
  if (mode === "forgot") return `<div class="card">
    <img src="../shared/logo.png" alt="Beyond Taiwan" style="height:30px;display:block;margin-bottom:18px">
    <h2>忘記密碼</h2>
    <div class="sub">輸入你註冊時用的 email，我們寄一封重設連結給你。</div>
    ${msg ? `<div class="wnote" style="margin:0 0 16px">${esc(msg)}</div>` : ""}
    <label><i>Email</i><input id="fpe" type="email" autocomplete="email" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="you@example.com"></label>
    <div class="row">
      <button class="btn" data-act="do-forgot">寄出重設連結</button>
      <button class="btn ghost" data-act="switch-auth" data-m="in">回登入</button>
    </div>
    <div class="wnote" style="margin:16px 0 0"><b>用 Google 登入的話不需要密碼</b>，回登入頁直接按那顆 Google 按鈕就好。這一頁只對「用 email + 密碼註冊」的人有用。</div>
    <div class="wnote" style="margin:12px 0 0">連 email 也想不起來？寄信到 beyondtaiwan2020@gmail.com，我們幫你找。</div>
  </div>`;

  // ── 寄出之後 ──
  // ⚠ **這裡的文案不可以寫「已寄出」。**
  // Supabase 對「存在的信箱」與「不存在的信箱」回一模一樣的成功，那是刻意的：
  // 不然任何人都能拿這個表單一次一個 email 問「這個人是不是 BT 幹部」，
  // 而幹部名單本身就是我們不該外流的東西。
  // 前端的文案要跟那個事實一致 —— 寫「如果這個信箱有帳號」，不要寫「已寄出」。
  // test/ui-pages.test.mjs 有一條在守這件事。
  if (mode === "sent") return `<div class="card">
    <img src="../shared/logo.png" alt="Beyond Taiwan" style="height:30px;display:block;margin-bottom:18px">
    <h2>信寄出去了</h2>
    <div class="sub">如果 <b>${esc(email || "那個信箱")}</b> 有帳號，我們寄了一封重設連結給它。</div>
    <div class="wnote" style="margin:0 0 16px">沒收到的話，先看一下垃圾郵件匣。連結大約一小時內有效，過期了再回來要一次就好。</div>
    <div class="row">
      <button class="btn ghost" data-act="switch-auth" data-m="in">回登入</button>
    </div>
    <div class="wnote" style="margin:16px 0 0">試了幾次都收不到？寄信到 beyondtaiwan2020@gmail.com，我們直接幫你處理。</div>
  </div>`;

  return `<div class="card">
    <img src="../shared/logo.png" alt="Beyond Taiwan" style="height:30px;display:block;margin-bottom:18px">
    <h2>${up ? "註冊 BT 護照" : "登入"}</h2>
    <!-- 註冊不再需要邀請碼（2026-09-01，階段 5-7 把門搬到角色升級）。
         **那格輸入已經移除，不是留著不讀。** 留著的話它是一句謊：使用者會以為
         自己填的東西有作用，打錯了還會以為是自己的問題，而實際上不管填什麼都會
         註冊成功、身分都是 student。**沒有作用的輸入框比沒有輸入框更糟。**
         邀請碼現在在登入之後那一頁輸入（notCadreHTML）。 -->
    <div class="sub">${up ? "先開帳號，之後再輸入邀請碼升級成幹部。" : "用你註冊時的 email 登入。"}</div>
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
    <!-- 「會出現在進度牆上」那段告知從註冊頁搬到升級頁（notCadreHTML）。
         5-7 之後註冊出來的是 student —— 他不會上牆、也還沒有護照，
         在那個時間點講這段話是錯的時機，而且會讓人以為註冊就等於加入 BT。
         真正該講的時刻是**升級成幹部的那一下**，那才是資料開始被別人看得到的時刻。
         規格 §4-5 的原則：要在第一次進入之前明講。 -->
    <!-- 2026-09-02：註冊那顆按鈕的字改過。舊的那句以邀請碼當作註冊的前提，
         **而那個前提 5-7 之後就沒有了** —— 註冊不需要邀請碼，任何人都開得了帳號，
         邀請碼是登入之後升級成幹部才用的。
         錯的方向剛好是最糟的那一種：它讓一個還沒拿到碼的人以為自己不能註冊，
         而他不會來問，他會關掉頁面。
         （這段刻意不引用舊的那句字面 —— HTML 註解是會送到瀏覽器的，
           引用它等於把那句話留在頁面裡，守門也會抓到。） -->
    <div class="row">
      <button class="btn" data-act="${up ? "do-signup" : "do-signin"}">${up ? "註冊" : "登入"}</button>
      <button class="btn ghost" data-act="switch-auth" data-m="${up ? "in" : "up"}">${up ? "我已經有帳號了" : "還沒有帳號，要註冊"}</button>
    </div>
    <!-- Google 登入（規格 §3-4）。**email + 密碼那條路不要拿掉**：
         有人沒有 Google 帳號、有人在中國、有人的 Google 就是登不進去。
         兩條路並存是規格明寫的決定，不是過渡狀態。

         按鈕只有文字、沒有 Google 的彩色 logo：硬規則是一個畫面最多三種顏色
         （見 shared/brand.css），而那個 logo 自己就有四種。用文字是誠實的取捨，
         不是偷懶 —— 要放官方 logo 就得先改硬規則，那不是這一步的事。

         登入與註冊兩種模式都放，因為 Google 那條路沒有「註冊」與「登入」之分：
         第一次點就是註冊，第二次點就是登入，使用者不需要先決定自己是哪一種。 -->
    <div class="row" style="margin-top:6px">
      <button class="btn ghost" data-act="do-google">用 Google 登入 / Continue with Google</button>
    </div>
    <div class="wnote" style="margin:12px 0 0">用 Google 進來的話不需要密碼。<b>還是需要邀請碼</b>——登入之後再輸入。</div>
    <!-- 2026-09-01：寄信接好之後，忘記密碼改成自助為主、組織信箱為輔。
         **組織信箱那條不要刪** —— 自助那條路需要「還記得自己用哪個 email」，
         而連 email 都想不起來的人（換過信箱、當初用學校信箱註冊）沒有別的出口。
         一條自助路徑蓋不住所有情況，留著人工那條的成本只是一行字。 -->
    ${up ? "" : `<div class="wnote" style="margin:16px 0 0">忘記密碼？<button class="btn sm quiet" data-act="switch-auth" data-m="forgot">寄一封重設連結給我</button><br>連 email 也想不起來的話，寄信到 beyondtaiwan2020@gmail.com。</div>`}
  </div>`;
}

// 登入了，但還不是幹部（規格 §3-5）。
//
// 這一頁在階段 5 之前不存在，因為在那之前「能登入」等於「是幹部」——
// 邀請碼擋在註冊那一關。門移到升級之後，就會有一種人是登入著卻什麼都看不到的：
// 用 Google 進來的新人、或還沒輸入邀請碼的人。**沒有這一頁的話他們會看到
// 一本沒有任何活動格子的空護照**，那是 RLS 正常運作的樣子，但對使用者來說像壞掉。
//
// ⚠ 這一頁的位置是暫時的。規格 §2-2 把升級入口放在 /app/，而 /app/ 是階段 7 才做。
//    階段 7 要把這一頁搬過去，護照就回到「只有幹部看得到」的單純狀態。
//
// 邀請碼那格的 autocapitalize / autocorrect / spellcheck 全部關掉，理由跟
// authHTML 那格一模一樣（見它上面那段註解）：**大小寫已經不是理由**，
// 資料庫兩邊都套 upper(btrim(...))；留著是為了擋 autocorrect 把使用者打的字
// 換成別的字 —— 那是使用者看不見的竄改，資料庫救不了。
export function notCadreHTML(msg) {
  return `<div class="card">
    <img src="../shared/logo.png" alt="Beyond Taiwan" style="height:30px;display:block;margin-bottom:18px">
    <h2>你還不是 BT 幹部</h2>
    <div class="sub">護照目前只開放給幹部。你已經登入了，但還沒有升級。</div>
    ${msg ? `<div class="wnote" style="margin:0 0 16px">${esc(msg)}</div>` : ""}
    <label><i>邀請碼 / Invite code</i><input id="ci" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="跟組長拿"></label>
    <div class="wnote" style="margin:0 0 16px">升級之後，你的姓名、團隊、大頭照與蓋章紀錄會出現在全體進度牆上，<b>其他 BT 幹部看得到，包含你的大頭照</b>。你寫的心得和上傳的活動照片只留在你自己的護照裡，<b>其他幹部看不到</b>。</div>
    <div class="row">
      <button class="btn" data-act="do-claim">我是幹部，我有邀請碼</button>
      <button class="btn sm quiet" data-act="signout">登出</button>
    </div>
    <div class="wnote" style="margin:16px 0 0">還不是幹部也沒關係，這個帳號留著。之後開放給學員的功能會用同一個帳號登入。</div>
  </div>`;
}
// 登入之後的選單。**這一頁不放還不存在的東西。**
// 時間看板（階段 8）現在沒有，所以這裡就沒有它的入口 ——
// 灰掉的「敬請期待」看起來像壞掉的功能，而且會有人來問什麼時候好。
export function menuHTML(who) {
  return `<div class="card">
    <img src="../shared/logo.png" alt="Beyond Taiwan" style="height:30px;display:block;margin-bottom:18px">
    <h2>Beyond Taiwan</h2>
    <div class="sub">${who ? esc(who) : ""}</div>
    <div class="menu">
      <a class="mitem" href="../passport/">
        <b>幹部護照</b>
        <span>這一年的活動、章、心得與照片</span>
      </a>
      <a class="mitem" href="../availability/">
        <b>每週時間看板</b>
        <span>填自己每週固定有空的時段，約會議時直接挑</span>
      </a>
    </div>
    <div class="row" style="margin-top:22px">
      <button class="btn ghost sm" data-act="signout">登出</button>
    </div>
  </div>`;
}

// 連不上資料庫時的畫面。跟護照那一份是**兩份**，不是共用的：
// 護照那份說「你的資料都還在」，那句話在登入頁上沒有意義（他還沒有資料）。
// 文案不同，所以是不同的東西，不要為了少一份檔案硬合起來。
export function downHTML() {
  return `<div class="card">
    <img src="../shared/logo.png" alt="Beyond Taiwan" style="height:30px;display:block;margin-bottom:18px">
    <h2>資料庫休眠中</h2>
    <div class="wnote" style="margin:16px 0 0">
      現在連不上資料庫，所以沒有辦法登入。請寄信到 beyondtaiwan2020@gmail.com 請人恢復。
    </div>
    <div class="row" style="margin-top:18px"><button class="btn ghost" data-act="retry">再試一次</button></div>
  </div>`;
}
