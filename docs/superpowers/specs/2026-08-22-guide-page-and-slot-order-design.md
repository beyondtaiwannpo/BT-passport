# BT Passport — 說明頁、三格順序、月份時刻 設計規格

2026-08-22。這份文件補充 `2026-08-16-bt-passport-design.md`，不取代它。
本輪四件事：修好一條從原型就存在的 CSS bug、把三格順序寫死、加一頁說明、
把月份主題換成時刻。

---

## 1. 按鈕 reset 的特異性 —— 全站所有 `<button>` 的外觀都是死的

### 1.1 症狀與根因

回報的症狀是「月份頁底下的翻頁圓點只剩一個」。實際範圍大得多。

`index.html` 的

```css
#bt-root button{font-family:var(--body);cursor:pointer;border:none;background:none;color:inherit}
```

特異性是 (1,0,1)。所有描述按鈕外觀的規則都靠 class，特異性 (0,1,0) 到 (0,2,1)，
一律輸給它。**宣告寫了，但一條都沒有生效。**

在正式站 `passport.beyondtaiwannpo.com` 上量登入頁的主按鈕，實測值：

```
登入 | bg=rgba(0,0,0,0) | border=0px none | color=rgb(16,42,134)
```

`.btn` 的 `background:var(--bt-navy)` 從來沒有出現在畫面上。

用本 repo 的整份 CSS 在瀏覽器裡逐一量測，中槍名單：

| 元件 | 規則寫的 | 實際算出來的 |
|---|---|---|
| `.btn` | 深藍實心底、米白字 | 透明底、深藍字 |
| `.btn.ghost` | 1px 深藍框 | 無框 |
| `.slot` | 1.5px 虛線框；hover 轉橘 | 無框；hover 無反應 |
| `.slot[data-done="1"]` | 實線框 + 橘色淡底 | 無框、無底 |
| `.tabs button[aria-selected="true"]` | 深藍實心底 | 透明 |
| `.nav button.arrow` | 1px 框 | 無框 |
| `.photo` | 1px 框 + 橘色淡底 | 無框、無底 |
| `.dots button` | 圓框；蓋滿轉橘 | 全部隱形 |

圓點之所以還看得到一顆，是因為 `[aria-current="true"]` 用的是 `outline` 而不是
`border` 或 `background` —— outline 不在那條 reset 的射程內。所以畫面上唯一的圓圈
就是「你當下所在的那一頁」，跟它是第幾頁、蓋滿沒蓋滿都無關。

`git log -S` 顯示這條 reset 在 `a2a26c2`（原型匯入）就存在，`1d4a1e9`
拆檔時原樣搬過來。**這個站從上線到現在沒有一天顯示正確過。**

### 1.2 改法

```css
:where(#bt-root button){font-family:var(--body);cursor:pointer;border:none;background:none;color:inherit}
```

`:where()` 的特異性恆為零，所以整條規則降到 (0,0,0)。它仍然蓋得過瀏覽器
預設樣式（作者樣式表無論特異性多低都排在 UA 樣式表前面），但輸給任何一條
class 規則。

已在瀏覽器實測（改法套在本 repo 的真實 CSS 上）：

```
dot    border=1px solid       bg=transparent            第二顆 bg=rgb(255,196,108)
btn    border=0px none        bg=rgb(16,42,134)
ghost  border=1px solid       bg=transparent
slot   border=1.5px dashed    bg=transparent
tab    border=0px none        bg=rgb(16,42,134)
arrow  border=1px solid       bg=transparent
photo  border=1px solid       bg=rgba(255,196,108,.2)
bare   border=0px none        bg=transparent            ← 沒有 class 的裸 button 仍被 reset 壓住
```

最後一行是重點：reset 仍然在做它該做的事，只是不再誤傷。

**不採用「只把 `.dots` 那三條加上 `#bt-root` 前綴」的最小修法。** 那修掉的是症狀，
留下六組看起來有效、實際無效的宣告在 CSS 裡，下一個人會再踩一次同一個坑。

### 1.3 已知的副作用

整站外觀會在這一個 commit 裡明顯變樣：主按鈕變成深藍實心、活動格子出現虛線框、
分頁鍵選中時變深藍、上一頁/下一頁出現外框、大頭照框回來。這是原型設計本來的
樣子，不是新設計，但**必須逐頁看過**才算完成（見 §7 驗收）。

`check.sh` 的 §11-14 三色檢查不受影響：回來的顏色全部來自既有的三個色碼。

