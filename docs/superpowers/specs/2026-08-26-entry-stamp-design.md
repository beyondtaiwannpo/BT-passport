# 入境章與 Frame 改版

**日期：** 2026-08-26
**範圍：** 資料庫文案（使用者貼 SQL，**已完成**）＋ 程式改動
**不在範圍：** Gather 的十一格內容與說明，之後另外處理

---

## 零、英文化的範圍

**只有題目與說明改英文。** `activities` 的 `title_zh` / `description`、`milestones` 的文案。

**介面文字全部留中文**：蓋章、前一頁、下一頁、我的護照、進度牆、登出、編輯資料、
匯出備份、匯入還原、清除這本護照，以及資料頁的 `PASSPORT NO. / 護照號碼` 這類雙語標籤。

理由：幹部裡有還在唸高中的成員，介面用中文比較順；題目與說明改英文是因為多數幹部
在海外，而且這些內容會被拿去做成年末的展示素材。

---

## 一、Frame 十一格

「一天」的框架已廢除。新的十一格是**你每天路過但從來沒看過的東西**，
三十個人拍同一樣東西，六個國家的差別會自己跑出來。

| id | 月 | 標題 | 說明 |
|---|---|---|---|
| `09C` | 09 | **The Moon** | It's Mid-Autumn. Thirty of us in six countries, looking at the exact same moon. Shoot it however it looks from where you are. |
| `10C` | 10 | **A Bus Stop** | The one you wait at most. The sign, the shelter, the route map — any of it counts. |
| `11C` | 11 | **A Sunset** | The month it gets dark earliest. Walk out at five and it's already happening. |
| `12C` | 12 | **A Christmas Tree** | Street corner, department store, or the sad plastic one in your dorm. All of them count. |
| `01C` | 01 | **A Street Lamp** | Longest nights of the year. Find one that's on. |
| `02C` | 02 | **A Dinner Table** | Lunar New Year. Some of us are at a family reunion, some are eating alone abroad. Same prompt, very different photos. |
| `03C` | 03 | **A Bench** | Roadside, campus, park. You don't have to sit on it. |
| `04C` | 04 | **The Sky** | Spring. Just look up. |
| `05C` | 05 | **A Street View** | Walk outside and shoot where you live. |
| `06C` | 06 | **A Manhole Cover** | Look down. You step over it dozens of times a day and have never once looked at it. |
| `07C` | 07 | **A Convex Mirror** | The round mirror at a blind corner. You'll be in it — the last photo of the year is you. |

**排序的依據**：三格綁節慶（09 中秋、12 聖誕、02 春節），其餘照氣候與光線排。
七月的凸面鏡是刻意收尾——**那是唯一一張你會入鏡的照片。**

---

## 二、月份主題留空

`months` 的 `theme_zh` / `theme_en` 全部清空。右上角那個位置空著。

前端已經處理過 `theme_en` 為空字串不渲染。**`theme_zh` 也為空時，
整個 `.mtheme` 元素不要渲染**，不要留下空的高度把版面推歪。

資料頁右上角的「BEYOND TAIWAN / Passport · 2026」不受影響，那不是月份主題。

---

## 三、入境章

`MONTH CLEARED` 改成**城市代碼的入境章**。一個月蓋滿三格，那個月就得到一枚章。

### 為什麼

現在的 `MONTH CLEARED` 說的是「你完成了」。改成城市代碼之後說的是**「你到過那裡」**
——而那二十四個城市真的都有 BT 的人。一年下來護照上有十一個城市的章。

### 章的樣子

```
┌─────────────────┐
│   IMMIGRATION   │
│    T A I P E I  │
│       TPE       │
│    2026.09.30   │
└─────────────────┘
```

- 沿用現有 `.overprint` 的位置與斜角
- 單色，不新增顏色。城市名字距拉開
- 日期是該月**最後一格被蓋的日期**
- 手機的尺寸與位置沿用現有的 13px / `top:26px`

### 二十四個目的地

`destinations` 表：TPE TAIPEI／LAX LOS ANGELES／JFK NEW YORK／BNA NASHVILLE／
MSN MADISON／SFO SAN FRANCISCO／SEA SEATTLE／ORD CHICAGO／BOS BOSTON／
BWI BALTIMORE／PHL PHILADELPHIA／SAN SAN DIEGO／ROC ROCHESTER／IND INDIANAPOLIS／
CLT CHARLOTTE／SLC SALT LAKE CITY／YVR VANCOUVER／YYZ TORONTO／BRU BRUSSELS／
AMS AMSTERDAM／LHR LONDON／NRT TOKYO／ICN SEOUL／SYD SYDNEY

### 分配規則

**`TPE` 固定給九月**（第一格）。每個人的護照都從台灣出發，然後散到十個不同的地方。

