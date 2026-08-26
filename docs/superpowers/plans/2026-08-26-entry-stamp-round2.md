# 入境章第二輪：放大、角度、季節色 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development

**Goal:** 讓入境章大到會壓過活動格子（那是「這個月結束了」的感覺），
角度由「月份 + uuid」決定，顏色沿著學年走一圈十一色的季節漸變。

**Architecture:** 角度與月份色都是**純函式／純對應**，跟 `visasOf` 同一條原則：
一個定義點。顏色寫在 `index.html` 一個有哨兵註解框起來的區塊裡，
`check.sh` 把那個區塊列為**明確的例外**——例外清單寫死在檢查裡，兩個方向都守。

**Spec:** `docs/superpowers/specs/2026-08-26-entry-stamp-design.md` §十（本輪新增）

## Global Constraints

- **顏色**：`#FFC46C`、`#EDE5D8`、`#102A86`，深淺只能調透明度
  （`rgba(16,42,134,α)`、`rgba(255,196,108,α)`、`rgba(255,255,255,α)`）。
  **唯一的例外是 `.estamp` 的季節色盤**，規則見 Task 4。其他地方一律三色
- **最多 2 種字體**：Barlow Condensed／Inter
- **零建置、零相依**；不得出現個人姓名或個人聯絡方式
- **介面文字全部留中文**；既有中文文案一個字都不要改寫
- 測試指令 `node --test test/*.test.mjs`（node 24 不會遞迴 `test/`）
- 量測附 `window.innerWidth` 與 `devicePixelRatio` 自證；預覽頁要有
  `<meta name="viewport" content="width=device-width, initial-scale=1">`；
  手機用 `emulate` 的 `390x844x3,mobile,touch`，**不要用 `resize_page`**
- 破壞測試用 `cp` 在**自己的乾淨副本**上做，不對共用工作樹做破壞性操作
  （README 第 12 項）
- **不准連線資料庫、不准執行任何 SQL**

---

## Task 1：角度由「月份 + uuid」決定

**Files:** Modify `src/ui.js`；Test `test/ui-visa.test.mjs`

**先讀 spec §10.2。**

範圍 **-15° 到 +8°**（跨距 23°）。種子是 `月份 + passport.id`，
所以同一個人每個月不同、重整不會跳、不同人也不一樣。

`hash32` 已經在 `ui.js`（Task 2 那輪加了 avalanche，見它的註解）。

- [ ] **Step 1: 先寫測試**

```js
test("angleOf：落在 -15 到 +8 之間", () => {
  for (const m of [9,10,11,12,1,2,3,4,5,6,7]) {
    const a = angleOf(A, m);
    assert.ok(a >= -15 && a <= 8, `${m} 月拿到 ${a}`);
  }
});

test("angleOf：同一個人同一個月，算幾次都一樣", () => {
  assert.equal(angleOf(A, 9), angleOf(A, 9), "不准用 Math.random()");
});

test("angleOf：同一個人不同月份不會全部一樣", () => {
  const s = new Set([9,10,11,12,1,2,3,4,5,6,7].map(m => angleOf(A, m)));
  assert.ok(s.size >= 6, `十一個月只有 ${s.size} 種角度，看起來像整本都同一個角度`);
});

test("angleOf：不同人的同一個月不一樣", () => {
  const diff = [9,10,11,12,1,2,3,4,5,6,7].filter(m => angleOf(A, m) !== angleOf(B, m));
  assert.ok(diff.length >= 8, `十一個月只有 ${diff.length} 個月不同`);
});

test("angleOf：沒有 profile 也不炸", () => {
  assert.ok(Number.isFinite(angleOf("", 9)));
});
```

- [ ] **Step 2: 跑測試確認紅的**

- [ ] **Step 3: 實作**

