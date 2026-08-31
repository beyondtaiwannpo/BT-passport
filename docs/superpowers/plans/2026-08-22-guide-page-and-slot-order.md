# 說明頁、三格順序、月份時刻 實作計畫

> **2026-08-31 註記：這是歷史紀錄，內容保持原樣。**
>
> 這份寫於 2026-08-22，當時 repo 叫 `BT-passport`、護照跑在
> `passport.beyondtaiwannpo.com` 的根目錄，本機工作目錄是 `/Users/pinwang/bt-passport`。
> 2026-08-31 起 repo 改名為 `bt-site`，護照搬進 `/passport/` 子資料夾，
> 網域也在搬（進行中，見規格）。
>
> **文中的網址、repo 名稱與本機路徑沒有跟著改，那是刻意的。** 改了的話這份紀錄
> 就會讓下一個人以為當時就是新的樣子 —— 紀錄的價值在於它說的是當時的前提。
> 現在的狀態一律看 `BT-Site-交接規格.md`。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修好一條讓全站按鈕外觀失效的 CSS reset，把月份三格順序寫死為 聚會 → 題目 → 鏡頭並加測試釘住，在資料頁與九月之間插一頁說明（含第一次登入的引導頁），把月份主題的版面改成適合顯示時刻。

**Architecture:** 前端原生 JS、ES module、零建置。三層分工不變：`data.js` 只碰資料庫、`ui.js` 只吐 HTML 字串、`main.js` 只接事件。本輪新增的兩個抽象都放在 `ui.js`：`SLOT_ORDER`（三格順序的唯一定義）與 `pagesOf()`（書本頁碼的唯一定義）。測試用 node 內建的 `node --test` 直接 import `ui.js`，不引入任何 npm 相依，並掛進 `check.sh`。

**Tech Stack:** 原生 ES module、Supabase（Postgres + Auth）、`node --test`（node 24 內建）、bash（`check.sh`）。無套件管理器、無 `package.json`、無 build step。

**Spec:** `docs/superpowers/specs/2026-08-22-guide-page-and-slot-order-design.md`

## Global Constraints

逐字取自原規格 `2026-08-16-bt-passport-design.md` 與本輪規格，每一條都適用於底下每一個 Task：

- **最多 3 種顏色**：`#FFC46C` 主橘、`#EDE5D8` 米白、`#102A86` 深藍。需要深淺變化時只能調透明度，且只允許 `rgba(16,42,134,α)`、`rgba(255,196,108,α)`、`rgba(255,255,255,α)` 三種底色。不得新增任何其他色碼，不得使用 `rgb()` / `hsl()`
- **最多 2 種字體**：Barlow Condensed（`var(--display)`）／ Inter（`var(--body)`）。不加 `@font-face`，不加 Google Fonts 的中文請求
- **新畫面不引入新的視覺元件**：一律沿用既有的 `.card` / `.btn` / `label` / `.wnote` / `.slot` / `.mhead`。不加漸層、不加陰影（`.toast` 既有的除外）、不加第四色當強調色
- **零建置、零相依**：不新增 `package.json`、不新增 `node_modules`、不引入任何 npm 套件。測試只用 node 內建功能
- **不得出現任何個人姓名或個人聯絡方式**，錯誤訊息與引導文字一律只用組織信箱 `beyondtaiwan2020@gmail.com`
- **文案是規格不是建議**：既有的中文文案（`data.js` 的 `MSG`、`ui.js` 的告知段落）一個字都不要改寫或潤飾
- **三格順序**：聚會 → 題目 → 鏡頭。理由是難度遞增：聚會最輕鬆、題目最花心思、鏡頭最快，收尾在最輕的一格
- **`prefers-reduced-motion: reduce` 下動畫必須關閉**（原規格 §11-17），新增動畫要同步加進 `index.html` 那條規則
- **DDL 與資料寫入由使用者自己在 Supabase SQL Editor 執行**，實作者只準備 SQL 檔案，不代跑

---

## File Structure

| 檔案 | 動作 | 責任 |
|---|---|---|
| `index.html` | 修改 | 按鈕 reset 改零特異性；新增 `.mtheme.clock` 修飾規則 |
| `src/ui.js` | 修改 | 新增 `SLOT_ORDER`、`orderSlots()`、`pagesOf()`、`guideCardsHTML()`、`guidePageHTML()`、`introHTML()`；改寫 `bookHTML()`、`monthPageHTML()`、`slotHTML()` |
| `src/main.js` | 修改 | 頁碼邊界改問 `pagesOf()`；`render()` 加引導頁閘門；新增 `intro-done` 事件 |
| `src/data.js` | 修改 | 新增 `markIntroSeen()` |
| `supabase/schema.sql` | 修改 | `passports` 加 `intro_seen` 欄位 |
| `supabase/migrations/2026-08-22-intro-seen.sql` | 新增 | 正式站的遷移，由使用者執行 |
| `supabase/seed.sql` | 修改 | months 的時刻值（Task 7，等使用者提供） |
| `activities.json` | 修改 | months 的時刻值（Task 7，等使用者提供） |
| `test/ui-order.test.mjs` | 新增 | 三格順序、mutation 測試 |
| `test/ui-pages.test.mjs` | 新增 | 頁序模型、圓點數量、說明頁共用文案 |
| `test/ui-month-head.test.mjs` | 新增 | `theme_en` 為空時不渲染 `<span>` |
| `check.sh` | 修改 | 新增 `:where()` 守門與 `node --test` 呼叫 |

---

## Task 1: 修好按鈕 reset 的特異性

**為什麼排第一**：它是獨立的一行改動，卻會改變整站外觀。先做完、先看過，後面每一個 Task 的畫面驗收才有意義；混在別的改動裡的話，之後看到任何視覺差異都分不清是誰造成的。

**Files:**
- Modify: `index.html:44`
- Modify: `check.sh`（在最後的 `[ $fail -eq 0 ]` 那行之前插入）

**Interfaces:**
- Consumes: 無
- Produces: 無（純 CSS 與檢查腳本）

- [ ] **Step 1: 先量現況，留下壞掉的證據**

建立量測用的 harness（丟在暫存目錄，不進 repo）：

```bash
mkdir -p /tmp/bt-css && cd /tmp/bt-css && python3 - <<'PY'
import re
html = open('/Users/pinwang/bt-passport/index.html', encoding='utf-8').read()
style = re.search(r'<style>.*?</style>', html, re.S).group(0)
body = '<!doctype html><meta charset=utf-8>' + style + '''
<div id="bt-root">
  <div class="nav"><button class="arrow" id="ar">←</button><div class="dots">
    <button aria-current="true"></button><button data-on="1"></button><button data-on="0"></button>
  </div></div>
  <div class="row"><button class="btn" id="b1">蓋章</button>
    <button class="btn ghost" id="b2">取消</button><button id="bare">沒有 class</button></div>
  <div class="slots"><button class="slot" id="s1"><span class="ttl">一格</span></button></div>
  <div class="tabs"><button id="t1" aria-selected="true">護照</button></div>
  <button class="photo" id="ph"><span>上傳</span></button>
</div><pre id="out"></pre><script>
const rows=[];
function look(sel,label){document.querySelectorAll(sel).forEach((e)=>{const c=getComputedStyle(e);
 rows.push(label.padEnd(7)+' border='+c.borderTopWidth+' '+c.borderTopStyle+'  bg='+c.backgroundColor);});}
look('.dots button','dot');look('#b1','btn');look('#b2','ghost');look('#s1','slot');
look('#t1','tab');look('#ar','arrow');look('#ph','photo');look('#bare','bare');
out.textContent=rows.join('\\n');
</script>'''
open('before.html','w',encoding='utf-8').write(body)
PY
echo "開 file:///tmp/bt-css/before.html，讀 <pre> 的內容"
```

