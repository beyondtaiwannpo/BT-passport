# 入境章與 Frame 改版 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** 把 `MONTH CLEARED` 換成一枚城市代碼的入境章，月份主題留空不渲染，
說明頁第三卡改文案，撕掉章的時候演一次紙被撕開。

**Architecture:** 城市分配是**純函式**（`ui.js` 的 `destinationsOf`），
用 `passports.id` 當種子洗牌，跟 `faceOf` / `pagesOf` / `milestoneState` 同一條原則：
只有一個定義點。資料只多讀一張 `destinations`，不新增任何寫入路徑。

**Tech Stack:** 零建置原生 JS、Supabase、`node --test`、`check.sh`

**Spec:** `docs/superpowers/specs/2026-08-26-entry-stamp-design.md`（§九 是實作前的裁定，先讀）

## Global Constraints

- **最多 3 種顏色**：`#FFC46C`、`#EDE5D8`、`#102A86`。深淺只能調透明度，
  只允許 `rgba(16,42,134,α)`、`rgba(255,196,108,α)`、`rgba(255,255,255,α)`。
  不得新增其他色碼，不得使用 `rgb()` / `hsl()`
- **最多 2 種字體**：Barlow Condensed／Inter
- **零建置、零相依**（不准 `npm install`）
- **不得出現任何個人姓名或個人聯絡方式**；只能用組織信箱 `beyondtaiwan2020@gmail.com`
- **介面文字全部留中文**（spec §零）。只有 `activities` / `milestones` 的內容是英文
- **既有的中文文案一個字都不要改寫或潤飾**，除了 spec §四 指名要換的那一段
- 測試指令是 `node --test test/*.test.mjs`（node 24 不會遞迴 `test/`）
- 破壞檔案做驗證時用 `cp` 備份還原，**不要用 `git checkout`**
- 量測一律附 `window.innerWidth` 與 `devicePixelRatio` 自證；預覽頁必須有
  `<meta name="viewport" content="width=device-width, initial-scale=1">`
- SQL 已由使用者跑完，**任何人都不要再連資料庫執行寫入或 DDL**

## File Structure

| 檔案 | 這一輪的責任 |
|---|---|
| `src/ui.js` | `destinationsOf` 純函式、`.estamp` 的 HTML、`monthPageHTML` 換章、`.mtheme` 不渲染、CATEGORY.frame.body |
| `src/data.js` | 多讀一張 `destinations`，進 `firstError` |
| `src/main.js` | unstamp 改成先演再刪，失敗還原 |
| `index.html` | `.estamp` 樣式與撕開的 keyframes、reduce 區塊 |
| `test/ui-destination.test.mjs` | 新檔，洗牌的三個要求 |
| `test/ui-month-head.test.mjs` | `.mtheme` 不渲染 |
| `supabase/migrations/2026-08-26-destinations.sql` | 留檔（已執行） |
| `README.md` | `destinations` 上線後不准增刪 |

---

## Task 1：月份主題空的時候不渲染 `.mtheme`

**Files:** Modify `src/ui.js`；Test `test/ui-month-head.test.mjs`

**先讀 spec §9.1** —— 這件事**不緊急**，正式站沒有壞。做它的理由是不要在 DOM 裡
留一個永遠是空的元素。

- [ ] **Step 1: 先寫失敗的測試**

加進 `test/ui-month-head.test.mjs`：

```js
test("theme_zh 與 theme_en 都空的時候，整個 .mtheme 不渲染", () => {
  const html = monthPageHTML(S(), { month: 9, theme_zh: "", theme_en: "" });
  assert.ok(!html.includes("mtheme"), "不要在 DOM 裡留一個永遠是空的元素");
  assert.ok(html.includes("九月"), "月名還在");
});

test("theme_zh 還有值的時候照舊渲染", () => {
  const html = monthPageHTML(S(), { month: 9, theme_zh: "07:00", theme_en: "" });
  assert.ok(html.includes('class="mtheme clock"'));
  assert.ok(html.includes("07:00"));
});
```

`S()` 用該檔案既有的 state 工廠；沒有的話就地建一個
`{ stamps:{}, entries:{}, activities:[], destinations:[], profile:{id:"..."} }`。

- [ ] **Step 2: 跑測試確認紅的**