```js
// 入境章的角度。**跟活動章同一套機制**：由 id 算出來、不是隨機，所以重整不會跳
// （活動章見 stampHTML 的 rot）。種子多帶一個月份，讓同一本護照的十一枚章
// 各有各的角度 —— 整本同一個角度看起來像印刷，不像一枚一枚蓋上去的。
//
// 範圍 -15° 到 +8°（使用者 2026-08-26 指定）。不對稱是刻意的：
// 逆時針多一點、順時針少一點，跟大多數人右手蓋章的手腕角度一致。
//
// 用 hash32 而不是活動章那個 charCodeAt 公式：那個公式的輸入是 act.id 的
// 第三個字元，這裡的輸入是 uuid + 月份，字元數差太多。**不要順手把 stampHTML
// 也改成 hash32** —— 那會讓每一枚已經蓋出去的活動章換角度。
const ANGLE_MIN = -15, ANGLE_SPAN = 24;   // -15..+8，含兩端共 24 個整數
export function angleOf(seed, month) {
  return ANGLE_MIN + (hash32(String(seed) + ":" + month) % ANGLE_SPAN);
}
```

`slotHTML` 不動。`entryStampHTML` 改成吃 `angle` 並輸出
`style="transform:rotate(${angle}deg)"`，`index.html` 的 `.estamp` 拿掉寫死的
`rotate(-11deg)`（**其餘 transform 相關的東西不要動**）。

- [ ] **Step 4: 測試全過、`./check.sh`**

- [ ] **Step 5: Commit**

---

## Task 2：放大，判準換成「不壓月份數字與月名」

**Files:** Modify `index.html`；Test `test/ui-month-head.test.mjs`

**先讀 spec §10.1。這一步是量測，不是套版。**

### 判準整個換掉

舊判準是「不可以切到活動格子裡的任何東西」。**新判準（使用者 2026-08-26）**：

- **可以**壓到第二、三格，包含格子裡的內容。
  那個「壓過去」正是「這個月結束了」的感覺，而且真的入境章本來就蓋在
  已經有東西的頁面上。月份章只在三格全蓋滿才出現，所以底下一定都完成了。
- **不可以**壓到 `.mnum`（月份數字）與 `.mzh`（月名）。**那是導航不是內容。**

- [ ] **Step 1: 先確認 `pointer-events:none` 真的有效**

章現在會蓋在可點的格子上面。`pointer-events:none` 從裝飾性的保險變成
**載重的**：少了它，蓋滿的月份會有兩格點不開。

在預覽頁對章的正中央呼叫 `document.elementFromPoint(...).closest('[data-act]')`，
確認拿到的是**底下那一格**而不是章。附 `innerWidth` / `dpr` 自證。

然後在 `check.sh` 加一條守門（**這是「必須存在」型，要錨定**，見 README 第 10 項）：

```bash
# .estamp 蓋在可點的格子上面，pointer-events:none 是載重的不是裝飾的 ——
# 少了它，蓋滿的月份會有兩格點不開，而且不會有任何東西報錯。
if grep -qE '^\s*position:absolute;top:[0-9]+px;right:[0-9]+px;z-index:2;pointer-events:none;' index.html; then
  ok ".estamp 的 pointer-events:none 還在"
else
  bad ".estamp 少了 pointer-events:none，蓋滿的月份會有格子點不開"
fi
```

加完之後**刪掉那個宣告跑一次，確認真的 FAIL**，再還原。

- [ ] **Step 2: 產生三個尺寸，截圖給使用者選**

`.e2` 分別用 **20px / 26px / 32px**，其餘三行按現有比例等比放大
（現況 8/14/11/9，比例 0.57 / 1 / 0.79 / 0.64），padding 一併等比。

每一組都要 1280px 與 390px 各截一張**蓋滿的九月頁**，
存成 `.superpowers/sdd/2026-08-26-entry-stamp/shots/size-{20,26,32}-{1280,390}.png`。

**三組都要用最壞的組合**（見 Step 3）。

- [ ] **Step 3: 量測要跑「最壞角度 × 最長城市」的乘積，不是單一案例**

上一輪的教訓（README 第 12 項）：量了，但量的是最容易過的那個案例。