在瀏覽器開 `file:///tmp/bt-css/before.html`，記下 `<pre>` 的內容。

Expected（這是**壞掉**的狀態，八行全部 `border=0px none` 且 `bg=rgba(0, 0, 0, 0)`）：

```
dot     border=0px none  bg=rgba(0, 0, 0, 0)
dot     border=0px none  bg=rgba(0, 0, 0, 0)
dot     border=0px none  bg=rgba(0, 0, 0, 0)
btn     border=0px none  bg=rgba(0, 0, 0, 0)
ghost   border=0px none  bg=rgba(0, 0, 0, 0)
slot    border=0px none  bg=rgba(0, 0, 0, 0)
tab     border=0px none  bg=rgba(0, 0, 0, 0)
arrow   border=0px none  bg=rgba(0, 0, 0, 0)
photo   border=0px none  bg=rgba(0, 0, 0, 0)
bare    border=0px none  bg=rgba(0, 0, 0, 0)
```

- [ ] **Step 2: 改 reset**

`index.html:44`，把

```css
  #bt-root button{font-family:var(--body);cursor:pointer;border:none;background:none;color:inherit}
```

換成

```css
  /* 這條 reset 的選擇器**必須**包在 :where() 裡。
     裸寫 #bt-root button 的特異性是 (1,0,1)，會蓋掉所有用 class 描述外觀的規則 ——
     .btn 的深藍實心底、.btn.ghost 與 .nav .arrow 的外框、.slot 的虛線框、
     .tabs 選中時的深藍底、.photo 的框、.dots 的圓框與蓋滿轉橘，一條都沒有生效過。
     這個站從原型 a2a26c2 到 2026-08-22 為止，畫面上所有按鈕的外觀都是死的，
     唯一看得見的圓點是 .dots [aria-current] 的 outline —— outline 不受 border/background 影響。
     :where() 的特異性恆為零，所以這條規則仍然蓋得過瀏覽器預設樣式
     （作者樣式表無論特異性多低都排在 UA 樣式表前面），但輸給任何一條 class 規則。
     **不要把 :where() 拿掉**，check.sh 有一條檢查在守它。見 spec 2026-08-22 §1。 */
  :where(#bt-root button){font-family:var(--body);cursor:pointer;border:none;background:none;color:inherit}
```

- [ ] **Step 3: 再量一次，確認八個元件全部復原**

```bash
cd /tmp/bt-css && python3 - <<'PY'
import re
html = open('/Users/pinwang/bt-passport/index.html', encoding='utf-8').read()
style = re.search(r'<style>.*?</style>', html, re.S).group(0)
before = open('before.html', encoding='utf-8').read()
open('after.html','w',encoding='utf-8').write(before.replace(
    re.search(r'<style>.*?</style>', before, re.S).group(0), style))
PY
echo "開 file:///tmp/bt-css/after.html"
```

在瀏覽器開 `file:///tmp/bt-css/after.html`。

Expected：

```
dot     border=1px solid  bg=rgba(0, 0, 0, 0)
dot     border=1px solid  bg=rgb(255, 196, 108)
dot     border=1px solid  bg=rgba(0, 0, 0, 0)
btn     border=0px none  bg=rgb(16, 42, 134)
ghost   border=1px solid  bg=rgba(0, 0, 0, 0)
slot    border=1.5px dashed  bg=rgba(0, 0, 0, 0)
tab     border=0px none  bg=rgb(16, 42, 134)
arrow   border=1px solid  bg=rgba(0, 0, 0, 0)
photo   border=1px solid  bg=rgba(255, 196, 108, 0.2)
bare    border=0px none  bg=rgba(0, 0, 0, 0)
```

最後一行是重點：沒有 class 的裸 `button` 仍然被 reset 壓住，reset 沒有失效，只是不再誤傷。任何一行不符就停下來，不要往下做。

- [ ] **Step 4: 加 check.sh 的守門檢查**

在 `check.sh` 裡 `# CNAME 不可掉` 那一段**之前**插入：

```bash
# 按鈕 reset 必須是零特異性。裸寫 #bt-root button 的特異性 (1,0,1) 會蓋掉所有
# 用 class 描述外觀的規則，全站按鈕的邊框與底色會靜靜地全部消失 ——
# 不會報錯，只是東西不見了，而 .dots 只剩 aria-current 的 outline 撐著一顆圓點。
# 這個站從原型到 2026-08-22 都是這個狀態。見 spec 2026-08-22 §1。
if grep -q ':where(#bt-root button)' index.html; then
  ok "按鈕 reset 是零特異性（:where）"
else
  bad "index.html 的按鈕 reset 不是 :where(#bt-root button)，全站 class 規則會被蓋掉（spec 2026-08-22 §1）"
fi
```

- [ ] **Step 5: 跑 check.sh，確認新檢查通過且既有 12 項沒有回歸**

Run: `./check.sh`
Expected: 全部 `ok`，最後一行 `全部通過。`，其中包含 `ok    按鈕 reset 是零特異性（:where）`

- [ ] **Step 6: 逐頁看過真實畫面**

```bash
python3 -m http.server 8765 --directory /Users/pinwang/bt-passport
```

用瀏覽器開 `http://localhost:8765/`，登入後逐一看過：登入頁、申請頁（按「編輯資料」）、資料頁、月份頁、進度牆。確認：

- 主按鈕（登入／蓋章／核發護照）是深藍實心底、米白字
- 「取消」「匯出備份」這類 ghost 鍵有 1px 深藍外框
- 月份頁的活動格子有 1.5px 虛線框，滑過去轉成橘色淡底
- 上一頁／下一頁有外框
- 分頁鍵（我的護照／進度牆）選中的那個是深藍實心底
- 資料頁的大頭照框回來了
- 月份頁底下有 **12** 顆圓點（本 Task 尚未插入說明頁），蓋滿的月份是橘色實心

任何一項不對就停下來。

- [ ] **Step 7: Commit**

```bash
git add index.html check.sh
git commit -m "fix(css): 按鈕 reset 改零特異性，全站按鈕外觀從原型起就是死的

#bt-root button 的特異性 (1,0,1) 蓋掉所有用 class 描述外觀的規則：
.btn 的深藍底、.slot 的虛線框、.dots 的圓框與蓋滿轉橘、.tabs 選中的底色、
.nav .arrow 與 .photo 的外框，一條都沒有生效過。回報的症狀是「翻頁圓點只剩
一個」，那一顆是 [aria-current] 的 outline 撐著的，跟頁碼與蓋滿與否都無關。

改成 :where(#bt-root button) 讓特異性歸零。瀏覽器實測八個元件全部復原，
而沒有 class 的裸 button 仍被 reset 壓住。check.sh 加一條守它。"
```

---

## Task 2: 三格順序寫死 + 測試基礎建設

**Files:**
- Modify: `src/ui.js`（新增 `SLOT_ORDER` 與 `orderSlots()`；改 `monthPageHTML()` 與 `slotHTML()`）
- Modify: `src/main.js`（`openModal` 的 `CATNAME` 取值）
- Create: `test/ui-order.test.mjs`
- Modify: `check.sh`

**Interfaces:**
- Consumes: 無
- Produces:
  - `export const SLOT_ORDER: string[]` —— `["gather", "prompt", "frame"]`
  - `orderSlots(acts: Activity[]) -> Activity[]`（模組內部，不匯出）
  - `monthPageHTML(S, m)` 的輸出順序從此固定

- [ ] **Step 1: 先確認 ui.js 在 node 裡 import 得起來**

這是整個測試策略的前提。哪天 `ui.js` 開始 import 需要 DOM 的東西，這個前提就沒了。