Run: `node --test test/*.test.mjs`
Expected: 兩條新測試裡第一條 FAIL（現在無條件輸出 `.mtheme`）

- [ ] **Step 3: 改 `monthPageHTML`**

把這一行：

```js
      <div class="mtheme clock"><b>${esc(m.theme_zh)}</b>${m.theme_en ? `<span>${esc(m.theme_en)}</span>` : ""}</div>
```

換成：

```js
      ${m.theme_zh ? `<div class="mtheme clock"><b>${esc(m.theme_zh)}</b>${m.theme_en ? `<span>${esc(m.theme_en)}</span>` : ""}</div>` : ""}
```

上方那段 2026-08-22 的註解**保留**，並在後面補一段：

```js
// 2026-08-26：months 的 theme_zh 也全部清空了（spec §二），所以整個 .mtheme
// 跟著不渲染。**這不是版面修正** —— 實測 1280px（dpr 2）三種情況下 .mhead
// 都是 71.27：有主題 42.50、空字串 0、完全不渲染。.mhead 是 flex row，
// 高度由 .mzh 決定，.mtheme 從來沒有參與過，而空的 <b> 是空的 inline 元素、
// 不產生行框。理由跟上面那段一樣：不要在 DOM 裡留一個永遠是空的元素，
// 下一個人看到會以為渲染壞了然後去「修」它。
```

- [ ] **Step 4: 跑測試確認全過**，然後 `./check.sh`

- [ ] **Step 5: Commit**

```bash
git add src/ui.js test/ui-month-head.test.mjs
git commit -m "fix(ui): 月份主題空的時候整個 .mtheme 不渲染"
```

---

## Task 2：`destinationsOf` 純函式

**Files:** Modify `src/ui.js`；Create `test/ui-destination.test.mjs`

**Interfaces:**
- Produces: `export function destinationsOf(S)` → `{ [month:number]: {code, city} }`
- Consumes: `S.months`（已依 `seq` 排序，09 在最前）、`S.destinations`、`S.profile.id`

**先讀 spec §3 分配規則與 §9.5。**

- [ ] **Step 1: 先寫測試**

Create `test/ui-destination.test.mjs`：

```js
// 城市分配的三個要求（spec §3 分配規則）。
// 跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { destinationsOf } from "../src/ui.js";

const MONTHS = [9,10,11,12,1,2,3,4,5,6,7].map((month, seq) => ({ seq, month }));
const DEST = ["TPE TAIPEI","LAX LOS ANGELES","JFK NEW YORK","BNA NASHVILLE","MSN MADISON",
  "SFO SAN FRANCISCO","SEA SEATTLE","ORD CHICAGO","BOS BOSTON","BWI BALTIMORE",
  "PHL PHILADELPHIA","SAN SAN DIEGO","ROC ROCHESTER","IND INDIANAPOLIS","CLT CHARLOTTE",
  "SLC SALT LAKE CITY","YVR VANCOUVER","YYZ TORONTO","BRU BRUSSELS","AMS AMSTERDAM",
  "LHR LONDON","NRT TOKYO","ICN SEOUL","SYD SYDNEY"]
  .map(s => ({ code: s.slice(0,3), city: s.slice(4), active: true }));

const S = id => ({ months: MONTHS, destinations: DEST, profile: { id } });
const A = "3f1c9a20-0b7e-4d55-9a11-8c2e6f4b7d01";
const B = "a7e4b108-52dc-41f9-8f30-1d6c9b2e5a44";

test("九月一律是 TPE —— 每本護照都從台灣出發", () => {
  assert.equal(destinationsOf(S(A))[9].code, "TPE");
  assert.equal(destinationsOf(S(B))[9].code, "TPE");
});

test("十一個月全部分到，而且不重複", () => {
  const d = destinationsOf(S(A));
  const codes = MONTHS.map(m => d[m.month].code);
  assert.equal(codes.length, 11);
  assert.equal(new Set(codes).size, 11, "同一本護照不准出現兩次同一個城市");
});

test("TPE 不會在九月以外再出現一次", () => {
  const d = destinationsOf(S(A));
  const extra = MONTHS.slice(1).filter(m => d[m.month].code === "TPE");
  assert.deepEqual(extra, [], "TPE 抽掉之後不該回到池子裡");
});

test("同一個人算幾次都一樣", () => {
  const a = MONTHS.map(m => destinationsOf(S(A))[m.month].code);
  const b = MONTHS.map(m => destinationsOf(S(A))[m.month].code);
  assert.deepEqual(a, b, "不准用 Math.random()");
});

test("不同人拿到不同的組合", () => {
  const a = MONTHS.map(m => destinationsOf(S(A))[m.month].code).join();
  const b = MONTHS.map(m => destinationsOf(S(B))[m.month].code).join();
  assert.notEqual(a, b, "三十個人不該有兩本一樣的護照");
});

test("active=false 的目的地不進池子", () => {
  const dest = DEST.map(d => d.code === "LHR" ? { ...d, active: false } : d);
  const d = destinationsOf({ months: MONTHS, destinations: dest, profile: { id: A } });
  assert.ok(!MONTHS.some(m => d[m.month].code === "LHR"));
});

test("池子是空的時候回空物件，不炸也不假裝有章", () => {
  assert.deepEqual(destinationsOf({ months: MONTHS, destinations: [], profile: { id: A } }), {});
});

test("池子不夠十一個的時候，只分配得出來的那幾個月", () => {
  const d = destinationsOf({ months: MONTHS, destinations: DEST.slice(0, 4), profile: { id: A } });
  assert.equal(Object.keys(d).length, 4);
  assert.equal(d[9].code, "TPE");
});
```

