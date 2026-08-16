# BT Passport — 開發交接說明 / Build Brief

給接手開發的人（Claude Code 或工程夥伴）。讀完這份就能開工。

---

## 0. 一句話

Beyond Taiwan 內部幹部用的數位護照。學年制，9 月到隔年 7 月，每月三格活動，完成一格蓋一個章，年底得到一整本團隊回憶。

**使用者：** 約 30 位 BT 幹部，大多是台灣的高中生與大學生，部分在海外。
**不是給學員 (mentee) 用的。**

---

## 1. 現有素材

| 檔案 | 用途 |
|---|---|
| `BT-Passport.html` | **可運作的原型**。視覺與互動的權威參考，直接照這個做 |
| `activities.json` | 33 格活動資料，唯一來源 |
| `BT-Passport-規劃.md` | 團隊面的規劃書，含活動設計理由 |

原型跑在 Claude artifact 環境，用的是 `window.storage`。**正式版要把這層換成 Supabase**，其餘保留。

---

## 2. 技術規格

- **前端**：單一 HTML + 原生 JS，不要引入框架。目前 48KB，維護者是學生，保持可讀
- **後端**：Supabase（Postgres + Auth）免費方案
- **部署**：GitHub Pages 或 Netlify → `passport.beyondtaiwannpo.com`
- **登入**：email + 密碼，關閉信箱驗證。註冊時需輸入 BT 邀請碼
- **保活**：GitHub Actions 每日 ping 一次資料庫。免費方案閒置 7 天會暫停，而本站是月頻使用，一定會踩到
- **備份**：免費方案沒有自動備份。介面要有「匯出我的護照」按鈕（JSON + 照片打包）

---

## 3. 資料表

活動內容放在資料庫，**不要寫死在程式裡**。課程組要能在 Supabase 後台像編試算表一樣改文案，改完即時生效。

```sql
-- 活動定義（課程組維護）
create table activities (
  id          text primary key,          -- '09A'，穩定不變
  month       int  not null,             -- 1-12
  seq         int  not null,             -- 學年順序 1-11
  category    text not null check (category in ('gather','prompt','frame')),
  title_zh    text not null,
  title_en    text not null,
  description text,
  needs_host  boolean default false,
  active      boolean default true       -- 停用而不刪除
);

-- 護照持有人
create table passports (
  id       uuid primary key references auth.users on delete cascade,
  name_zh  text,
  name_en  text,
  team     text,
  motto    text,
  avatar   text,                         -- base64 jpeg
  issued   date default current_date,
  updated_at timestamptz default now()
);

-- 章（公開）
create table stamps (
  user_id    uuid references passports on delete cascade,
  act_id     text references activities,
  stamped_on date not null,
  created_at timestamptz default now(),
  primary key (user_id, act_id)
);

-- 心得與照片（私人）
create table entries (
  user_id uuid references passports on delete cascade,
  act_id  text references activities,
  note    text,
  photo   text,                          -- base64 jpeg，前端壓到 640px / q0.68
  primary key (user_id, act_id)
);
```

**RLS 政策**

| 表 | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| `activities` | 登入者皆可 | 無（後台維護） |
| `passports` | 登入者皆可，但**只回傳 name_zh / name_en / team**；avatar 與 motto 限本人 | 限本人 |
| `stamps` | 登入者皆可 | 限本人 |
| `entries` | **限本人** | 限本人 |

`entries` 的隔離是這個系統唯一真正重要的安全需求。心得和照片外洩會直接毀掉大家誠實書寫的意願，務必在資料庫層擋，不要靠前端隱藏。avatar 與 motto 若用 view 分離較麻煩，可接受全體可見 —— 但 **note 與 photo 絕對不行**。

---

## 4. 視覺規範 — 不可協商

這來自 Beyond Taiwan Brand Book 2026-27，不是建議。任何 UI 工具或設計外掛產出的東西都必須通過這三條：

1. **最多 3 種顏色**
   `#FFC46C` 主橘、`#EDE5D8` 米白、`#102A86` 深藍。
   需要深淺變化時**只能調透明度，不得新增顏色**。
   深藍是輔助色，只能用在文字、線條、印章框，**不得作為大面積背景**。

2. **最多 2 種字體**
   Barlow Condensed（標題、月份數字、印章）／ Inter（內文、護照欄位、機讀碼）。
   機讀碼用 Inter 搭 `tabular-nums` 與寬字距，**不要引入等寬字體**，那會變成第三種。

3. **一定要有 Beyond Taiwan logo**
   不可改色、拉伸、旋轉或調整透明度。原型已內嵌去背 PNG，直接沿用。

**常見會被退回的錯誤**：版面過度擁擠、裝飾元素過多、輔助色被當主色、加了漸層、加了第四種顏色當「強調色」。

如果覺得某個效果非加不可，先問 Marketing Director，不要自己決定。

---

## 5. 畫面清單

| # | 畫面 | 狀態 |
|---|---|---|
| 1 | 登入 / 註冊（含邀請碼） | **新做** |
| 2 | 申請護照（姓名、團隊、一句話） | 原型已有 |
| 3 | 資料頁：大頭照、護照號碼、核發日、機讀碼 | 原型已有 |
| 4 | 月份頁 × 11 | 原型已有 |
| 5 | 蓋章視窗：日期、心得、照片 | 原型已有 |
| 6 | 進度牆 | 原型已有，改接資料庫 |
| 7 | 年度回顧（7 月解鎖，可存成 1080×1360 圖） | **待確認要不要做** |
| 8 | 匯出備份 | **新做** |

### 要保留的互動細節

- 蓋章時的落章動畫：放大旋轉落下、輕微回彈、油墨毛邊（SVG turbulence filter）
- 每格的印章角度由 id 決定，固定不變，不要每次重整都跳
- 一個月三格蓋滿 → 該頁浮出斜向 `MONTH CLEARED` 疊印
- 聚會類用橘色墨，題目與鏡頭類用深藍墨
- 鍵盤左右鍵翻頁、Esc 關視窗、`prefers-reduced-motion` 要關掉動畫

---

## 6. 已知的坑

1. **Supabase 免費方案 7 天閒置會暫停。** 資料不會不見，但網站會空白直到有人手動恢復。必須設每日 ping
2. **免費方案沒有備份。** 匯出功能不是加分項，是必要的
3. **照片存 base64 進 Postgres**。33 格 × 30 人 × 約 50KB ≈ 50MB，在 500MB 額度內。若之後要放寬，改用 Supabase Storage
4. **anon key 會出現在前端原始碼，這是正常的**，真正的防線是 RLS。要跟團隊解釋，免得有人以為金鑰外洩
5. **不要刪除已有人蓋過的活動**，改 `active = false`

---

## 7. 交接與延續

明年會換一批幹部。GitHub、Supabase、網域三個帳號都要掛在組織 email（`beyondtaiwan2020@gmail.com`）之下，不要用個人帳號，否則明年交接會斷。

README 要寫給非工程背景的接手者看：怎麼改活動文案、怎麼發邀請碼、怎麼在後台恢復被暫停的專案。

---

*活動內容為草案，未經 Marketing Director 與 President / VP 確認前不得對外公布。*