Run:
```bash
cd /Users/pinwang/bt-passport && node -e "import('./src/ui.js').then(m=>console.log('OK',Object.keys(m).length)).catch(e=>{console.log('ERR',e.message);process.exit(1)})"
```
Expected: `OK 15`

- [ ] **Step 2: 寫失敗的測試**

Create `test/ui-order.test.mjs`：

```js
// 三格順序與「category 改名不准讓格子消失」的釘子。
// 跑法：node --test test/*.test.mjs    （node 內建，不需要 npm、不需要 jsdom）
//
// 這支測試存在的理由：順序不對是看得出來的，**格子消失是看不出來的** ——
// 33 格裡少一格不會報錯、不會變紅，只會有一個人某天發現他的章不見了。
import { test } from "node:test";
import assert from "node:assert/strict";
import { monthPageHTML, slotHTML, CATNAME, SLOT_ORDER } from "../src/ui.js";

const MONTH = { seq: 1, month: 9, theme_zh: "07:00", theme_en: "" };

const act = (id, category, title_zh) => ({
  id, month: 9, seq: 1, category, title_zh,
  title_en: "TITLE", description: "說明", active: true
});

// monthPageHTML 只讀這幾個欄位，其他不必給。
const stateWith = acts => ({
  activities: acts, months: [MONTH], stamps: {}, entries: {}, justStamped: null
});

const positions = html => ["聚會 GATHER", "題目 PROMPT", "鏡頭 FRAME"].map(n => html.indexOf(n));
const slotCount = html => html.split('class="slot"').length - 1;

test("三格順序固定是 聚會 → 題目 → 鏡頭，不管輸入順序", () => {
  // 刻意用資料庫 order by category 會給的順序餵進去（frame/gather/prompt）。
  const html = monthPageHTML(stateWith([
    act("09C", "frame", "開學第一天"),
    act("09A", "gather", "開學電影夜"),
    act("09B", "prompt", "我是怎麼進來的")
  ]), MONTH);
  const [g, p, f] = positions(html);
  assert.ok(g >= 0 && p >= 0 && f >= 0, "三格都要在");
  assert.ok(g < p, `聚會要排在題目前面，實際 ${g} vs ${p}`);
  assert.ok(p < f, `題目要排在鏡頭前面，實際 ${p} vs ${f}`);
});

test("SLOT_ORDER 的成員必須跟 CATNAME 的鍵完全一致", () => {
  // 有人加了新的 category 卻忘了把它排進順序表，這裡就紅。
  assert.deepEqual([...SLOT_ORDER].sort(), Object.keys(CATNAME).sort());
});

test("mutation：塞一個不存在的 category，那一格排到最後但不准消失", () => {
  const html = monthPageHTML(stateWith([
    act("09A", "gather", "開學電影夜"),
    act("09B", "prompt", "我是怎麼進來的"),
    act("09C", "frame", "開學第一天"),
    act("09D", "vlog", "這格是實驗")
  ]), MONTH);
  assert.equal(slotCount(html), 4, "四格都要在，不准少一格");
  assert.ok(html.includes("這格是實驗"), "認不得的 category 那一格的標題要出現");
  const [g, p, f] = positions(html);
  assert.ok(g < p && p < f, "前三格順序不受影響");
  assert.ok(html.indexOf("這格是實驗") > f, "認不得的排到最後");
  assert.ok(!html.includes("undefined"), "不准把 undefined 印到畫面上");
});

test("mutation：把 frame 改名成 frame_v2，三格都還在", () => {
  // 模擬「之後有人改 category 名稱」。失敗的表現必須是順序不對，不是格子消失。
  const html = monthPageHTML(stateWith([
    act("09A", "gather", "開學電影夜"),
    act("09B", "prompt", "我是怎麼進來的"),
    act("09C", "frame_v2", "開學第一天")
  ]), MONTH);
  assert.equal(slotCount(html), 3, "三格都要在");
  assert.ok(html.includes("開學第一天"), "改名那一格的標題要出現");
  assert.ok(!html.includes("undefined"), "不准把 undefined 印到畫面上");
});

test("slotHTML 對認不得的 category 印空字串，不印 undefined", () => {
  const html = slotHTML(stateWith([]), act("09D", "vlog", "這格是實驗"));
  assert.ok(!html.includes("undefined"));
  assert.ok(html.includes("這格是實驗"));
});
```

- [ ] **Step 3: 跑測試，確認它失敗**

Run: `cd /Users/pinwang/bt-passport && node --test test/*.test.mjs`
Expected: FAIL。至少會看到 `SyntaxError` 或 `SLOT_ORDER is not defined` 之類（`ui.js` 還沒有 `SLOT_ORDER`），以及順序與 `undefined` 的斷言失敗。

- [ ] **Step 4: 在 ui.js 加 SLOT_ORDER 與 orderSlots**

在 `src/ui.js` 的 `CATNAME` 定義**之後**插入：

```js
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
```

- [ ] **Step 5: 讓 monthPageHTML 用它**

在 `src/ui.js` 的 `monthPageHTML` 裡，把

```js
  const acts = S.activities.filter(a => a.month === m.month);
```

換成

```js
  const acts = orderSlots(S.activities.filter(a => a.month === m.month));
```

- [ ] **Step 6: 讓 slotHTML 對認不得的 category 印空字串**

在 `src/ui.js` 的 `slotHTML` 裡，把

```js
    <span class="cat">${CATNAME[a.category]}</span>
```

換成

```js
    <!-- CATNAME 取不到就印空字串。取不到代表有人改了 category 名稱，
         那時候該壞的是順序（排到最後），不是在畫面上出現「undefined」四個字。 -->
    <span class="cat">${esc(CATNAME[a.category] || "")}</span>
```

- [ ] **Step 7: main.js 的 modal 標題同樣處理**

在 `src/main.js` 的 `openModal` 裡，把

```js
    <div class="mt">${UI.CATNAME[a.category]} · ${String(a.month).padStart(2, "0")}月</div>
```

換成

```js
    <div class="mt">${UI.esc(UI.CATNAME[a.category] || "")} · ${String(a.month).padStart(2, "0")}月</div>
```

- [ ] **Step 8: 跑測試，確認全過**

Run: `cd /Users/pinwang/bt-passport && node --test test/*.test.mjs`
Expected: PASS，`# pass 5`、`# fail 0`

- [ ] **Step 9: 把測試掛進 check.sh**

在 `check.sh` 裡 `# CNAME 不可掉` 那一段**之前**插入：

```bash
# 單元測試。node 不在的話**算失敗不算通過** —— 「沒跑到」跟「跑過而且過了」
# 在一支檢查腳本裡長得一模一樣，那正是最容易騙過自己的地方。
#
# **參數要寫成 test/*.test.mjs，不要寫成 test/。** 實測（node 24.17.0）：
# `node --test test/` 不會遞迴進目錄，它把目錄本身當成一支測試檔去執行，
# 然後 MODULE_NOT_FOUND —— 而那個失敗長得像「測試沒過」，不像「指令寫錯」。
if command -v node >/dev/null 2>&1; then
  if node --test test/*.test.mjs >/dev/null 2>&1; then
    ok "單元測試通過（node --test test/*.test.mjs）"
  else
    bad "單元測試沒過。跑 node --test test/*.test.mjs 看細節"
  fi
else
  bad "找不到 node，單元測試沒有跑到（這不是通過）"
fi
```

- [ ] **Step 10: 跑 check.sh**

Run: `./check.sh`
Expected: 全部 `ok`，含 `ok    單元測試通過（node --test test/*.test.mjs）`，最後一行 `全部通過。`

- [ ] **Step 11: Commit**

