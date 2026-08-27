# 移除里程碑 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development

**Goal:** 把里程碑從前端整個拿掉。資料庫的 `milestones` 表與那四筆資料**留著不刪**。

**使用者的理由（2026-08-27）：**

> 入境章已經是完整的獎勵迴圈了 —— 蓋滿三格拿一枚不可撤銷的城市章、
> 十一枚顏色走完一個學年。再疊一層里程碑是多的，而且現在四張卡全是佔位字，
> 留著只是雜訊。

---

## 這不是純粹的刪除：四樣東西會變成孤兒

盤點之後發現，照字面刪掉會壞掉四件事。**這四件才是這個計畫的主體。**

### 孤兒一：`milestoneState` 是「章的數量」的唯一定義點

它不只服務里程碑。`Object.keys(S.stamps).length` 整個 `src/ui.js` **只出現一次**，
就在 `milestoneState` 裡，而兩個地方吃它的結果：

- `barHTML` 的「N / 33」（頂欄）
- `idPageHTML` 的 FULL 疊印（`total > 0 && done === total`）

直接刪掉的話，這兩處只能各自數一次 —— 那正是 `check.sh` 守了很久的事，
而且那條守門的註解寫得很清楚：**測試碰不到這件事**，兩邊各用同一條公式算一次，
算出來永遠一樣，任何比對結果的測試都會是綠的。

**所以要先做一個 `stampCount(S)` 純函式接手計數職責**，再拿掉 `milestoneState`。

### 孤兒二：`check.sh` 的「章的數量只准數一次」守門

它 grep `Object.keys(S.stamps).length` 要求剛好出現一次，訊息寫「就是
`milestoneState` 裡那次」。對象換成 `stampCount` 之後守門仍然成立，只要改文字。

### 孤兒三：`check.sh` 的 `firstError` 守門

它守的是「`ms` 不准出現在 `firstError` 的清單裡」。查詢拿掉之後，**那個 `ms` 不存在了**，
守門會永遠通過 —— 又是一條「必須不存在」型的空斷言（README 第 10、12 項）。

**要換成守真正該守的事**：`fetchAll` 裡有幾個查詢，`firstError` 就要收幾個，
**一個都不准被排除在外**。這比原本那條強，而且有真實的對象。

### 孤兒四：`data.js` 那段 `firstError` 的長註解

使用者指名的那一條。它整段在解釋「為什麼 milestones 是例外、而且只准它一個例外」。
查詢拿掉之後那段規則沒有對象了。**按 README 第 11 項處理**：不是刪掉，
是改寫成現在成立的規則（沒有例外），並記下曾經有過一個例外、以及它為什麼消失。

### 另外：`test/ui-milestone.test.mjs` 不能整個刪

那個檔案裡有**兩條跟里程碑無關**的測試：

- `頂欄顯示的數字等於 milestoneState 的 done` —— 顯示端有沒有印錯
- `FULL 疊印：蓋滿才出現，而且沒有活動時不算蓋滿` —— **釘住空集合守衛**，
  那個 bug class 在這個 repo 咬過三次

**這兩條要搬到別的檔案，不是跟著檔案一起刪。**

---

## Global Constraints

- **顏色**：`#FFC46C`、`#EDE5D8`、`#102A86`，深淺只能調透明度。`.estamp` 的季節色盤是
  唯一例外（`check.sh` 三條守門）。不得使用 `rgb()` / `hsl()`
- **最多 2 種字體**：Barlow Condensed／Inter
- **零建置、零相依**；不得出現個人姓名或個人聯絡方式
- **既有的中文文案一個字都不要改寫或潤飾**
- 測試指令 `node --test test/*.test.mjs`
- 破壞測試在**自己的乾淨副本**上做（README 第 12 項）
- **不准連線資料庫、不准執行任何 SQL。資料庫的 `milestones` 表與資料一律不動。**

## 現況

- 97 個測試全過、`check.sh` 30 項全綠
- `milestones` 出現的檔案：`index.html`(11)、`src/ui.js`(16)、`src/main.js`(5)、
  `src/data.js`(14)、`check.sh`(10)、`README.md`(6)、`test/ui-milestone.test.mjs`(29)、
  `test/ui-pages.test.mjs`(2)、`supabase/schema.sql`(6)

---

## Task 1：`stampCount` 接手計數職責

**Files:** Modify `src/ui.js`；Create `test/ui-count.test.mjs`

**這一步不刪任何東西**，只是把計數的定義點搬出來，讓 Task 2 拿得掉 `milestoneState`。

- [ ] **Step 1: 先寫測試**（新檔 `test/ui-count.test.mjs`）

把 `test/ui-milestone.test.mjs` 裡那兩條**跟里程碑無關**的測試搬過來並改對象：

```js
test("頂欄顯示的數字等於 stampCount", () => { ... });
test("FULL 疊印：蓋滿才出現，而且沒有活動時不算蓋滿", () => { ... });
```

第二條**逐字保留原本的三個案例**（沒有活動、沒蓋滿、全蓋滿），
連同它上方那段講「空集合讓 `.every()` 無條件成立、這個 repo 咬過三次」的註解。