- [ ] **Step 2: 跑測試確認紅的**

Run: `node --test test/*.test.mjs`
Expected: FAIL，`destinationsOf is not a function`

- [ ] **Step 3: 寫實作**

加進 `src/ui.js`（放在 `milestoneState` 之後，跟其他純函式一起）：

```js
// 每個月一枚入境章的城市（spec §3 分配規則）。**唯一的定義點** ——
// 跟 SLOT_ORDER、pagesOf、faceOf、milestoneState 同一條原則：
// 「這個月是哪個城市」只有這裡回答得了，任何要用的地方都問它。
//
// 九月固定 TPE：每本護照都從台灣出發（spec §3）。其餘十格從剩下的二十三個
// 洗牌取前十 —— 洗牌而不是每格獨立抽，是因為獨立抽會撞號，同一本護照出現
// 兩個 TOKYO 就不像護照了。
//
// 種子是 passports.id（就是 auth.uid()），不是 Math.random()：
// 同一個人重整幾次都要一樣。這個系統已經有一模一樣的機制 —— 章的旋轉角度
// 用 act.id 算（見 stampHTML）。
//
// ⚠️ **這個結果依賴 destinations 的內容。** 新增、刪除或停用任何一個目的地，
// 每個人剩下十格的城市都會重排 —— 包含已經蓋過章的月份。使用者九月看到
// TOKYO、明年三月回去看變成 LONDON。所以 destinations 上線後不准增刪，
// 這條也寫在 README（spec §9.5）。
const HOME_CODE = "TPE";

// FNV-1a 32-bit。要的是「同一個字串永遠得到同一個數字」，不是密碼學強度。
// 自己寫是因為零相依，而且 JS 沒有內建的穩定雜湊。
// Math.imul 不可省：一般的 * 會在超過 2^53 時失去精度，結果就不再穩定。
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function destinationsOf(S) {
  const months = S.months || [];
  const pool = (S.destinations || []).filter(d => d.active !== false);
  const seed = (S.profile && S.profile.id) || "";
  const home = pool.find(d => d.code === HOME_CODE);
  // 排序而不是 Fisher-Yates：同樣是決定性的，但少一個可變狀態，也好測。
  // 平手時用 code 收尾，讓結果在雜湊碰撞時仍然唯一。
  const rest = pool.filter(d => d.code !== HOME_CODE).slice().sort((a, b) =>
    (hash32(seed + a.code) - hash32(seed + b.code)) || (a.code < b.code ? -1 : 1));
  const order = home ? [home, ...rest] : rest;
  const out = {};
  months.forEach((m, i) => { if (order[i]) out[m.month] = order[i]; });
  return out;
}
```

- [ ] **Step 4: 跑測試確認全過**

- [ ] **Step 5: Commit**

```bash
git add src/ui.js test/ui-destination.test.mjs
git commit -m "feat(ui): 入境章的城市分配純函式"
```

---

## Task 3：讀 `destinations`