```bash
git add src/ui.js src/main.js test/ui-order.test.mjs check.sh
git commit -m "fix(ui): 三格順序寫死為 聚會 → 題目 → 鏡頭，加 mutation 測試釘住

根因不是 category 的字母序，是 seed 裡同月三格的 seq 相同（09A/09B/09C
全是 1），同月內完全沒有排序鍵，順序由 Postgres 當下決定、不保證、
今天對明天可能就跑掉而且不報錯。

排序放在 ui.js（版面決定，不是儲存層的事），data.js 的查詢一個字不動。
認不得的 category 排到最後而不是丟掉 —— 格子消失不會報錯也看不出來。
兩個 mutation 測試釘住這件事，另一個測試釘住 SLOT_ORDER 與 CATNAME
的鍵必須一致，有人加 category 忘了排序表就會紅。

順手修掉 CATNAME 取不到時會把 undefined 印到畫面上。
check.sh 現在會跑 node --test。"
```

---

## Task 3: 把頁碼收成 pagesOf()（純重構，行為不變）

**為什麼單獨一個 Task**：插頁跟重構混在一起的話，一旦畫面翻到錯的月份，分不清是重構寫錯還是插頁位置放錯。這個 Task 做完，畫面必須跟做之前一模一樣。

**Files:**
- Modify: `src/ui.js`（新增 `pagesOf()`、`dotOn()`；改寫 `bookHTML()`）
- Modify: `src/main.js:~200`（`next` 的邊界）與 `src/main.js` 鍵盤區塊
- Create: `test/ui-pages.test.mjs`

**Interfaces:**
- Consumes: 無
- Produces:
  - `export function pagesOf(S) -> Array<{kind: "id"|"month", label: string, month?: Month}>`
    - `kind` 目前只有 `"id"` 與 `"month"`，Task 4 會加 `"guide"`
    - `label` 是圓點的 `aria-label` 與 `title`
    - `month` 只有 `kind === "month"` 時存在，值是 `months` 表的那一列
  - `S.page` 的語意不變：`pagesOf(S)` 的 0 起算索引

- [ ] **Step 1: 寫失敗的測試**

Create `test/ui-pages.test.mjs`：

```js
// 書本頁序的契約。頁碼的定義點只有 ui.js 的 pagesOf()，
// 不准任何地方再自己算 page - 1 或 months.length。
// 跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { pagesOf, bookHTML } from "../src/ui.js";

const months = [
  { seq: 1, month: 9,  theme_zh: "07:00", theme_en: "" },
  { seq: 2, month: 10, theme_zh: "08:00", theme_en: "" }
];

const S = page => ({
  page, months, activities: [], stamps: {}, entries: {}, justStamped: null,
  profile: { id: "00000000-0000-0000-0000-000000000000", name_zh: "王小明",
             name_en: "Ming Wang", team: "Sponsorship Team", issued: "2026-08-22" }
});

const dotCount = html => (html.match(/data-act="go"/g) || []).length;

test("pagesOf：資料頁在最前，之後才是月份", () => {
  const pages = pagesOf(S(0));
  assert.equal(pages[0].kind, "id");
  assert.equal(pages[1].kind, "month");
  assert.equal(pages[1].month.month, 9);
  assert.equal(pages.length, months.length + 1);
});

test("圓點數等於 pagesOf 的長度", () => {
  // 回報的 bug（「圓點只剩一個」）根因在 CSS，但頁面模型這一層也要有守門員：
  // 少一顆圓點等於有一頁翻不到，而畫面上不會有任何錯誤。
  assert.equal(dotCount(bookHTML(S(1))), pagesOf(S(1)).length);
});

test("圓點的 data-p 是 0 起算的連號", () => {
  const html = bookHTML(S(1));
  const ps = [...html.matchAll(/data-p="(\d+)"/g)].map(m => Number(m[1]));
  assert.deepEqual(ps, ps.map((_, i) => i));
});

test("第一頁的『前一頁』與最後一頁的『下一頁』是 disabled", () => {
  const last = pagesOf(S(0)).length - 1;
  const first = bookHTML(S(0));
  assert.match(first, /data-act="prev" disabled/);
  const end = bookHTML(S(last));
  assert.match(end, /data-act="next" disabled/);
});

test("沒有活動的月份，圓點不算蓋滿", () => {
  // acts.every() 對空陣列回 true，直接用會讓一個沒有任何活動的月份顯示成「已蓋滿」。
  const html = bookHTML(S(1));
  assert.ok(!/data-on="1"/.test(html), "沒有活動就不該有橘色圓點");
});
```

- [ ] **Step 2: 跑測試，確認它失敗**

Run: `cd /Users/pinwang/bt-passport && node --test test/*.test.mjs`
Expected: FAIL，`ui-pages.test.mjs` 因為 `pagesOf` 不存在而整支掛掉（`SyntaxError: The requested module '../src/ui.js' does not provide an export named 'pagesOf'`）。`ui-order.test.mjs` 仍然全過。

- [ ] **Step 3: 在 ui.js 加 pagesOf 與 dotOn**

在 `src/ui.js` 的 `bookHTML` **之前**插入：

```js
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
```

- [ ] **Step 4: 改寫 bookHTML**

把 `src/ui.js` 現有的整個 `bookHTML` 換成：

```js
export function bookHTML(S) {
  const pages = pagesOf(S);
  // S.page 落在範圍外時退回第一頁而不是畫出 undefined。正常情況走不到這裡，
  // 但月份資料變少（有人停用了一整個月）時 S.page 可能指向已經不存在的頁。
  const cur = pages[S.page] || pages[0];
  return `<div class="book">
    <div class="page turn">${pageBodyHTML(S, cur)}</div>
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
  return monthPageHTML(S, page.month);
}
```

- [ ] **Step 5: main.js 的邊界改問 pagesOf**

在 `src/main.js` 的事件區塊，把

```js
  if (act === "next") { S.page = Math.min(S.months.length, S.page + 1); render(); return; }
```

換成

```js
  // 邊界問 pagesOf，不要自己算 months.length —— 書裡不是只有月份頁。
  if (act === "next") { S.page = Math.min(UI.pagesOf(S).length - 1, S.page + 1); render(); return; }
```

在 `src/main.js` 的 `keydown` 監聽裡，把

```js
  if (e.key === "ArrowRight" && S.page < S.months.length) { S.page++; render(); }
```

換成

```js
  if (e.key === "ArrowRight" && S.page < UI.pagesOf(S).length - 1) { S.page++; render(); }