---

## 2. 三格順序寫死為 聚會 → 題目 → 鏡頭

### 2.1 根因比「按字母排」更硬

`src/data.js` 的查詢是

```js
supabase.from("activities").select("*").eq("active", true).order("month").order("seq")
```

沒有 `category`。而 `seed.sql` 裡**同一個月三格的 `seq` 是同一個值**
（`09A`／`09B`／`09C` 全部 `seq = 1`）。也就是說同月內三格完全沒有排序鍵，
順序由 Postgres 當下決定，不保證穩定，也可能在某次查詢之後自己改變。

`data.js` 那行上面的註解正好在警告這件事（「活動格子會在每次載入之間換位置，
而學生記的是位置」），seed 的資料讓那個保護失效了。

### 2.2 改法

在 `src/ui.js` 加一個排序表，`monthPageHTML` 依它排：

```js
// 三格的順序：聚會 → 題目 → 鏡頭。**這個順序是設計決定，不是資料庫的字母序。**
// 理由是難度遞增：聚會最輕鬆，題目最花心思，鏡頭最快，收尾在最輕的一格。
// 不要改成依 category 字母排 —— 那會變成 frame/gather/prompt，鏡頭跑到最前面。
// 改動這個陣列會讓 test/ui-order.test.mjs 紅掉，那是刻意的。
const SLOT_ORDER = ["gather", "prompt", "frame"];
```

排序函式的兩條規則：

1. 在 `SLOT_ORDER` 裡的，依表中的位置排。
2. **不在表裡的排到最後，不丟掉。** 這條是關鍵：若哪天有人把 category 改名
   而忘了同步這張表，錯誤的表現必須是「順序不對」而不是「那一格從畫面上消失」。
   消失沒有任何東西會報錯，而學生會以為自己的章不見了。

排序在 `ui.js` 而不是 `data.js`：這是版面決定，不是儲存層的事。`data.js` 的
`.order("month").order("seq")` 一個字都不動。

### 2.3 不動資料庫

也可以把 seed 的 `seq` 改成 1/2/3 讓資料庫自己排對。**不做**，兩個理由：
一是那需要對正式資料庫下 SQL，而現在有人的章已經蓋在上面；二是那把版面順序
的真相來源放進資料庫，將來想調順序就得改資料而不是改程式。

順帶記錄一個巧合：現有 id 的尾碼 `A`/`B`/`C` 剛好就是 gather/prompt/frame，
所以現有資料照 id 排也會對。**不要因此改成按 id 排序** —— 那是巧合，不是契約，
新增活動的人沒有義務知道這件事。

---

## 3. 頁序模型 —— 頁碼只准有一個定義點

### 3.1 現況

書本的頁碼算術散在六個地方：

| 位置 | 現在寫的 |
|---|---|
| `ui.js` `bookHTML` 內容分支 | `S.page === 0 ? idPageHTML(S) : monthPageHTML(S, S.months[S.page - 1])` |
| `ui.js` `bookHTML` 圓點 | `data-p="${i + 1}"`、`aria-current="${S.page === i + 1}"` |
| `ui.js` `bookHTML` 下一頁 | `S.page === S.months.length` |
| `main.js` `next` | `Math.min(S.months.length, S.page + 1)` |
| `main.js` 鍵盤右 | `S.page < S.months.length` |
| `main.js` `prev`／鍵盤左 | `S.page > 0`（這兩個不受影響） |

在資料頁與九月之間插一頁，要同時改對這六處。漏一處就是 off-by-one，
而 off-by-one 的表現是「翻到某一頁顯示的是別的月份」，不會報錯。

### 3.2 改法

`ui.js` 匯出單一真相來源：

```js
// 書本的頁序。**頁碼只有這裡一個定義點**，dots／prev／next／鍵盤／bookHTML
// 一律問它，不准任何地方再自己算 page - 1 或 months.length。
// 之後要再插一頁（例如年度回顧），只改這個函式。
export function pagesOf(S) {
  return [
    { kind: "id",    label: "資料頁" },
    { kind: "guide", label: "怎麼用" },
    ...S.months.map(m => ({ kind: "month", month: m, label: MONTH_ZH[m.month] || String(m.month) }))
  ];
}
```

- `bookHTML` 依 `pages[S.page].kind` 分派到 `idPageHTML` / `guidePageHTML` / `monthPageHTML`。
- 圓點 `pages.map((p, i) => ...)`，`data-p="${i}"`，`aria-label` 取 `p.label`。
  `data-on` 只有 `kind === "month"` 才計算，資料頁與說明頁沒有「蓋滿」這個概念。