- **城市**：`SALT LAKE CITY`（14 字母，最長）、`SAN FRANCISCO`、`TAIPEI`（對照）
- **角度**：`-15`、`-11`、`0`、`+8`（範圍兩端與中間）
- **視寬**：1280 與 390

每一格回報：

1. `.estamp` 旋轉後的 `top/bottom/left/right`（相對 `.page`）
2. **跟 `.mnum` 的重疊面積**（必須是 0）
3. **跟 `.mzh` 的重疊面積**（必須是 0）
4. 有沒有超出 `.page` 的左／右／上邊界
5. `document.documentElement.scrollWidth > innerWidth`（不准出現橫向捲軸）

**注意**：正角度會把章往另一邊倒，左下角更靠近 `.mzh` ——
`.mzh` 那條限制的最壞情況很可能是 **`+8°` × 最長城市**，不是 `-15°`。
不要只量負角度。

- [ ] **Step 4: 把最終尺寸與最壞情況的數字寫進 CSS 註解**

連同這句：**之後改任何一行的字級、padding 或角度範圍，要拿
「最長城市 × 角度範圍兩端」重量，不要拿 TAIPEI 也不要只量一個角度。**

- [ ] **Step 5: 停下來等使用者選尺寸**（控制端負責，不要自己挑）

---

## Task 3：底色的取捨，兩版截圖給使用者選

**Files:** Modify `index.html`

章放大之後會壓在活動格子的內容上，於是「底色」變成一個真的設計問題：

| 版本 | 樣子 | 代價 |
|---|---|---|
| **A 有底色**（現況，桌機 `opacity:.85`／手機 `1`） | 章是一塊實心的牌 | 壓到的地方底下的內容被蓋掉或糊在一起 |
| **B 只有墨線、沒有底色** | 像真的蓋在已經印好的頁面上，底下的東西從筆畫之間透出來 | `.mhead` 那條線會再度穿過日期（手機那個問題會回來） |

使用者的原話是「真的入境章本來就蓋在已經有東西的頁面上」，聽起來偏 B，
但 B 會把 2026-08-26 剛修好的手機可讀性問題帶回來。**這一題由使用者裁定。**

- [ ] **Step 1: 兩版各截 1280 與 390 兩張**，用 Task 2 選定的尺寸與最壞城市
- [ ] **Step 2: 停下來等使用者裁定**

---

## Task 4：十一色季節漸變，以及 `check.sh` 的明確例外

**Files:** Modify `index.html`、`src/ui.js`、`check.sh`；Test `test/ui-visa.test.mjs`

**先讀 spec §10.3。色碼由使用者指定，控制端在這一步之前跟他要。**

### 顏色住在哪

**一個定義點，在 `index.html`，用哨兵註解框起來**：

```css
  /* ==== ESTAMP-PALETTE-BEGIN ==== 這個區塊是 check.sh 三色守門的唯一例外。
     十一個月一色，九月與七月同色 —— 翻完一本回到原點，那正好是學年的形狀。
     **在這裡新增或修改任何色碼，check.sh 都會 FAIL**，要同時改檢查裡那份
     寫死的清單。那是刻意的：例外要一次只開一個洞，不是開一扇門。 */
  .estamp.m09{--ink:#XXXXXX}   /* 九月 暖橘 */
  ...
  .estamp.m07{#XXXXXX}         /* 七月 回到暖橘，跟 m09 同色 */
  /* ==== ESTAMP-PALETTE-END ==== */
```

`.estamp` 的 `color` 與框線改用 `var(--ink)`；底色（若 Task 3 選 A）用
`color-mix(in srgb, var(--ink) 14%, transparent)` —— **這樣一個月只有一個色碼**，
例外清單維持十一筆。`color-mix` 不支援的瀏覽器會丟掉那一行，
退化成沒有底色的章，仍然可讀（Chrome 111+／Safari 16.2+／Firefox 113+，2023 起）。

`src/ui.js` 只加 class，**不准出現任何色碼**：
`class="estamp m${String(month).padStart(2,'0')}"`。

### `check.sh` 的例外：兩個方向都守，清單寫死