**其餘十格從剩下的二十三個抽**，用 `auth.uid()` 當種子洗牌，取前十個。

三個要求：

1. **同一個人重整幾次結果都一樣。** 用 uuid 當種子，不要真的隨機
   ——這個系統已經有一模一樣的機制（章的旋轉角度用 id 算）。
2. **同一個人的十一格不重複。** 洗牌取前十，不是每格獨立抽。
3. **不同人的組合不同。** 三十個人不會有兩本一樣的護照。

洗牌邏輯放在 `ui.js` 的純函式，跟 `faceOf`、`pagesOf`、`milestoneState` 同一個原則，
只有一個定義點。

### 三件不能掉的既有行為

1. **空集合的守衛** — 沒有活動的月份不該被判定成蓋滿（`.every()` 那個 bug class，已經發生過三次）
2. **reduced-motion** — 新的章如果有落下動畫，必須進 reduce 區塊。第 25 項通用檢查會抓
3. **手機尺寸** — 13px / `top:26px`，不要壓到月名

---

## 四、說明頁第三張卡

現在的文案是舊的「一天」概念，要換掉。

**標題：** 鏡頭 FRAME
**內文：**

> 一個月一張照片。月亮、水溝蓋、公車站——你每天路過但從來沒看過的東西。三十個人拍同一樣東西，六個國家的差別會自己跑出來。

另外兩張卡不動。三張卡的第一句仍然要對齊（一個月一次／一題／一張）。

---

## 五、撕掉章的動畫

現在按「撕掉這格」章直接消失。改成**紙被撕開**：

1. 章從中間出現一道不規則的裂口
2. 兩半各自往下掉、略微旋轉、淡出
3. 留下空的格子，翻回未蓋章的正面

大約 500ms。裂口用 SVG `clip-path` 的鋸齒路徑，兩半用不同的旋轉方向。

**三件要處理的：**

- **`prefers-reduced-motion` 要關掉**，直接切換成空格子。第 25 項會抓
- **動畫播完才真的刪資料**，不要先刪再演——刪除失敗的話畫面要能還原
- **確認刪除的對話框不變**，那是不可復原的操作

---

## 六、SQL

**狀態：使用者已於 2026-08-26 執行完畢。** 控制端實測確認：
`destinations` 24 筆（全部 active）／還有主題的月份 0／還有中文的鏡頭格 0。
遷移檔留在 `supabase/migrations/2026-08-26-destinations.sql`。

---

## 七、順序

1. 貼 SQL（**已完成**）
2. 入境章
3. 說明頁第三卡
4. 撕掉的動畫

---

## 八、還沒處理的

**Gather 十一格的內容與說明**——之後另外給。現在那十一格仍是中文，這一輪不動。

---

## 九、實作前的發現與裁定（控制端，2026-08-26）

### 9.1 §二 不緊急 —— 控制端先推測「正式站正在壞」，量完發現是錯的

**先寫下錯的那個判斷**：SQL 已經跑了、`months.theme_zh` 全空，而 `monthPageHTML`
仍然無條件輸出 `<div class="mtheme clock"><b></b></div>`。我據此推測正式站每個月份頁
右上角掛著一塊空白、把 `.mhead` 撐高，並打算比照 2026-08-25 里程碑那次立刻單獨推。

**量完是這樣**（1280px，`devicePixelRatio` 2）：

| 月份頁 | `.mtheme` 高 | `.mhead` 高 |
|---|---|---|
| 有主題 `07:00` | 42.50 | 71.27 |
| `theme_zh` 空字串（正式站現況） | **0** | 71.27 |
| 完全不渲染 `.mtheme` | — | 71.27 |

`.mhead` 是 flex row，高度由 `.mzh` 決定，`.mtheme` 從來沒有參與過。而空的 `<b>`
是空的 inline 元素，不產生行框，所以高度是 0 不是 42.50 —— `ui.js` 那段
2026-08-22 的註解（「空的 inline 元素不產生行框」）本來就講過這件事，
是我沒有照它推到底就先當成緊急事故。

**所以 §二 沒有在傷害使用者，不需要插隊單獨推。** 它仍然要做，理由是 `ui.js`
那段註解自己給的那一條：不要在 DOM 裡留一個永遠是空的元素，
下一個人看到會以為渲染壞了然後去「修」它。

### 9.2 入境章是新的視覺元件 —— §3.4 的第二個例外

原規格 §3.4 說「新增的畫面不引入任何新的視覺元件」。2026-08-25 翻面卡拿到第一個
例外，而那份規格明寫「**這個例外只涵蓋翻面卡本身，不是『以後可以自由新增元件』
的先例**」。所以這裡要記一次獨立的例外。