- [ ] **Step 2: 跑測試確認紅的**

- [ ] **Step 3: 實作**

```js
// 蓋了幾個章。**整個 src/ui.js 只准在這裡數一次** ——
// barHTML 的「N / 33」與 idPageHTML 的 FULL 疊印都吃它的結果。
// check.sh 用 grep 守住這件事（見該檔案「章的數量」那條）。
//
// 這條守的是架構不是行為，**測試碰不到**：兩邊各自用同一條公式算一次的話，
// 算出來永遠一樣，任何比對結果的測試都會是綠的（2026-08-25 實測）。
// 真正會出事的是有人只改了其中一處的定義 —— 那時候畫面上兩個數字會不一致，
// 而沒有任何東西會報錯。
//
// 2026-08-27：這個職責原本在 milestoneState 裡。里程碑拿掉之後它會跟著消失，
// 而計數這件事還在，所以先搬出來（見 docs/superpowers/plans/2026-08-27-remove-milestones.md）。
export function stampCount(S) {
  return Object.keys(S.stamps).length;
}
```

`milestoneState` 改成 `const done = stampCount(S);`，`barHTML` 與 `idPageHTML`
暫時不動（它們現在讀 `milestoneState(S).done`，Task 2 才改）。

- [ ] **Step 4: `check.sh` 那條守門改對象**

訊息從「就是 `milestoneState` 裡那次」改成「就是 `stampCount` 裡那次」。
grep 的 pattern 不用改。

- [ ] **Step 5: 測試全過、`./check.sh` 30 項全綠**

- [ ] **Step 6: Commit**

---

## Task 2：拿掉前端的里程碑

**Files:** Modify `src/ui.js`、`index.html`、`test/ui-pages.test.mjs`；
Delete `test/ui-milestone.test.mjs`

- [ ] **Step 1: `src/ui.js`**

- 刪 `milestoneState`、`milestonesHTML`
- `barHTML`：`const ms = milestoneState(S)` → `const done = stampCount(S)`，
  並**刪掉「下一個里程碑還差 N 個章」那一段**（`${ms.next ? ... : ""}`）
- `idPageHTML`：`milestoneState(S).done` → `stampCount(S)`，刪掉 `${milestonesHTML(S)}`
- 其他註解裡提到 `milestoneState` 當成「單一定義點」範例的地方
  （`pagesOf`、`faceOf`、`visasOf` 上方），**把名字換成 `stampCount`**，
  不要整句刪掉 —— 那些句子講的是原則，原則沒有消失

- [ ] **Step 2: `index.html`**

刪 `.slots.mstones`、`.slots.mstones .slot`、`.slots.mstones .slot[data-locked="1"]`、
`.mstones-h`。第 185 行那段列舉卡片變體的註解裡「資料頁的里程碑卡 0
（`.slots.mstones .slot`）」也要拿掉。

**注意第 268 行那段講特異性的註解**（`.slots.mstones` 是 (0,2,0)）——
它是在解釋另一條規則為什麼要那樣寫，例子沒了要改寫，不要留一個指向不存在
選擇器的說明。

- [ ] **Step 3: 測試**

- 刪 `test/ui-milestone.test.mjs`（那兩條該留的已經在 Task 1 搬走了）
- `test/ui-pages.test.mjs` 兩處 fixture 的 `milestones: []` 拿掉

- [ ] **Step 4: 測試全過、`./check.sh`**

- [ ] **Step 5: 截圖**：資料頁與頂欄各一張 1280px，確認沒有留下空白區塊，
      存到 `.superpowers/sdd/2026-08-27-remove-milestones/shots/`

- [ ] **Step 6: Commit**

---

## Task 3：`data.js` 的查詢，以及 `firstError` 的註解與守門

**Files:** Modify `src/data.js`、`check.sh`

**這一步是這個計畫最需要判斷的一步，不是機械刪除。**

- [ ] **Step 1: `src/data.js` 拿掉查詢**

- `fetchAll` 的 `milestones` 查詢
- `milestonesOf()` 整個函式
- `loadAll` **兩處**解構的 `ms`（第二處在 PGRST303 重試裡）
- `loadAll` 回傳的 `milestones:`
- 未登入早退回傳的 `milestones: []`

**兩處解構都要改**，這個 repo 在同一個位置漏過兩次。

- [ ] **Step 2: 改寫 `firstError` 的註解（README 第 11 項）**

那段長註解整段在解釋「為什麼 milestones 是例外、而且只准它一個例外」。
**查詢拿掉之後那段規則沒有對象了。不要刪掉，改寫成現在成立的規則。**

要保留的兩件事：

1. **原本的理由**：任何一個查詢失敗就整批視為失敗，因為部分成功比全部失敗更危險
   —— 少了 stamps 的畫面看起來就是「一個章都沒蓋」，學生會以為紀錄不見了然後重蓋一次
2. **曾經有過一個例外、以及它為什麼消失**：milestones 讀不到的表現是「沒有里程碑 UI」，
   不會誤導任何人，所以當時被排除在外。2026-08-27 里程碑整個移除，那個例外跟著消失。
   **現在沒有任何例外。**