**Files:** Modify `src/data.js`；Create `supabase/migrations/2026-08-26-destinations.sql`

**先讀 spec §9.4。**

- [ ] **Step 1: `fetchAll` 多一個查詢**

在 `fetchAll` 的 `Promise.all` 陣列尾端加：

```js
    supabase.from("destinations").select("*").eq("active", true).order("code")
```

- [ ] **Step 2: 兩個解構與兩個 `firstError` 都要跟上**

`loadAll` 裡有**兩處** `[mo, ac, pa, st, en, ms] = await fetchAll(user)`
（第二處在 PGRST303 重試裡），兩處都要加 `de`。
`firstError([mo, ac, pa, st, en])` 也是**兩處**，兩處都要變成
`firstError([mo, ac, pa, st, en, de])`。

**`destinations` 要進 `firstError`，不套用 milestones 的例外。** 在 `firstError`
上方那段註解的結尾補：

```js
// 2026-08-26：destinations 進這張清單，**不比照 milestones**。
// milestones 讀不到的表現是「沒有里程碑 UI」，不會誤導；destinations 讀不到的話，
// 一個已經蓋滿三格的月份會什麼章都沒有 —— 那跟「你還沒蓋滿」長得一模一樣，
// 正是這段註解要防的那種誤導。README 第 9 項的直接應用（spec §9.4）。
```

- [ ] **Step 3: 回傳值與未登入的空形狀**

`loadAll` 的 return 加 `destinations: de.data || []`；
未登入的早退回傳也要加 `destinations: []`（跟 `milestones: []` 同一行附近）。

- [ ] **Step 4: `main.js` 的兩處 state**

`boot()` 已經是 `Object.assign(S, all)`，不用改。
但 `let S = {...}` 的初始值要加 `destinations: []`，
reset 分支的清除清單也要加 `destinations: []`。
**這是 2026-08-25 那個「手寫物件字面漏過兩次」的位置，逐字比對兩份清單。**

- [ ] **Step 5: 留遷移檔**

Create `supabase/migrations/2026-08-26-destinations.sql`，內容是 spec §六 那段 SQL
的第 1、2、3 節（`update activities` / `update months` / `create table destinations`），
檔頭加一行註解說明**已由使用者於 2026-08-26 執行**、這個檔案只是留底。

- [ ] **Step 6: 驗證**

`node --test test/*.test.mjs` 全過、`./check.sh` 全綠。
`grep -c 'de\]' src/data.js` 應為 2（兩處 `firstError`）——
**用 `grep -o … | wc -l` 不要用 `grep -c`**，`grep -c` 數的是行不是次數。

- [ ] **Step 7: Commit**

---

## Task 4：入境章

**Files:** Modify `src/ui.js`、`index.html`；Test `test/ui-month-head.test.mjs`

**先讀 spec §三、§9.2、§9.3、§9.6。**

- [ ] **Step 1: 先寫測試**

```js
test("蓋滿三格的月份有入境章，帶城市、代碼與日期", () => {
  const html = monthPageHTML(full(), M9);
  assert.ok(html.includes("IMMIGRATION"));
  assert.ok(html.includes("TAIPEI"));
  assert.ok(html.includes("TPE"));
  assert.ok(!html.includes("MONTH CLEARED"), "舊的疊印要整個換掉");
});

test("入境章的日期是三格裡最晚的那一天（spec §9.6）", () => {
  const S = full({ "09A": "2026-09-05", "09B": "2026-09-30", "09C": "2026-09-12" });
  assert.ok(monthPageHTML(S, M9).includes("2026.09.30"));
});

test("沒有活動的月份不會拿到入境章 —— 空集合的守衛", () => {
  const S = { ...full(), activities: [] };
  assert.ok(!monthPageHTML(S, M9).includes("IMMIGRATION"));
});

test("沒蓋滿就沒有章", () => {
  const S = full(); delete S.stamps["09C"];
  assert.ok(!monthPageHTML(S, M9).includes("IMMIGRATION"));
});

test("那個月分配不到城市的時候不渲染章，也不產生空的框", () => {
  const S = { ...full(), destinations: [] };
  assert.ok(!monthPageHTML(S, M9).includes("estamp"));
});
```

- [ ] **Step 2: 跑測試確認紅的**

- [ ] **Step 3: `ui.js` 的章**