```

- [ ] **Step 6: 跑測試，確認全過**

Run: `cd /Users/pinwang/bt-passport && node --test test/*.test.mjs`
Expected: PASS，`# pass 10`、`# fail 0`

- [ ] **Step 7: 確認畫面完全沒變**

```bash
python3 -m http.server 8765 --directory /Users/pinwang/bt-passport
```

開 `http://localhost:8765/` 登入，確認：圓點仍是 **12** 顆、第一頁是資料頁、第二頁是九月、左右鍵走得到頭尾且不越界、蓋滿的月份仍是橘色實心。這個 Task 是純重構，**畫面必須跟 Task 1 做完之後一模一樣**。

- [ ] **Step 8: Commit**

```bash
git add src/ui.js src/main.js test/ui-pages.test.mjs
git commit -m "refactor(ui): 書本頁碼收成 pagesOf()，只留一個定義點

頁碼算術原本散在六處（ui.js 的內容分派、圓點、下一頁；main.js 的 next
與鍵盤右）。要在中間插一頁得同時改對六處，漏一處的表現是『翻到某一頁
顯示的是別的月份』，不會報錯。

純重構，畫面行為不變。順手修掉 [].every() 讓沒有活動的月份顯示成
已蓋滿的問題。"
```

---

## Task 4: 說明頁（書裡固定的一頁）

**Files:**
- Modify: `src/ui.js`（新增 `GUIDE`、`guideCardsHTML()`、`guidePageHTML()`；`pagesOf()` 插入 guide；`pageBodyHTML()` 加分支）
- Modify: `test/ui-pages.test.mjs`

**Interfaces:**
- Consumes: Task 2 的 `SLOT_ORDER`、`CATNAME`；Task 3 的 `pagesOf()`、`pageBodyHTML()`
- Produces:
  - `export function guideCardsHTML() -> string` —— 三張卡的 HTML，**唯一的文案來源**
  - `export function guidePageHTML() -> string` —— 書本頁面版
  - `pagesOf()` 從此回傳 `[id, guide, ...months]`，九月在索引 2

- [ ] **Step 1: 改測試（先讓它失敗）**

在 `test/ui-pages.test.mjs` 的 import 加上 `guideCardsHTML, guidePageHTML`：

```js
import { pagesOf, bookHTML, guideCardsHTML, guidePageHTML } from "../src/ui.js";
```

把「pagesOf：資料頁在最前，之後才是月份」那一個 test 整個換成：

```js
test("pagesOf：資料頁 → 說明頁 → 月份，九月在索引 2", () => {
  const pages = pagesOf(S(0));
  assert.equal(pages[0].kind, "id");
  assert.equal(pages[1].kind, "guide");
  assert.equal(pages[2].kind, "month");
  assert.equal(pages[2].month.month, 9);
  assert.equal(pages.length, months.length + 2);
});
```

並在檔案最後追加：

```js
test("說明頁的三張卡也是 聚會 → 題目 → 鏡頭", () => {
  const html = guideCardsHTML();
  const [g, p, f] = ["聚會 GATHER", "題目 PROMPT", "鏡頭 FRAME"].map(n => html.indexOf(n));
  assert.ok(g >= 0 && p >= 0 && f >= 0);
  assert.ok(g < p && p < f);
});

test("說明頁用的是 .slot 而不是可點的 button", () => {
  const html = guidePageHTML();
  assert.ok(html.includes('<div class="slot">'), "三張卡是 div，不可點");
  assert.ok(!html.includes('data-act="open"'), "說明頁不該有蓋章入口");
});

test("翻到說明頁時 bookHTML 畫的是說明頁", () => {
  assert.ok(bookHTML(S(1)).includes(guideCardsHTML()));
});
```

- [ ] **Step 2: 跑測試，確認它失敗**

Run: `cd /Users/pinwang/bt-passport && node --test test/*.test.mjs`
Expected: FAIL，`does not provide an export named 'guideCardsHTML'`

- [ ] **Step 3: 在 ui.js 加文案與兩個渲染函式**

在 `src/ui.js` 的 `slotHTML` **之後**插入：

```js
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ 三張卡的文案。**兩處共用這一份**：第一次核發護照後的引導頁（introHTML）  │
// │ 與書裡固定的說明頁（guidePageHTML）。改文案只改這裡，兩邊永遠不會        │
// │ 講不一樣的話。                                                            │
// │                                                                          │
// │ 【文案待補】body 現在是佔位字，等使用者提供。**不要自己編一份看起來像    │
// │ 成品的文案** —— 那會混進正式站而沒有人發現它不是人寫的。                 │
// └──────────────────────────────────────────────────────────────────────────┘
const GUIDE = {
  gather: { title: "聚會", body: "【待補文案】" },
  prompt: { title: "題目", body: "【待補文案】" },
  frame:  { title: "鏡頭", body: "【待補文案】" }
};

// 順序直接用 SLOT_ORDER 產生，不在這裡再寫死一次三個 category ——
// 那會變成第二個順序的真相來源，而兩個真相來源遲早會不一致。
// 卡片是 <div class="slot"> 不是 <button>：它不可點，沒有蓋章入口。
export function guideCardsHTML() {
  return `<div class="slots">${SLOT_ORDER.map(c => {
    const g = GUIDE[c];
    if (!g) return "";
    return `<div class="slot">
      <span class="cat">${esc(CATNAME[c] || "")}</span>
      <span class="ttl">${esc(g.title)}</span>
      <span class="hint">${esc(g.body)}</span>
    </div>`;
  }).join("")}</div>`;
}

// 書裡固定的說明頁。位置在資料頁之後、九月之前（見 pagesOf）。
//
// .mnum 那一格**要放東西不能留空**：少了左邊那個 76px 的字，.mhead 的重心會偏，
// 說明頁看起來就不像跟其他頁同一本書。現在放的是問號，理由是不必新增任何資產，
// 而且跟 00（資料頁）與 01-12（月份）都不會混淆。
// **這是暫定值**，使用者看過之後可能改成 BT 的台灣圖形或 00 —— 所以它就是
// 這一行字，不要把它編織進任何版面計算裡。
export function guidePageHTML() {
  return `<div class="mhead">
      <div class="mnum">?</div>
      <div class="mzh">怎麼用這本護照</div>
    </div>
    ${guideCardsHTML()}`;
}
```

- [ ] **Step 4: 把 guide 插進 pagesOf**

在 `src/ui.js` 的 `pagesOf` 裡，把

```js
    { kind: "id", label: "資料頁" },
```

換成

```js
    { kind: "id", label: "資料頁" },
    { kind: "guide", label: "怎麼用" },
```

- [ ] **Step 5: pageBodyHTML 加分支**

把 `src/ui.js` 的 `pageBodyHTML` 換成：

```js
function pageBodyHTML(S, page) {
  if (page.kind === "id") return idPageHTML(S);
  if (page.kind === "guide") return guidePageHTML();
  return monthPageHTML(S, page.month);
}
```

- [ ] **Step 6: 跑測試，確認全過**

Run: `cd /Users/pinwang/bt-passport && node --test test/*.test.mjs`
Expected: PASS，`# pass 13`、`# fail 0`

- [ ] **Step 7: 看畫面**

```bash
python3 -m http.server 8765 --directory /Users/pinwang/bt-passport
```

開 `http://localhost:8765/` 登入，確認：

- 圓點變成 **13** 顆
- 第 1 頁（資料頁的下一頁）是說明頁，第 2 頁是九月
- 說明頁的三張卡有虛線框，跟月份頁的格子長得一樣（Task 1 修好之後兩邊才會一致）
- 說明頁的卡不可點、沒有「蓋章 →」
- 左上角是 `?` 加「怎麼用這本護照」
- 手機寬度（開發者工具切到 390px）三張卡變成一欄

**把說明頁的截圖給使用者看**，`.mnum` 那一格要他定案（暫定 `?`，候選還有 BT 台灣圖形與 `00`）。

- [ ] **Step 8: Commit**

```bash
git add src/ui.js test/ui-pages.test.mjs
git commit -m "feat(ui): 書裡加一頁說明，位置在資料頁之後、九月之前

三張卡沿用 .slots/.slot，不新增視覺元件。文案由 guideCardsHTML() 產出，
之後的引導頁會共用同一份 —— 兩處講不一樣的話是遲早的事，除非只有一個來源。
卡片是 div 不是 button：說明頁不該有蓋章入口。

文案是佔位字，等使用者提供。.mnum 暫定問號，待使用者看過定案。"
```

---

## Task 5: 第一次登入的引導頁（`passports.intro_seen`）

**Files:**
- Create: `supabase/migrations/2026-08-22-intro-seen.sql`
- Modify: `supabase/schema.sql:69-78`（`passports` 建表）
- Modify: `src/data.js`（`saveAvatar` 之後新增 `markIntroSeen`）
- Modify: `src/ui.js`（新增 `introHTML`）
- Modify: `src/main.js`（`render()` 加閘門、事件加 `intro-done`）
- Modify: `test/ui-pages.test.mjs`

**Interfaces:**
- Consumes: Task 4 的 `guideCardsHTML()`
- Produces:
  - `export function introHTML() -> string`（`ui.js`）
  - `export async function markIntroSeen(): Promise<void>`（`data.js`，失敗時 throw）
  - `S.profile.intro_seen: boolean`

- [ ] **Step 1: 寫失敗的測試**

在 `test/ui-pages.test.mjs` 的 import 加上 `introHTML`，並在檔案最後追加：

```js
test("引導頁與說明頁用的是同一份三張卡", () => {
  // 兩處各自寫一份文案的話，改了一邊忘了另一邊是遲早的事，
  // 而那時候護照會對同一件事講兩種說法。
  const cards = guideCardsHTML();
  assert.ok(introHTML().includes(cards), "引導頁要包含那三張卡");
  assert.ok(guidePageHTML().includes(cards), "說明頁要包含那三張卡");
});

test("引導頁有一顆送出鍵，而且只有一顆", () => {
  const html = introHTML();
  assert.equal((html.match(/data-act="intro-done"/g) || []).length, 1);
});
```

- [ ] **Step 2: 跑測試，確認它失敗**

Run: `cd /Users/pinwang/bt-passport && node --test test/*.test.mjs`
Expected: FAIL，`does not provide an export named 'introHTML'`

- [ ] **Step 3: 在 ui.js 加 introHTML**

在 `src/ui.js` 的 `guidePageHTML` **之後**插入：

```js
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
```

- [ ] **Step 4: 跑測試，確認全過**

Run: `cd /Users/pinwang/bt-passport && node --test test/*.test.mjs`
Expected: PASS，`# pass 15`、`# fail 0`

- [ ] **Step 5: 寫遷移檔**

Create `supabase/migrations/2026-08-22-intro-seen.sql`：

```sql
-- BT Passport 遷移：passports 加一個「引導頁看過沒有」的旗標
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。跑完不用重開站台。
--
-- ---------- 這支會改什麼 ----------
-- 一件事：passports 多一個 intro_seen 欄位，預設 false。其他什麼都不動。
--
-- ---------- 為什麼要有它 ----------
-- 第一次核發護照之後要擋一頁引導（三張卡介紹聚會／題目／鏡頭），看完就不再出現。
-- 「看過沒有」必須跟著帳號走而不是跟著瀏覽器走 —— 換一台裝置登入時，
-- 已經用了半年的人不該再被擋一次。所以它在資料庫裡，不在 localStorage。
--
-- ---------- 幾件要知道的事 ----------
-- 1. default false 會讓**現有的護照也看到一次引導頁**。這是想要的行為，
--    正好拿來驗收。
-- 2. RLS 不用動：passports_write 是列層級的 auth.uid() = id，涵蓋新欄位；
--    grant update on passports 是表層級的，不需要補欄位權限。
-- 3. passports_read 是 using (true)，所以這個欄位對任何登入者可讀。
--    它是一個引導旗標不是私密資料，可以接受。loadWall 只 select 指定欄位，
--    不會把它帶到進度牆上。
-- 4. not null + default false：前端的 clearAll() 是逐欄列名把欄位設成 null，
--    不會誤觸這一欄。

alter table passports
  add column if not exists intro_seen boolean not null default false;
```

- [ ] **Step 6: 同步 schema.sql**

`supabase/schema.sql` 的 `passports` 建表，把

```sql
  issued     date default current_date,
  updated_at timestamptz default now()
);
```

換成

```sql
  issued     date default current_date,
  -- 第一次核發護照後的引導頁看過沒有。**介面狀態，不是護照內容** ——
  -- 所以它不進匯出的備份檔，importPassport 也不碰它（見 data.js）。
  -- 跟著帳號走而不是跟著瀏覽器走：換裝置登入時老幹部不該再被擋一次引導。
  intro_seen boolean not null default false,
  updated_at timestamptz default now()
);
```

- [ ] **Step 7: 在 data.js 加 markIntroSeen**

在 `src/data.js` 的 `saveAvatar` **之後**插入：

```js
// 記住引導頁看過了。**這是介面狀態，不是護照內容** —— 所以 exportPassport
// 不帶它、importPassport 不碰它、clearAll 不清它（見 spec 2026-08-22 §4.5）。
// 跨帳號還原時，「引導看過沒有」是這個帳號的事，不是備份檔的事。
export async function markIntroSeen() {
  const user = await requireUser();
  const { error } = await supabase.from("passports")
    .update({ intro_seen: true, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) throw error;
}
```

- [ ] **Step 8: main.js 的 render 加閘門**

在 `src/main.js` 的 `render()` 裡，把

```js
  if (!S.profile || !S.profile.name_zh && !S.profile.name_en) { el.innerHTML = UI.setupHTML(S.profile, S.user); return; }
  el.innerHTML = UI.barHTML(S) + (S.view === "wall" ? UI.wallHTML(S) : UI.bookHTML(S));
```

換成

```js
  if (!S.profile || !S.profile.name_zh && !S.profile.name_en) { el.innerHTML = UI.setupHTML(S.profile, S.user); return; }
  // 引導頁擋在這裡，**在「已經有護照」之後**：三張卡講的是護照裡的東西，
  // 先有護照再解釋它，順序才通。核發完 main.js 會 boot() 一次，
  // 那時候 intro_seen 還是 false，所以不必另外呼叫什麼，這一條就會接住。
  if (!S.profile.intro_seen) { el.innerHTML = UI.introHTML(); return; }
  el.innerHTML = UI.barHTML(S) + (S.view === "wall" ? UI.wallHTML(S) : UI.bookHTML(S));
```

- [ ] **Step 9: main.js 加 intro-done 事件**

在 `src/main.js` 的 `if (act === "tab") ...` 那一行**之前**插入：

```js
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
```

- [ ] **Step 10: 確認匯出／匯入／清除都沒有碰到新欄位**

這是檢查不是修改。逐一確認 `src/data.js`：

- `exportPassport()` 的 `profile` 物件只列 `name_zh` / `name_en` / `team` / `motto` / `avatar` / `issued`，**沒有** `intro_seen`
- `importPassport()` 最後那句 `update` 只寫 `name_zh` / `name_en` / `team` / `motto` / `avatar` / `updated_at`，**沒有** `intro_seen`
- `clearAll()` 的 `update` 只寫 `name_zh` / `name_en` / `team` / `motto` / `avatar` / `updated_at`，**沒有** `intro_seen`（清除護照之後不會再看一次引導，這是刻意的：清除的人不是新手）

三個都符合就不用改任何一行。任何一個帶了 `intro_seen` 就把它拿掉。

- [ ] **Step 11: 請使用者執行遷移**

**不要自己跑。** 把 `supabase/migrations/2026-08-22-intro-seen.sql` 的內容交給使用者，請他貼進 Supabase SQL Editor 執行，並回報成功。

跑完可以用這句唯讀 SQL 自行確認欄位在了：

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'passports' and column_name = 'intro_seen';
```

Expected: 一列，`boolean` / `NO` / `false`

- [ ] **Step 12: 實際走一次流程**

```bash
python3 -m http.server 8765 --directory /Users/pinwang/bt-passport
```

開 `http://localhost:8765/`：

1. 用既有帳號登入 → 應該看到引導頁（`default false` 讓現有護照也看一次）
2. 按「開始蓋章」→ 進護照
3. 重新整理 → **不再**看到引導頁
4. 登出再登入 → 仍然不再看到
5. 翻到書的第 1 頁 → 說明頁還在，內容跟剛剛的引導頁一樣

- [ ] **Step 13: 跑完整檢查**

Run: `./check.sh`
Expected: 全部 `ok`，最後一行 `全部通過。`

- [ ] **Step 14: Commit**

```bash
git add supabase/migrations/2026-08-22-intro-seen.sql supabase/schema.sql src/data.js src/ui.js src/main.js test/ui-pages.test.mjs
git commit -m "feat: 第一次核發護照後擋一頁引導，看完不再出現

passports 加 intro_seen（not null default false）。旗標跟著帳號走不是
跟著瀏覽器走 —— 換裝置登入時老幹部不該再被擋一次。

引導頁與書裡的說明頁共用 guideCardsHTML()，文案只有一個來源。
閘門放在『已經有護照』之後：三張卡講的是護照裡的東西，先有護照再解釋它。

intro_seen 是介面狀態不是護照內容，所以不進備份檔、importPassport 不碰它、
clearAll 不清它。寫入失敗只記 console 不跳 toast：後果只是下次再看一次引導，
不值得打斷一個剛核發完護照的人。"
```

---

## Task 6: 月份頁右上角改成時刻的版面

**Files:**
- Modify: `index.html`（`.mtheme span` 那條規則之後新增 `.mtheme.clock b`）
- Modify: `src/ui.js`（`monthPageHTML` 的 `.mtheme`）
- Create: `test/ui-month-head.test.mjs`

**Interfaces:**
- Consumes: Task 3 的 `pagesOf()` / `pageBodyHTML()`
- Produces: 無新函式；`monthPageHTML` 的輸出多一個 `clock` class，且 `theme_en` 為空時不產生 `<span>`

- [ ] **Step 1: 寫失敗的測試**

Create `test/ui-month-head.test.mjs`：

```js
// 月份頁右上角。theme_zh 改放時間數字（07:00），theme_en 改成空字串。
// 跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { monthPageHTML, idPageHTML } from "../src/ui.js";

const S = { activities: [], months: [], stamps: {}, entries: {}, justStamped: null,
            profile: { id: "00000000-0000-0000-0000-000000000000", name_zh: "王小明",
                       name_en: "Ming Wang", team: "Sponsorship Team", issued: "2026-08-22" } };

test("theme_en 是空字串時不產生 span", () => {
  // 版面上這個 span 是零高度的（2026-08-22 實測，見 spec §5.2），所以這條規則
  // 跟版面無關 —— 它是為了不要在 DOM 裡留一個永遠是空的元素，
  // 讓下一個人以為是渲染壞掉然後去「修」它。
  const html = monthPageHTML(S, { seq: 1, month: 9, theme_zh: "07:00", theme_en: "" });
  assert.ok(html.includes("07:00"));
  assert.ok(!html.includes("<span></span>"), "不准留空的 span");
});

test("theme_en 有值時照樣渲染", () => {
  const html = monthPageHTML(S, { seq: 1, month: 9, theme_zh: "開學", theme_en: "FIRST WEEK" });
  assert.ok(html.includes("<span>FIRST WEEK</span>"));
});

test("月份頁的 .mtheme 帶 clock，資料頁的不帶", () => {
  // 放大只能掛在修飾 class 上。直接改 .mtheme b 的話，資料頁右上角的
  // 「BEYOND TAIWAN」會跟著變 34px，把版面撐爆。
  const month = monthPageHTML(S, { seq: 1, month: 9, theme_zh: "07:00", theme_en: "" });
  assert.ok(month.includes('class="mtheme clock"'));
  const id = idPageHTML(S);
  assert.ok(id.includes('class="mtheme"'), "資料頁仍是沒有修飾的 .mtheme");
  assert.ok(!id.includes("clock"), "資料頁不准帶 clock");
});
```

- [ ] **Step 2: 跑測試，確認它失敗**

Run: `cd /Users/pinwang/bt-passport && node --test test/*.test.mjs`
Expected: FAIL，`ui-month-head.test.mjs` 三個 test 有兩個紅（空 span 與 clock class）

- [ ] **Step 3: 改 monthPageHTML**

在 `src/ui.js` 的 `monthPageHTML` 裡，把

```js
      <div class="mtheme"><b>${esc(m.theme_zh)}</b><span>${esc(m.theme_en)}</span></div>
```

換成

```js
      <!-- theme_zh 現在放的是時間數字（07:00），theme_en 是空字串。
           空的時候**不產生**那個 span。
           這條規則跟版面無關：2026-08-22 實測 <span></span>、<span> </span>、
           <span>\n</span> 與完全不渲染的 .mtheme 高度都是 42.50，一模一樣 ——
           空的 inline 元素不產生行框。理由是不要在 DOM 裡留一個永遠是空的元素，
           下一個人看到會以為渲染壞了然後去「修」它。見 spec 2026-08-22 §5.2。 -->
      <div class="mtheme clock"><b>${esc(m.theme_zh)}</b>${m.theme_en ? `<span>${esc(m.theme_en)}</span>` : ""}</div>
```

- [ ] **Step 4: 加 CSS 修飾規則**

在 `index.html` 的

```css
  .mtheme span{font-size:10px;font-weight:600;letter-spacing:.2em;opacity:.55;text-transform:uppercase}
```

**之後**插入：

```css
  /* 月份頁的右上角放時間數字（07:00），要比主題字大一級才撐得起那個位置，
     並用 tabular-nums 讓每一頁的冒號對齊。字體不用指定：.mtheme b 本來就是
     var(--display)，也就是 Barlow Condensed，跟左邊 76px 的月份數字同一套。
     **不可以直接改 .mtheme b** —— 資料頁的右上角共用同一個元件，
     那裡放的是「BEYOND TAIWAN / Passport · 2026」，跟著變 34px 會撐爆版面。 */
  .mtheme.clock b{font-size:34px;font-variant-numeric:tabular-nums;letter-spacing:.02em}