**為什麼不能沿用 `.overprint`**：`.overprint` 是一行文字的疊印，同時還在資料頁
被 `FULL` 用（`idPageHTML`）。入境章是四行的框，字級與行距都不同。改 `.overprint`
會連帶改到 `FULL`。所以新增 `.estamp`，但**位置、斜角、`filter:url(#bt-ink)`、
`pointer-events:none` 全部沿用 `.overprint` 的值**，視覺語彙不新增。

### 9.3 幾何要重量，但理由不是 `.mtheme`

`index.html` 的 `.overprint{top:60px}` 旁邊寫著：

> 之後如果調整 `.mhead` 的高度、`.slot` 的 padding 或 `.cat` 的字級，
> **要回來重量這個距離** —— 它是兩個獨立絕對定位/旋轉元素的幾何關係，
> 沒有任何測試守得住。

我一開始以為 §二 拿掉 `.mtheme` 就是「調整 `.mhead` 的高度」。**§9.1 的量測否定了這件事**
—— `.mhead` 在三種情況下都是 71.27。

**真正要重量的理由是章本身變高了。** `MONTH CLEARED` 是一行文字；入境章是四行的框，
旋轉 -11 度之後左下角會往下伸得更遠。那條註解的重點是「疊印**不可以**切到活動格子裡的
任何東西」，而原本 `top:70px` 就曾經切掉第三格 `.cat` 的上半（實測重疊
251.0×5.2px）才改成 60px。四行的框在同一個 `top` 一定更容易碰到。

所以桌機與手機兩個 `top` 都要重新量，量測附 `window.innerWidth` 與 `devicePixelRatio`
自證，並且要明確回報「章的最低點」與「第三格 `.cat` 的最高點」相差幾 px。

### 9.4 `destinations` 讀取失敗要整批擋下來，不套用 milestones 的例外

`data.js` 的 `firstError` 註解寫得很清楚：

> 這個例外只准套用在 milestones 一個查詢上，不要把它當成「以後新增查詢都不用加進
> `firstError`」的先例。

milestones 讀不到的表現是「沒有里程碑 UI」，不會讓人誤以為紀錄不見了。
**`destinations` 不一樣**：讀不到的話，一個蓋滿三格的月份會什麼章都沒有 ——
那跟「你還沒蓋滿」長得一模一樣，正是那條註解要防的誤導。

裁定：`destinations` 進 `firstError`。README 第 9 項（防呆不准用來遮蔽載入失敗）
的直接應用。

### 9.5 洗牌的種子用 `S.profile.id`，池子一旦動過所有人的護照都會重洗

`passports.id` 就是 `auth.uid()`（uuid），而 `ui.js` 已經在用它算護照號碼
（`passportNo(p.id)`）。所以純函式不需要 `S.user`，直接吃 `S.profile.id`。

**代價要寫下來**：種子洗牌的結果依賴池子的內容。之後只要新增、刪除或停用任何一個
destination，**每個人剩下十格的城市都會重排** —— 包含已經蓋過章的月份。
使用者九月看到 TOKYO、明年三月回去看變成 LONDON。

規格明定用洗牌，所以照做，但要在 README 記一條「`destinations` 上線後不准增刪」，
跟既有的「不要刪活動」同一節。

### 9.6 入境章的日期取三格 `stamped_on` 的最大值

規格寫「該月最後一格被蓋的日期」。`stamps` 有 `created_at`，但 `data.js` 攤平時
只保留 `stamped_on`（`{date: r.stamped_on}`），而使用者可以自己改日期。

裁定：取三格 `date` 的**最大值**。理由是那是使用者認得的日期，而且它從現有的
`S.stamps` 就算得出來，不需要改資料層。「插入順序」既沒有進前端，也不是使用者
看得懂的東西。

### 9.7 §五 的「動畫播完才刪」不可以用 JS 計時器，也不可以只用 `animationend`

`index.html` 已經有一條裁定：不要用 JS 計時器串接動畫，因為計時器會跟下一次
`render()` 競態。所以這裡用 `animationend`（元素被換掉時事件自然不觸發）。

**但 `animationend` 單獨用會踩到一個死路**：reduce 開啟時 `animation:none`，
事件**永遠不會觸發** —— 章會卡在畫面上，資料永遠不刪。

裁定：reduce 的路徑不走動畫，按下去直接刪。用
`window.matchMedia("(prefers-reduced-motion: reduce)").matches` 分岔，
兩條路徑共用同一個「真的執行刪除」的函式，只有一個定義點。

### 9.8 現有的 unstamp 已經有一個缺陷，這一輪順便修掉

`main.js` 現在是樂觀更新：先 `delete S.stamps[id]`、`render()`、再打 API，
失敗只 `toast("沒有存起來，再試一次。")` —— **state 沒有補回來**。
使用者看到章不見了、跳出一句錯誤，重整之後章又回來了。

§五 明寫「刪除失敗的話畫面要能還原」，所以這一輪一起修。