**不要放寬既有那條檢查。** 它今天才擋下過真實錯誤（2026-08-26）。改成加三條：

```bash
# .estamp 的季節色盤是三色規則的**唯一例外**（使用者 2026-08-26）。
# 清單寫死在這裡，不用萬用字元 —— 例外要一次只開一個洞，不是開一扇門。
# 新增或修改任何一色都必須同時改這一行，那是刻意的摩擦。
ESTAMP_PALETTE="#XXXXXX #XXXXXX ..."   # 十一個月、十色（09 與 07 同色）

# 哨兵各自只准出現一次。多一個或少一個都會讓下面兩條抽錯範圍，
# 而抽錯範圍的守門比沒有守門更糟（README 第 10 項）。
b=$(grep -c 'ESTAMP-PALETTE-BEGIN' index.html)
e=$(grep -c 'ESTAMP-PALETTE-END' index.html)
[ "$b" = "1" ] && [ "$e" = "1" ] || bad "ESTAMP-PALETTE 的哨兵不是各一個（$b / $e）"

# 方向一：區塊裡的色碼必須**剛好等於**清單。多一個少一個都 FAIL。
# 這一條讓「偷偷加第十二色」不可能，而不只是「不鼓勵」。
inside=$(sed -n '/ESTAMP-PALETTE-BEGIN/,/ESTAMP-PALETTE-END/p' index.html \
         | grep -ohI '#[0-9A-Fa-f]\{6\}' | tr 'a-f' 'A-F' | sort -u)
want=$(printf '%s\n' $ESTAMP_PALETTE | tr 'a-f' 'A-F' | sort -u)
[ "$inside" = "$want" ] || bad "色盤區塊裡的色碼跟 check.sh 寫死的清單對不上"

# 方向二：這些色碼**不准出現在區塊外面**。季節色是入境章專用的，
# 不是「解禁了十色可以到處用」。
outside=$(sed '/ESTAMP-PALETTE-BEGIN/,/ESTAMP-PALETTE-END/d' index.html; cat src/*.js activities.json)
for c in $ESTAMP_PALETTE; do
  printf '%s' "$outside" | grep -qiF "$c" && bad "季節色 $c 出現在色盤區塊之外"
done
```

既有那條「只有三個色碼」的掃描，把色盤區塊排除在外即可（**不是加白名單**），
理由寫在旁邊。

- [ ] **Step 1: 跟使用者要十一個色碼**（控制端做，不是實作者）
- [ ] **Step 2: 寫測試**：`entryStampHTML` 帶對月份 class、`ui.js` 裡沒有任何色碼
- [ ] **Step 3: 實作**
- [ ] **Step 4: 反向驗證守門（四種破壞，每一種都要看到 FAIL）**
  1. 色盤區塊裡改一個色碼 → FAIL
  2. 色盤區塊裡多加一個色碼 → FAIL
  3. 把某個季節色寫到 `.book` 的樣式裡 → FAIL
  4. 刪掉一個哨兵 → FAIL
  **在自己的乾淨副本上做**，還原後 `git status --short` 確認乾淨
- [ ] **Step 5: 十一個月各截一張**，排成一張對照圖給使用者看季節走向
- [ ] **Step 6: Commit**

---

## Self-Review

- **三件事的相依**：Task 2 的量測依賴 Task 1 的角度範圍（正角度會把章往
  `.mzh` 那邊倒），所以角度先做。Task 3 的底色取捨依賴 Task 2 選定的尺寸。
  Task 4 的顏色跟幾何無關，排最後。
- **兩個停止點**：Task 2 結束選尺寸、Task 3 結束選底色版本；
  Task 4 開始前跟使用者要色碼。
- **新的載重相依**：`pointer-events:none`（Task 2 Step 1 加守門）。
- **舊判準被取代**：`.overprint`／`.estamp` 那段「不可以切到格子裡任何東西」
  的註解要改寫，但**保留原文與被取代的理由**（同 2026-08-25 裁定 2 的做法）。