```

- [ ] **Step 5: 跑測試，確認全過**

Run: `cd /Users/pinwang/bt-passport && node --test test/*.test.mjs`
Expected: PASS，`# pass 18`、`# fail 0`

- [ ] **Step 6: 跑 check.sh，確認三色與字體沒有回歸**

Run: `./check.sh`
Expected: 全部 `ok`。特別注意 `§11-14 只有三個色碼` 與 `§11-15 字體請求只有 Barlow Condensed 與 Inter` 仍然通過。

- [ ] **Step 7: 看畫面**

```bash
python3 -m http.server 8765 --directory /Users/pinwang/bt-passport
```

此時資料庫裡還是舊的主題字（「開學」「換季」…），所以右上角會看到**放大的中文主題**。這是預期中的過渡狀態，不是 bug —— 前端不認得內容是主題還是時刻，也不該認得。確認：

- 中文主題被放大了，英文副標還在（因為 `theme_en` 還有值）
- 資料頁右上角的「BEYOND TAIWAN / Passport · 2026」**沒有**跟著變大
- 版面沒有溢出、沒有換行擠壓

- [ ] **Step 8: Commit**

```bash
git add index.html src/ui.js test/ui-month-head.test.mjs
git commit -m "feat(ui): 月份頁右上角改成適合顯示時刻的版面

theme_zh 之後放時間數字（07:00），theme_en 給空字串。空的時候不產生
那個 span —— 實測 <span></span> 與完全不渲染的高度一模一樣（都是 42.50），
所以這條跟版面無關，是為了不在 DOM 裡留一個看起來像壞掉的死元素。

放大掛在 .mtheme.clock 上，不能直接改 .mtheme b：資料頁右上角共用同一個
元件，跟著變 34px 會撐爆版面。字體不用改，.mtheme b 本來就是 Barlow Condensed。

資料庫的值由使用者另外提供，這個 commit 之後右上角會暫時是放大的中文主題。"
```

---

## Task 7: 把時刻的值放進資料

**這個 Task 要等使用者提供 11 個月的時刻值才能開始。**

**Files:**
- Modify: `supabase/seed.sql:18-31`（`insert into months`）
- Modify: `activities.json`（`months` 陣列）
- 使用者自己執行：正式資料庫的 `update`

**Interfaces:**
- Consumes: Task 6 的版面
- Produces: 無程式介面

- [x] **Step 1: 時刻值（使用者於 2026-08-22 提供）**

| seq | month | theme_zh | theme_en |
|---|---|---|---|
| 1 | 9 | `07:00` | `''` |
| 2 | 10 | `08:00` | `''` |
| 3 | 11 | `08:40` | `''` |
| 4 | 12 | `10:00` | `''` |
| 5 | 1 | `12:30` | `''` |
| 6 | 2 | `14:00` | `''` |
| 7 | 3 | `16:00` | `''` |
| 8 | 4 | `18:00` | `''` |
| 9 | 5 | `19:30` | `''` |
| 10 | 6 | `21:00` | `''` |
| 11 | 7 | `23:50` | `''` |

全部 `HH:MM` 24 小時制、五個字元，所以 `tabular-nums` 對得齊。

**`08:40` 與 `23:50` 是刻意不整點的，不要「順手修正」成整點。** 使用者的原話：
一整排整點看起來像時刻表，有兩個零頭才像真的一天；`23:50` 差十分鐘午夜，
護照在那裡蓋滿。這是內容決定，不是打字錯誤。

- [ ] **Step 2: 改 seed.sql**

把 `supabase/seed.sql` 的 `insert into months (...) values` 那 11 列的 `theme_zh` 換成時刻、`theme_en` 換成 `''`。`on conflict (seq) do update set` 那三行不動。

在該段之上加一行註解：

```sql
-- 2026-08-22：theme_zh 從月份主題（「開學」「換季」…）改成時刻，theme_en 清空。
-- 版面上右上角只顯示這個數字，不再有英文副標（見 spec 2026-08-22 §5）。
-- **這裡跟 activities.json 與正式資料庫必須同時改**，否則下一個重跑 seed 的人
-- 會把時刻蓋回舊主題。
```

- [ ] **Step 3: 改 activities.json**

把 `months` 陣列 11 列的 `theme_zh` / `theme_en` 換成同一批值。`note` 欄位補一句說明這次改動。

- [ ] **Step 4: 確認兩邊一致**

Run:
```bash
cd /Users/pinwang/bt-passport && python3 - <<'PY'
import json, re
j = json.load(open('activities.json', encoding='utf-8'))
seed = open('supabase/seed.sql', encoding='utf-8').read()
block = re.search(r'insert into months.*?;', seed, re.S).group(0)
rows = re.findall(r"\((\d+),\s*(\d+),\s*'([^']*)',\s*'([^']*)'\)", block)
a = [(m['seq'], m['month'], m['theme_zh'], m['theme_en']) for m in j['months']]
b = [(int(s), int(mo), zh, en) for s, mo, zh, en in rows]
print('一致' if a == b else '不一致')
for x, y in zip(a, b):
    if x != y: print('  json', x, '≠ seed', y)
PY
```
Expected: `一致`

- [ ] **Step 5: 請使用者更新正式資料庫**

**不要自己跑。** 把 SQL 交給使用者貼進 Supabase SQL Editor。跑完請他回報。

跑完可以用這句唯讀 SQL 自行確認：

```sql
select seq, month, theme_zh, theme_en from months order by seq;
```

- [ ] **Step 6: 驗收畫面**

```bash
python3 -m http.server 8765 --directory /Users/pinwang/bt-passport
```

逐頁翻過 11 個月份頁，確認：

- 右上角只有時間數字，**沒有**英文副標
- 沒有多出來的空行，數字沒有被推歪
- 各頁的冒號上下對齊（`tabular-nums` 生效）
- 沒有出現「07:00 SEVEN AM」這種重複

- [ ] **Step 7: Commit**

```bash
git add supabase/seed.sql activities.json
git commit -m "content: months 的主題換成時刻，theme_en 清空

seed.sql 與 activities.json 同步。正式資料庫由使用者自己執行。
三邊不一致的話，下一個重跑 seed 的人會把時刻蓋回舊主題。"
```

---

## Task 8: 補上文案，逐條驗收

**這個 Task 要等使用者提供三張卡的文案才能開始。**

**Files:**
- Modify: `src/ui.js`（`GUIDE` 的三個 `body`）
- Modify: `docs/superpowers/specs/2026-08-22-guide-page-and-slot-order-design.md`（§7 驗收紀錄）

- [ ] **Step 1: 把文案填進 GUIDE**

把 `src/ui.js` 的 `GUIDE` 三個 `body` 的 `【待補文案】` 換成使用者給的字，並把上面那段「【文案待補】…不要自己編」的註解改成記錄文案來源與日期。

- [ ] **Step 2: 確認 repo 裡沒有殘留的佔位字**

Run: `cd /Users/pinwang/bt-passport && grep -rn "待補" src/ index.html`
Expected: 無輸出

- [ ] **Step 3: 定案說明頁的 `.mnum`**

依使用者在 Task 4 Step 7 的決定，把 `guidePageHTML` 的 `<div class="mnum">?</div>` 換成定案的內容（`?` 維持不動／`00`／`<img src="./logo.png" ...>`）。若選圖形，注意原規格 §3.3：不可改色、拉伸、旋轉或調透明度。

- [ ] **Step 4: 跑完整檢查**

Run: `cd /Users/pinwang/bt-passport && ./check.sh`
Expected: 全部 `ok`，最後一行 `全部通過。`

- [ ] **Step 5: 逐條走完規格 §7 的十條驗收**

打開 `docs/superpowers/specs/2026-08-22-guide-page-and-slot-order-design.md` 的 §7，一條一條實際做過，把結果寫進規格檔末尾的「驗收紀錄」段落。**不接受「看起來沒問題」**，每一條要寫下實際做了什麼、看到什麼。

第 5 條需要一個新帳號：跟使用者要一組還沒用過的邀請碼，或請他自己走一次。

- [ ] **Step 6: Commit**

```bash
git add src/ui.js docs/superpowers/specs/2026-08-22-guide-page-and-slot-order-design.md
git commit -m "docs+content: 補上三張卡的文案，§7 驗收紀錄逐條實測"
```

---

## Self-Review

**規格覆蓋率**：§1 → Task 1；§2 → Task 2；§3 → Task 3；§4.1/4.2 → Task 4；§4.3/4.4/4.5/4.6 → Task 5；§5 → Task 6（版面）與 Task 7（資料）；§6.1/6.2/6.3 → Task 2、3、4、6 的測試；§6.4 → Task 1 Step 4；§7 → Task 8 Step 5；§8（不做的事）→ 計畫裡沒有任何 Task 碰到那五項。

**型別一致性**：`pagesOf()` 在 Task 3 產出 `{kind, label, month?}`，Task 4 加 `kind: "guide"` 沿用同一形狀；`pageBodyHTML(S, page)` 的簽名在 Task 3 定義、Task 4 擴充分支，沒有改名；`guideCardsHTML()` 在 Task 4 定義、Task 5 消費，名稱一致；`markIntroSeen()` 只在 Task 5 出現。

**已知的順序相依**：Task 4 依賴 Task 2 的 `SLOT_ORDER` 與 Task 3 的 `pagesOf()`；Task 5 依賴 Task 4 的 `guideCardsHTML()`；Task 7 依賴 Task 6 的版面；Task 8 依賴使用者提供文案。Task 1 與 Task 2 之間沒有相依，但 Task 1 先做，否則後面每一個畫面驗收都分不清視覺差異是誰造成的。