- 上一頁／下一頁與鍵盤的邊界改成 `pagesOf(S).length - 1`。

`S.page` 的語意不變（0 起算的頁索引），**但九月從 1 變成 2**。`S.page` 沒有被
持久化到任何地方（不進 localStorage、不進備份檔、不進網址），所以沒有相容性問題。

### 3.3 不受影響的地方

- 進度牆的 `.track` 是每個月一格（11 欄），跟書本頁碼無關，不動。
- `barHTML` 的 `Stamps collected N / 33` 數的是活動不是頁，不動。

---

## 4. 引導頁與說明頁

### 4.1 兩處，一份文案

- **A 引導頁**：第一次核發護照之後擋一次，看完就進護照，之後不再出現。
- **B 說明頁**：書本的固定第 1 頁（資料頁之後、九月之前），隨時翻得到。

兩處的三張卡是**同一份文案**，由 `ui.js` 的 `guideCardsHTML()` 產出，
兩邊各自包一層外框：

```
ui.js
 ├─ guideCardsHTML()   ← 唯一的文案來源
 ├─ introHTML()        → .card 包住它 + 一顆「開始蓋章」
 └─ guidePageHTML()    → 書本頁面包住它
```

三張卡的順序與月份頁同一條規則：**聚會 → 題目 → 鏡頭**，直接用 §2 的
`SLOT_ORDER` 產生，不另外寫死一次。

文案由使用者另外提供。實作時先放明顯的佔位字（`【待補】`），
**不要自己編一份看起來像成品的文案** —— 那會混進正式站而沒有人發現。

### 4.2 版面

三張卡沿用 `.slots` 三欄格線與 `.slot` 樣式（手機自動變一欄），不新增視覺元件，
符合原規格 §3.4。卡片是 `<div class="slot">` 不是 `<button>`：它不可點。

這裡跟 §1 有依賴關係：`.slot` 的虛線框在 §1 修好之前是隱形的，
而 `<div class="slot">` 不受那條 button reset 影響，**會顯示出來**。也就是說
不修 §1 的話，說明頁的三張卡有框、月份頁的三格沒框，同一套設計長成兩個樣子。
§1 修好之後兩邊一致。

說明頁的頁首沿用 `.mhead`：`.mzh` 放標題，右上角 `.mtheme` 不放東西。

`.mnum` **要放東西，不能留空** —— 少了左邊那個 76px 的字，`.mhead` 的重心會偏，
說明頁跟其他頁看起來不像同一本書。先建成問號 `?`：

```html
<div class="mnum">?</div>
```

選它的理由是不必新增任何資產，而且跟 `00`（資料頁）與 `01`–`12`（月份）
都不會混淆。**這是暫定值，建好之後要在瀏覽器上看一眼再定案**，另外兩個候選是
BT 的台灣圖形（`logo.png`，受原規格 §3.3 約束，不可改色、拉伸、旋轉或調透明度）
與 `00`（讀起來像「這是護照的說明」，代價是跟資料頁重複）。

實作時要讓這一格是**一行就能換掉**的，不要把它編織進版面計算裡。

### 4.3 `passports.intro_seen`

```sql
alter table passports add column if not exists intro_seen boolean not null default false;
```

放進 `supabase/migrations/2026-08-22-intro-seen.sql`，同時同步 `supabase/schema.sql`
的建表語句（schema.sql 是那張表的正式定義，兩邊不一致的話下一個從 schema.sql
建新環境的人會少一個欄位）。

RLS 不動：`passports_write` 是列層級的 `auth.uid() = id`，涵蓋新欄位；
`grant update on passports` 是表層級，不需要補欄位權限。

**要記錄的事實**：`passports_read` 是 `using (true)`，所以 `intro_seen` 對任何
登入者可讀。它是一個引導旗標，不是私密資料，可以接受。`loadWall` 只 select
指定欄位，不會把它帶到進度牆上。

### 4.4 流程與失敗行為

`main.js` 的 `render()` 在既有的「還沒填護照資料」那道閘之後加一道：

```
S.down → 未登入 → 沒有名字（setupHTML）→ intro_seen 為 false（introHTML）→ 護照
```

順序是刻意的：三張卡講的是護照裡的東西，先有護照再解釋它。