還要寫下這條規則依賴什麼前提（第 11 項的做法）：前提是「每一個查詢的失敗都會讓
畫面說謊」。哪天真的有一個查詢不符合這個前提，要重新判斷 —— 但**判斷的門檻是
「讀不到的時候畫面會不會誤導人」，不是「這個功能重不重要」**。

- [ ] **Step 3: `check.sh` 的 `firstError` 守門換成守真正該守的事**

現在那條守「`ms` 不准在清單裡」。`ms` 不存在之後，它會**永遠通過** ——
又一條空斷言（README 第 10、12 項）。

換成：**`fetchAll` 裡有幾個查詢，`firstError` 就要收幾個。**

```bash
# fetchAll 裡的查詢數 = firstError 清單的長度。一個都不准被排除在外。
#
# 2026-08-27 之前這條守的是「ms 不准在清單裡」。里程碑移除之後那個 ms 不存在了，
# 於是那條守門**永遠通過** —— 它是 README 第 12 項那條「**移除一個字串，
# 會把所有斷言它不存在的測試變成空的**」的實例，只是發生在守門這一側。
# **看到這條註解的人請回去讀 README 第 12 項**，那裡有另外四個形狀不同、
# 病因一樣的例子。
# 換成數量比對之後才有真實的對象：新增查詢卻忘了加進 firstError，會被抓到。
q=$(grep -o 'supabase\.from(' src/data.js | ...)      # fetchAll 區塊內的查詢數
l=$(...)                                              # firstError([...]) 裡的識別字數
```

**實作細節自己定**，但要滿足：

- 只數 `fetchAll` 函式內的查詢（`loadAll` 以外還有別的地方用 `supabase.from(`）
- `firstError` 仍然要「出現兩次而且兩次一模一樣」
- **反向驗證四種**（在自己的乾淨副本上做）：
  1. `fetchAll` 多加一個查詢但不加進 `firstError` → FAIL
  2. 從 `firstError` 拿掉一個 → FAIL
  3. 兩處 `firstError` 改成不一樣 → FAIL
  4. 現況 → ok

- [ ] **Step 4: 測試全過、`./check.sh`**

- [ ] **Step 5: Commit**

---

## Task 4：文件

**Files:** Modify `README.md`、`supabase/schema.sql`、
`supabase/migrations/2026-08-25-milestones.sql`、`src/main.js`（只改註解）

- [ ] **Step 1: `supabase/schema.sql`**

在 `create table if not exists milestones (` 上方加註解：

- **這張表目前沒有被前端讀取**（2026-08-27 移除），資料留著
- 為什麼留著：移除是前端的事，資料留著不影響任何東西，之後想回來做，
  表和 RLS 都還在
- **不要去找它在哪裡被讀，前端沒有任何地方讀它**

`revoke` / `grant` 那兩行提到 milestones 的**不要動**（權限留著是刻意的）。

- [ ] **Step 2: `supabase/migrations/2026-08-25-milestones.sql`**

檔頭加一行：這個功能已於 2026-08-27 從前端移除，這個檔案是歷史紀錄，
表與資料仍在資料庫裡。

- [ ] **Step 3: `README.md`**

- **第 9 項**：標題列舉「參考資料（`months`／`activities`／`milestones`）」——
  `milestones` 拿掉，但**下面那段講 2026-08-25 事故的原文完整保留**。
  那是一個事故紀錄不是一條關於現存功能的規則。補一句：里程碑已於 2026-08-27 移除，
  這個教訓對 `destinations`／`visas` 一樣成立
- **第 12 項**兩處提到里程碑的實例（同義反覆的測試、守門守錯東西）：**原文不動**，
  同樣是事故紀錄
- 其他描述里程碑**功能**的地方：拿掉

- [ ] **Step 4: `src/main.js` 的歷史註解**

第 469、480、485、552-553 行提到 milestones 的都是**在解釋別條規則為什麼存在**
（reset 清單的判準、`Object.assign` 為什麼不能退回手寫）。**原文保留**，
補一句里程碑已移除、那個教訓對 `destinations`／`visas` 一樣成立。

- [ ] **Step 5: 全域搜一次**

`grep -rin 'milestone\|里程碑\|mstones' index.html src check.sh README.md test supabase`
逐條確認每一個剩下的出現都是**刻意保留的歷史紀錄**，不是漏掉的。
把清單貼進報告。

- [ ] **Step 6: Commit**

---

## Self-Review

- **四個孤兒都有對應的 Task**：計數 → Task 1；兩條守門 → Task 1 Step 4 與
  Task 3 Step 3；`firstError` 註解 → Task 3 Step 2。
- **不能弄丟的測試**：FULL 疊印那條（空集合守衛，咬過三次）在 Task 1 Step 1
  搬走，Task 2 才刪檔案。順序不能顛倒。
- **資料庫零改動**：所有 Task 都不准連線或執行 SQL。
- **歷史紀錄與現存規則的分界**：README 第 9、12 項與 `main.js` 的註解是事故紀錄，
  原文保留；描述功能的地方才拿掉。