```js
// 入境章。spec §三 —— MONTH CLEARED 說的是「你完成了」，這個說的是「你到過那裡」。
//
// 這是新的視覺元件，是原規格 §3.4 的**第二個明確例外**（第一個是 2026-08-25 的
// 翻面卡），使用者 2026-08-26 授權。不沿用 .overprint 是因為 .overprint 還在
// 資料頁被 FULL 用，而它是一行文字、這個是四行的框 —— 改它會連帶改到 FULL。
// 但位置、斜角、filter:url(#bt-ink)、pointer-events 全部沿用 .overprint 的值，
// 視覺語彙不新增。
//
// 日期取三格 stamped_on 的**最大值**（spec §9.6）：使用者可以自己改日期，
// 而「插入順序」既沒有進前端也不是使用者看得懂的東西。
function entryStampHTML(dest, date) {
  return `<div class="estamp">
    <span class="e1">IMMIGRATION</span>
    <span class="e2">${esc(dest.city)}</span>
    <span class="e3">${esc(dest.code)}</span>
    <span class="e4">${esc(date).replace(/-/g, ".")}</span>
  </div>`;
}
```

`monthPageHTML` 裡把 `full` 那一行換成：

```js
  const full = acts.length > 0 && acts.every(a => S.stamps[a.id]);
  const dest = full ? destinationsOf(S)[m.month] : null;
  const dated = full ? acts.map(a => S.stamps[a.id].date).sort().slice(-1)[0] : "";
```

然後 `${full ? ... : ""}` 換成 `${dest ? entryStampHTML(dest, dated) : ""}`。

**`acts.length > 0 &&` 那個守衛原封不動保留**，連同它上方那段講三次 bug 的註解。
日期用字串 `.sort()` 是安全的：`YYYY-MM-DD` 的字典序等於時間序。

- [ ] **Step 4: `index.html` 的樣式**

新增 `.estamp`，**位置與斜角先照抄 `.overprint` 的值**（`top:60px;right:26px`、
`rotate(-11deg)`、`filter:url(#bt-ink)`、`pointer-events:none`、
`color:var(--bt-navy)`、`border:3px double currentColor`）。
`.e2` 的字距拉開（spec §三「城市名字距拉開」）。
**不得新增顏色。** 手機的媒體查詢比照 `.overprint` 加一條。

- [ ] **Step 5: 量幾何，然後改數字（spec §9.3）**

桌機 1280px 與手機 390px 各一次，九月三格全蓋滿。回報：

- 章的 bounding box（含旋轉後的實際四角）
- **章的最低點** 與 **第三格 `.cat` 的最高點** 相差幾 px
- 手機另外回報：章有沒有壓到 `.mzh`（月名）

判準（沿用既有裁定）：**壓到右上角的時刻可以，壓到月名或格子裡的東西不可以。**
不符就調 `top`，調完重量，把最終數字與差距寫進 CSS 註解，
連同「改動 `.mhead`／`.slot` padding／`.cat` 字級要回來重量」那句一起。

**附 `window.innerWidth` 與 `devicePixelRatio` 自證。**

- [ ] **Step 6: 落下動畫（可選）**

如果加了 `.estamp.land`，**必須進 `@media (prefers-reduced-motion:reduce)` 那一行**。
不加就不用動。無論哪一種，Step 7 的 `check.sh` 會驗。

- [ ] **Step 7: `node --test test/*.test.mjs`＋`./check.sh`（第 25 項會抓漏掉的動畫）**

- [ ] **Step 8: 截圖**

1280px 與 390px 各一張蓋滿的九月頁，存到
`.superpowers/sdd/2026-08-26-entry-stamp/shots/`。

- [ ] **Step 9: Commit**

---

## Task 5：說明頁第三張卡

**Files:** Modify `src/ui.js`

- [ ] **Step 1: 換 `CATEGORY.frame.body`**

```js
  frame:  { label: "鏡頭 FRAME",  short: "鏡頭", define: "一張照片題目", body: "一個月一張照片。月亮、水溝蓋、公車站——你每天路過但從來沒看過的東西。三十個人拍同一樣東西，六個國家的差別會自己跑出來。" }
```

`label` / `short` / `define` **不動**。gather 與 prompt **整條不動**。

- [ ] **Step 2: 確認三張卡的第一句仍然對齊**