按下「開始蓋章」時樂觀更新（先 `S.profile.intro_seen = true` 再 `render()`），
背景寫入資料庫。**寫入失敗只寫 console，不跳 toast** —— 失敗的後果是下次登入
再看一次引導頁，那不值得用一句錯誤訊息去打斷一個剛核發完護照的人。

### 4.5 匯出、匯入、清除

- **不進備份檔**。`intro_seen` 是介面狀態不是護照內容，匯出的 `profile` 不帶它，
  `importPassport` 不碰它。跨帳號還原時，引導看過沒有是「這個帳號」的事。
- `clearAll` 逐欄列名把欄位設成 null，不會誤觸 `not null` 的新欄位。
- 清除護照之後 `intro_seen` 維持 `true`，不會再看一次引導。這是刻意的：
  清除的人不是新手。

### 4.6 既有使用者

migration 的 `default false` 會讓正式站上現有那本護照（使用者本人）也看到一次
引導頁。這是想要的行為 —— 剛好拿來驗收。

---

## 5. 月份主題換成時刻

### 5.1 資料

`months.theme_zh` 改放時間數字（例如 `07:00`），`theme_en` 改成空字串。
欄位型別與 `not null` 都不用動，空字串滿足 `not null`。

SQL 由使用者自己提供並執行，**時間點在 UI 做完之後**。所以實作期間資料庫裡
還是舊的主題字（「開學」「換季」…），畫面上會看到中文主題被放大到 34px。
那是預期中的過渡狀態，不是 bug —— 前端不認得內容是主題還是時刻，
也不該認得。驗收要等時刻進了資料庫才做。

**同一批值要同步三個地方**：正式資料庫、`supabase/seed.sql`、`activities.json`。
少同步 seed.sql 的話，下一個重跑 seed 的人會把時刻蓋回舊主題。

### 5.2 版面

右上角只留數字，英文副標整個拿掉：**`theme_en` 為空時不產生那個 `<span>`**。

**這條規則跟版面無關，不要用版面當理由。** 2026-08-22 實測 `.mtheme` 的高度：

| 寫法 | `.mtheme` 高度 |
|---|---|
| `<span>SEVEN AM</span>` | 62.50 |
| `<span></span>` | 42.50 |
| 完全不渲染 `<span>` | 42.50 |
| `<span> </span>`（一個半形空白） | 42.50 |
| `<span>\n</span>`（一個換行） | 42.50 |

後四者完全相同 —— 空的 inline 元素不產生行框，只含可折疊空白的行框也會被丟掉。
所以 `theme_en = ''` **不會**留下空高度，也不會把數字推歪。

保留這條判斷的真正理由是：DOM 裡留一個永遠是空的 `<span></span>`，
下一個人看到會以為是渲染壞掉然後去「修」它。把量測值記在這裡，
是為了讓那個人知道這不是版面問題，不必為了版面而改動它。

數字放大到 34px 並加 `font-variant-numeric:tabular-nums`。字體不用改：
`.mtheme b` 本來就是 `var(--display)`，也就是 Barlow Condensed，跟左邊 76px 的
月份數字同一套。

放大掛在月份頁專用的修飾 class 上：

```css
.mtheme.clock b{font-size:34px;font-variant-numeric:tabular-nums;letter-spacing:.02em}
```

**不可以直接改 `.mtheme b`** —— 資料頁的右上角共用同一個元件，那裡放的是
「BEYOND TAIWAN / Passport · 2026」，跟著變 34px 會撐爆版面。

修飾 class 不算原規格 §3.4 說的「新視覺元件」：沒有新顏色、新陰影、新形狀，
只是同一個元件的一個尺寸變體。

版面上不會出現「07:00 SEVEN AM」這種重複，因為英文那一行不存在。

---

## 6. 測試

### 6.1 為什麼可以用純 node

`src/ui.js` 實測可以在 node 24 直接 `import`（`node -e "import('./src/ui.js')"`
成功匯出全部 15 個函式），不需要 jsdom —— 它只從 `data.js` 取 `passportNo`，
而那條路徑上沒有任何東西在 module scope 碰 DOM。所以測試零相依，符合本專案
「沒有 build step，也不該有」的約束。**新增測試前先重跑一次那句 `node -e`**：
哪天 `ui.js` 開始 import 需要 DOM 的東西，這個前提就沒了。用 node 內建的 `node --test`，不引入任何 npm 套件。

新增 `test/` 目錄，並在 `check.sh` 末尾呼叫它，讓 `./check.sh` 一個指令跑完
靜態檢查與單元測試。`check.sh` 要先 `command -v node` 判斷，node 不在時
說清楚「跳過單元測試」而不是靜靜通過。

### 6.2 要釘住的事

| # | 釘住什麼 | 為什麼 |
|---|---|---|
| 1 | 餵亂序的三格進 `monthPageHTML`，輸出必定是 聚會 → 題目 → 鏡頭 | 使用者要的那一條 |
| 2 | `SLOT_ORDER` 的成員與 `CATNAME` 的鍵必須完全一致 | 有人加了 category 卻忘了排序表，這裡就紅 |
| 3 | **mutation 測試**：見 §6.3 | 改名的後果必須是順序不對，不是格子消失 |
| 4 | `pagesOf` 回傳 `[id, guide, ...11 個月]`，九月在索引 2 | 頁序模型的契約 |
| 5 | `bookHTML` 產出的圓點數 = `pagesOf().length` | 回報的那個 bug 在頁面模型這一層的守門員 |

第 2 條就是使用者要的「之後有人改 category 名稱不能讓順序跑掉」。

### 6.3 mutation 測試：格子不准靜靜消失

第 3 條要用 mutation 的形式寫，不是只斷言順序。理由是「格子消失」這個失敗模式
**不會報錯也不會變紅**，靠人眼在 33 格裡發現少了一格是不可靠的。

兩個 case：

1. **塞一個不存在的 category**。輸入四格：`gather`／`prompt`／`frame` 各一，
   外加一格 `category: "vlog"`。斷言輸出裡有 **4 個** `.slot`（不是 3 個），
   前三格順序是 聚會 → 題目 → 鏡頭，`vlog` 那格排在最後，
   且它的 `title_zh` 出現在輸出裡。
2. **把既有的 category 改名**。把 `frame` 改成 `frame_v2` 餵進去，
   斷言三格都還在、`frame_v2` 那格的標題出現在輸出裡。
   這模擬的正是使用者說的「之後有人改 category 名稱」。

第 2 個 case 順帶暴露另一件事：`CATNAME[a.category]` 對認不得的 category 會是
`undefined`，`slotHTML` 會印出字串 `"undefined"`。所以 `slotHTML` 要在
取不到名稱時退成空字串，測試一併斷言輸出裡不出現 `undefined`。

### 6.4 CSS 那條用 grep 釘

單元測試碰不到 CSS 級聯。在 `check.sh` 加一條：`index.html` 的按鈕 reset
必須寫成 `:where(#bt-root button)`。有人把 `:where()` 拿掉就 FAIL，
並在訊息裡說明理由，不讓下一個人以為那是多餘的括號。

---

## 7. 驗收

1. 月份頁底下有 **13** 顆圓點（資料頁 + 說明頁 + 11 個月），當前頁有外框，
   蓋滿的月份是橘色實心
2. 登入頁的主按鈕是深藍實心底、米白字；活動格子有虛線框且 hover 轉橘；
   分頁鍵選中時深藍底 —— 逐頁看過登入頁、申請頁、引導頁、資料頁、說明頁、
   月份頁、進度牆七個畫面
3. 任何一個月份頁，三格由左到右是 聚會 → 題目 → 鏡頭
4. 重新整理十次，三格順序不變
5. 新帳號：註冊 → 填資料 → 引導頁 → 護照；登出再登入不再出現引導頁
6. 書本第 1 頁是說明頁，第 2 頁是九月；左右鍵與上一頁/下一頁走得到頭尾且不越界
7. 月份頁右上角只有時間數字，沒有英文副標，沒有多出來的空行
    （這一條要等使用者把時刻的 SQL 跑進資料庫之後才驗）
7a. 說明頁的 `.mnum` 由使用者看過並定案（暫定 `?`，見 §4.2）
8. `./check.sh` 全數通過（含新增的單元測試與 `:where()` 檢查）
9. `prefers-reduced-motion: reduce` 下動畫仍然關閉（原規格 §11-17 不得回歸）
10. 全站色碼仍然只有三色（原規格 §11-14 不得回歸）

---

## 8. 這一輪不做的事

- 不改 `data.js` 的查詢排序，不改資料庫的 `seq`
- 不把說明頁的文案放進資料庫。它是介面說明不是活動內容，原規格 §5
  禁止寫死的是活動內容
- 不做「重看引導頁」的按鈕。說明頁就在書裡，隨時翻得到
- 不把 `S.page` 存進網址或 localStorage
- 不動進度牆的任何東西