`一個月一次` / `一個月一題` / `一個月一張照片` —— 目視確認，不寫測試
（那是文案節奏，測試釘不住也不該釘）。

- [ ] **Step 3: 測試與 `check.sh`，截一張說明頁 1280px**

- [ ] **Step 4: Commit**

---

## Task 6：撕掉章的動畫

**Files:** Modify `src/main.js`、`index.html`

**先讀 spec §五、§9.7、§9.8。這是這一輪最容易做錯的一個。**

- [ ] **Step 1: 先修 §9.8 的既有缺陷**

現在的 unstamp 先 `delete S.stamps[id]` 再打 API，失敗只 toast、**state 沒有補回來**。
先把「失敗要還原」做出來（留住被刪的兩個值，catch 裡放回去再 `render()`），
跑一次確認行為正確，**再**加動畫。兩件事分開做，壞掉的時候才知道是哪一件。

- [ ] **Step 2: 動畫與時序**

- 分岔：`window.matchMedia("(prefers-reduced-motion: reduce)").matches`
- **reduce 為真：不演，直接刪。** `animation:none` 時 `animationend` 永遠不觸發，
  只靠事件會讓章卡在畫面上、資料永遠不刪（spec §9.7）
- reduce 為否：`S.tearing = id` → `render()`（章帶上 `.tear`）→ 監聽 `animationend`
  → 事件觸發才真的刪
- **不要用 `setTimeout` 串接**（`index.html` 既有的裁定：計時器會跟下一次
  `render()` 競態）
- 兩條路徑共用同一個「真的執行刪除」的函式，**只有一個定義點**
- 確認刪除的 `confirm()` 文案**一個字都不要改**

- [ ] **Step 3: `index.html` 的 keyframes**

裂口用 SVG `clip-path` 的鋸齒路徑，兩半各自往下掉、反向微轉、淡出，約 500ms。
**新增的 animation 必須進 reduce 區塊那一行**，否則 `check.sh` 第 25 項會 FAIL。

- [ ] **Step 4: 四種情況各驗一次**

1. 一般：按撕掉 → 演完 → 章消失 → 格子回到未蓋章的正面
2. reduce 開啟：按撕掉 → 直接變空格子，沒有動畫、**資料真的刪掉了**
3. 刪除失敗（把 `DATA.removeStamp` 暫時改成 throw）：章要**回來**，toast 出現
4. 演到一半翻頁：不可以出現 console 錯誤，不可以刪錯格子

- [ ] **Step 5: `node --test test/*.test.mjs`＋`./check.sh`**

- [ ] **Step 6: Commit**

---

## Task 7：README 記下 `destinations` 不准增刪

**Files:** Modify `README.md`

**先讀 spec §9.5。**

- [ ] **Step 1: 在「不要刪活動」那一節後面加一段**

要講清楚三件事：改動池子會讓**每個人**剩下十格的城市重排；重排包含**已經蓋過章的月份**；
使用者九月看到 TOKYO、明年三月回去看變成 LONDON。
這是種子洗牌的必然結果，不是 bug。

**同時寫下它依賴什麼前提**（README 第 11 項的直接應用）：這條規則的前提是
「城市由前端即時算出來、沒有存進資料庫」。哪一天改成把分配存進 `passports`，
這條就該跟著走。

- [ ] **Step 2: `./check.sh`**（README 不在 `FILES` 掃描範圍，但跑一次確認）

- [ ] **Step 3: Commit**

---

## Self-Review

- **spec 覆蓋**：§零（不改介面文字，寫進 Global Constraints）／§一（SQL 已完成）／
  §二 Task 1／§三 Task 2+3+4／§四 Task 5／§五 Task 6／§六 已完成，Task 3 留檔／
  §七 順序即 Task 順序／§八 不做／§九 各 Task 開頭指名要讀的節。
- **型別一致**：`destinationsOf` 回 `{month: {code, city}}`，Task 4 用
  `destinationsOf(S)[m.month]`，一致。
- **三件不能掉的既有行為**（spec §三）：空集合守衛在 Task 4 Step 3 明寫保留；
  reduced-motion 在 Task 4 Step 6 與 Task 6 Step 3，由 `check.sh` 第 25 項守；
  手機尺寸在 Task 4 Step 5 要重量。
