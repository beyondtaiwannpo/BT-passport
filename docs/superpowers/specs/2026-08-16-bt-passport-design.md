# BT Passport — 設計規格

2026-08-16 定稿。上游文件為 `HANDOFF.md`；本文是它的實作決議版，兩者衝突時以本文為準。

---

## 1. 這是什麼

Beyond Taiwan 內部幹部用的數位護照。學年制，9 月到隔年 7 月，11 個月 33 格。完成一格蓋一個章。

使用者約 30 位 BT 幹部，多為高中生與大學生，部分在海外。**不是給學員 (mentee) 用的。**

現有的 `BT-Passport.html` 是可運作的原型，跑在 Claude artifact 環境，用 `window.storage` 存資料。本專案把儲存層換成 Supabase，視覺與互動照原型實作。

---

## 2. 範圍

**做**

1. 登入 / 註冊（含邀請碼）
2. 申請護照（姓名、團隊、一句話）
3. 資料頁（大頭照、護照號碼、核發日、機讀碼）
4. 月份頁 × 11
5. 蓋章視窗（日期、心得、照片）
6. 進度牆（改接資料庫）
7. 匯出備份 **與匯入還原**
8. 部署設定、保活、README

**不做**

年度回顧（HANDOFF 畫面 #7）。資料層預留：`entries` 保存全年心得，`activities.callback_to` 欄位保留，之後補一頁即可，不需要改資料表。

---

## 3. 視覺規範

`HANDOFF.md` 第 4 節是硬規則，來自 Beyond Taiwan Brand Book 2026-27。每個畫面都必須通過這三條。

### 3.1 最多 3 種顏色

`#FFC46C` 主橘、`#EDE5D8` 米白、`#102A86` 深藍。需要深淺變化時只能調透明度，一律用 `rgba(16,42,134,α)`。深藍是輔助色，只能用在文字、線條、印章框，不得作為大面積背景。

**原型的違規要修掉。** 原型定義了 `#E09A2E`（`.ink-orange` 與 `.overprint`），這是第四種顏色，而且不可能由 `#FFC46C` 調透明度得到 —— 主橘疊在米白紙上只會更淡，不會更濃。

改法：**聚會章與 `MONTH CLEARED` 疊印一律改為 `#FFC46C` 填底 + `#102A86` 文字與框線。** 兩者必須用同一套處理，視覺上才是同一個印章系統。題目類與鏡頭類的深藍章維持線框不變。

改完全站只有三色。

### 3.2 最多 2 種字體

Barlow Condensed（標題、月份數字、印章）／ Inter（內文、護照欄位、機讀碼）。

機讀碼用 Inter 搭 `tabular-nums` 與寬字距，不引入等寬字體。

**中文字體**：Barlow Condensed 與 Inter 都沒有中文字符，中文必然掉到系統 CJK 字體。字體堆疊保留 `"Noto Sans TC"` 作為 fallback 名稱，**但不載入任何中文網頁字體** —— 不加 `@font-face`，不加 Google Fonts 的中文請求。此判斷已送 Marketing Director 確認，在回覆前照此實作。

### 3.3 一定要有 Beyond Taiwan logo

不可改色、拉伸、旋轉或調整透明度。從原型的 base64 還原成 `logo.png`，尺寸比例不動。

### 3.4 新畫面的約束

新增的畫面（登入／註冊、匯出匯入）不引入任何新的視覺元件，一律沿用原型既有的 `.card` / `.btn` / `label` / `.wnote` 樣式。不加漸層、不加陰影（`.toast` 既有的除外）、不加第四色當強調色。

---

## 4. 技術與檔案結構

前端原生 JS，ES module，零建置。後端 Supabase 免費方案（Postgres + Auth）。

```
index.html              骨架 + <style>（樣式照搬原型，僅改印章墨色）
logo.png                從原型 base64 還原
CNAME                   passport.beyondtaiwannpo.com
activities.json         seed 資料來源，保留在 repo
src/data.js             Supabase 存取、匯出、匯入
src/ui.js               所有畫面的 HTML 產生
src/main.js             事件、路由、啟動
supabase/schema.sql     資料表、RLS、trigger、seed
.github/workflows/ping.yml
README.md
docs/superpowers/specs/  本文件
```

### 4.1 前端金鑰

前端用 **publishable key**（`sb_publishable_…`），**不用舊的 anon key**。

兩者在前端扮演的角色相同 —— 都是可以公開的識別金鑰，真正的防線都是 RLS。差別在 publishable key 是 Supabase 現行的金鑰制度，能單獨撤銷與輪替；anon key 是舊制 JWT，與 service_role 綁在同一組 JWT secret，屬於正在被淘汰的路徑。新專案沒有理由再用舊的。

- 取得位置：Supabase 後台 Project Settings → API Keys
- publishable key 出現在前端原始碼**是正常的**，不是外洩。README 要向團隊解釋這件事
- **secret key（`sb_secret_…`）絕對不可以出現在前端、repo 或任何截圖裡。** 它繞過 RLS，拿到就等於拿到所有人的心得與照片。這是這個專案唯一一條會真的出事的金鑰規則
- 專案裡不需要 secret key。任何時候覺得「好像要用 secret key 才做得到」，那是 RLS policy 寫錯了，回去改 policy

---

## 5. 資料表

`HANDOFF.md` 第 3 節的 schema 為基礎，補兩張表。

```sql
-- 月份主題（HANDOFF 漏了這張，但月份頁大標題需要）
create table months (
  seq      int primary key,          -- 學年順序 1-11
  month    int not null,             -- 1-12
  theme_zh text not null,
  theme_en text not null
);

-- 活動定義（課程組維護）
create table activities (
  id          text primary key,      -- '09A'，穩定不變
  month       int  not null,
  seq         int  not null,
  category    text not null check (category in ('gather','prompt','frame')),
  title_zh    text not null,
  title_en    text not null,
  description text,
  needs_host  boolean default false,
  callback_to text references activities,   -- 07B → 09B
  active      boolean default true   -- 停用而不刪除
);

-- 邀請碼
create table invite_codes (
  code      text primary key,
  uses_left int not null default 1,
  note      text,                    -- 發給誰，人看的
  created_at timestamptz default now()
);

-- 護照持有人
create table passports (
  id         uuid primary key references auth.users on delete cascade,
  name_zh    text,
  name_en    text,
  team       text,
  motto      text,
  avatar     text,                   -- base64 jpeg
  issued     date default current_date,
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
  photo   text,                      -- base64 jpeg，前端壓到 640px / q0.68
  primary key (user_id, act_id)
);
```

活動內容放資料庫，**不要寫死在程式裡**。課程組要能在 Supabase 後台像編試算表一樣改文案，改完即時生效。`activities.json` 只用來初次灌資料。

**不要刪除已有人蓋過的活動**，改 `active = false`。

### 5.1 RLS

| 表 | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| `months` `activities` | 登入者皆可 | 無（後台維護） |
| `invite_codes` | **無人** | 無 |
| `passports` | 登入者皆可（全欄位） | 限本人 |
| `stamps` | 登入者皆可 | 限本人 |
| `entries` | **限本人** | 限本人 |

`passports` 走全欄位可見。HANDOFF 原本寫「只回傳 name_zh / name_en / team」，但 Postgres 的 RLS 是 row-level，做不到欄位過濾；要做得另開 view，成本不值得。HANDOFF 第 97 行已留此退路。

**`entries` 的隔離是這個系統唯一真正重要的安全需求。** 心得和照片外洩會直接毀掉大家誠實書寫的意願。必須在資料庫層擋，不得靠前端隱藏。

`invite_codes` 對所有角色關閉，只有 `security definer` 的 trigger 讀得到。

`passports` 的那一列由註冊 trigger 預先建立（見 §6），所以「申請護照」畫面送出的是 `update` 而非 `insert`。UPDATE 政策必須限定 `auth.uid() = id`。

---

## 6. 註冊與邀請碼

Supabase Auth 沒有內建邀請碼機制，免費方案也不用 Edge Function。用 **DB trigger 擋在註冊交易裡**：邀請碼隨 `signUp` 的 metadata 送出，trigger 驗證，無效就 `raise`，整筆註冊回滾。這是免費方案能做到的最強防線，繞不過去。

```sql
create function handle_new_user()
returns trigger
language plpgsql security definer as $$
declare v_code text := new.raw_user_meta_data->>'invite';
begin
  update invite_codes set uses_left = uses_left - 1
   where code = v_code and uses_left > 0;
  if not found then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;
  insert into passports(id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```

用 `update ... where uses_left > 0` 搭配 `if not found` 一次完成檢查與扣減，避免兩人同時用同一組最後一次的碼。

登入方式為 email + 密碼，**關閉信箱驗證**。

### 6.1 錯誤文案

trigger `raise` 之後 Supabase 回的是通用的 500「Database error saving new user」。**絕對不能把原始錯誤丟給高中生看。** 前端一律翻譯：

| 情況 | 畫面文案 |
|---|---|
| 邀請碼無效或用完 | 這個邀請碼不對，或是已經被用完了。跟你的組長要一組新的。 |
| email 已註冊 | 這個 email 已經有護照了，直接登入就好。 |
| email 格式不對 | 這個 email 看起來不太對，檢查一下有沒有打錯。 |
| 密碼太短 | 密碼至少要 6 個字。 |
| 連不上資料庫 | 現在連不上資料庫。請寄信到 beyondtaiwan2020@gmail.com，資料都還在。 |
| 其他未預期錯誤 | 出了點狀況，再試一次。還是不行的話寄信到 beyondtaiwan2020@gmail.com。 |

**判斷方式必須實測決定，不得照預期的錯誤字串寫。** trigger `raise` 之後 Supabase 回給前端的是籠統的資料庫錯誤，不會是 `invalid_invite`；實際的 `status` / `code` / `message` 只有真的註冊失敗一次才知道，而且會隨 GoTrue 版本改變。實作時先用四個情境各打一次 `signUp`，把原始回應記下來，判斷式依實測寫。

目前的假設（**待實測驗證，不符就更新本節**）：signUp 回傳 500 且非下述已知情況 → 視為邀請碼問題（這是唯一會讓 signUp 拋 500 的路徑）；密碼長度由 GoTrue 以 4xx 回報。email 重複則有兩種可能形狀 —— 4xx 錯誤，或在「防止帳號列舉」開啟時回 200 且 `data.user.identities` 為空陣列，兩者都要處理。

「email 格式不對」這一句**刻意不附組織信箱**。這是使用者自己就能修好的問題，附上信箱會把一個打錯字的狀況升級成寄信求助。其餘各句維持導向信箱的原則。

判斷條件（2026-08-17 實測，`code` 為機器可讀值，不靠字串猜測）：

| 情況 | 觀察到的形狀 |
|---|---|
| 邀請碼無效 | `status 500`、`code: null`、`message: "Database error saving new user"` |
| 密碼太短 | `status 422`、`code: "weak_password"`、`reasons: ["length"]` |
| email 格式不對 | `status 400`、`code: "validation_failed"`、message 含 `validate email` |

「邀請碼已用完」未在前端直接觀察到，是從資料庫層推論的：`rls-test.sql` 的 §11-5 證明 trigger 對「無效」與「已用完」丟出同一個 P0001，所以 GoTrue 應回同一個 500。註解須據實標示為推論。

任何錯誤訊息都**不得出現個人姓名或個人聯絡方式**，一律導向 `beyondtaiwan2020@gmail.com`。

### 6.2 註冊頁的告知

註冊頁要明白寫出哪些東西其他幹部看得到，特別是大頭照 —— 使用者包含未成年幹部，這件事不能藏在小字裡：

> 送出後，你的姓名、團隊、大頭照與蓋章紀錄會出現在全體進度牆上，**其他 BT 幹部看得到，包含你的大頭照**。你寫的心得和上傳的活動照片只留在你自己的護照裡，**其他幹部看不到**。

同一句話在資料頁**點擊上傳大頭照的當下**要再出現一次。註冊時看過不等於上傳時記得。

措辭是「其他幹部看不到」，**不是「沒有別人看得到」**。維護資料庫的管理者從 Supabase 後台技術上讀得到所有資料 —— 這是專案擁有者的固有權限，任何架構都一樣，不是這個設計新增的。對未成年使用者做出比實際更強的保密承諾是不對的，所以句子只承諾做得到的那一半。

管理者的自律規範寫在 README（見 §9.2）：**不因好奇翻閱他人的 `entries`**，只有在使用者主動求助（例如誤刪需要救回）時才進去，且事先告知本人。

---

### 6.3 邀請碼在什麼情況下會被消耗

**失敗的註冊不會消耗邀請碼。** 以下為 2026-08-17 在正式專案實測的結果，不是推論：

| 情況 | 邀請碼 | 依據 |
|---|---|---|
| 註冊成功 | **消耗 1 次** | 實測：`TEST-ONCE` 由 `uses_left = 1` 變 `0` |
| email 已註冊，註冊失敗 | **不消耗** | 實測：`TEST-DUP` 送出後仍為 `uses_left = 1` |
| 邀請碼本身無效 | 不消耗 | 由 trigger 的 `update … where code = v_code and uses_left > 0` 推得：不存在的碼對不到任何一列 |
| 邀請碼已用完 | 不消耗 | 同上，`uses_left > 0` 的條件擋掉 |

機制上這是 trigger 跑在註冊那筆交易裡的必然結果：扣減之後若交易的任何一步失敗，扣減會跟著回滾。§6 的併發測試也驗證過 `uses_left` 不會變成負數。

**對發碼的實務影響：** 一組碼配一個人、`uses_left = 1` 就夠了，**不需要為了怕學生打錯而多發備用碼**。學生用同一組碼重試不會把它燒掉；真正會用掉它的只有「註冊成功」這一件事。若有人回報「碼不能用了」，先查 `uses_left` —— 是 0 就代表那組碼真的被人成功註冊過，不是被失敗的嘗試耗掉的。

### 6.4 忘記密碼

**不做自助重設，也不寄任何信。**

Supabase 免費方案的內建寄信服務速率限制嚴格，且預設只寄得到團隊成員的信箱，對 30 位外部幹部不可靠。**送不到的重設信比沒有這個功能更糟** —— 使用者會以為信在路上，一直空等。自架 SMTP 可以解決，但那是多一個外部服務、多一組明年要交接的金鑰，為一年幾次的重設不值得。

改由管理者代處理：

1. 登入頁放一行提示，沿用既有 `.wnote` 樣式，**不新增任何視覺元件**：

   > 忘記密碼？寄信到 beyondtaiwan2020@gmail.com，我們會幫你重設。你的資料都還在。

2. 管理者在 Supabase 後台直接設一組新密碼，私下告知本人。實際點擊路徑寫在 README（見 §9.2）

實作上的界線：

- 前端**不呼叫** `resetPasswordForEmail`，**不做**重設密碼畫面，**不做**應用內修改密碼
- 管理者代設的密碼即為新密碼，不要求使用者登入後再改一次 —— 沒有應用內改密碼功能，要求也做不到。管理者設完應立即銷毀手上的記錄
- 提示文字不得出現個人姓名或個人信箱，一律導向 `beyondtaiwan2020@gmail.com`（與 §6.1、§8.1 同一原則）

---

## 7. 畫面

### 7.1 沿用原型、只換儲存層

資料頁、月份頁 ×11、蓋章視窗、進度牆的版面與互動照原型實作。

**必須保留的互動細節**

- 落章動畫：放大旋轉落下、輕微回彈、油墨毛邊（SVG turbulence filter）
- 每格的印章角度由 `id` 決定，固定不變，不因重整而跳動
- 一個月三格蓋滿 → 該頁浮出斜向 `MONTH CLEARED` 疊印
- 聚會類用橘章，題目與鏡頭類用深藍章
- 鍵盤左右鍵翻頁、Esc 關視窗、`prefers-reduced-motion` 關掉動畫

### 7.2 儲存層對照

原型的 `sget` / `sset` / `slist` 是乾淨的接縫，換掉即可。

| 原型 | 正式版 |
|---|---|
| `sget(KEY)` → profile + stamps | `passports` + `stamps` + `entries` 三個 query |
| `sset(PKEY(id))` → 照片 | `entries.photo`，一樣壓 640px / q0.68 |
| `pushWall()` → shared blob | 刪除。進度牆改為 `stamps` join `passports` 直接查 |
| `slist("wall:", true)` | 刪除 |
| `passportNo(S.profile.id)` 吃 random id | 改吃 auth uuid，護照號碼從此穩定不變 |

### 7.3 07B 的回望

`07B`「現在還算數嗎」的全部意義就是回頭看九月寫的東西。打開這格時，**必須把該使用者 `09B` 的內容直接顯示在題目上方**，不能要求使用者自己翻回九月。

- 資料來源：`entries.note` where `act_id = activities.callback_to`
- 日期取 `stamps.stamped_on`（`entries` 本身沒有日期欄位）
- 呈現：題目上方一個引用區塊，標明「你在九月寫的」與當時的日期
- `09B` 沒寫過時：顯示「你九月沒有寫這格」，題目照常可作答，不阻擋

此機制由 `activities.callback_to` 驅動，不寫死 `07B`。未來任何一格設了 `callback_to` 都會自動有這個行為。

### 7.4 匯出與匯入

免費方案沒有自動備份，所以這不是加分項，是必要的。

**匯出**：單一 JSON 檔，零依賴，不需要 zip 函式庫。內容為 profile + 33 格的章 + 心得 + 照片 base64 + 大頭照，全部含在一個檔案裡。檔名 `bt-passport-<護照號碼>-<日期>.json`。

**匯入還原**：把匯出檔拖回來（或用檔案選擇）要能重建整本護照。**不能還原的備份不算備份。**

- 寫入目前登入的帳號，不是檔案裡記的那個 uuid —— 換帳號也要能還原
- 匯入前顯示摘要：這個檔案有幾個章、哪個日期匯出的
- 目前護照已有內容時，明確詢問是覆蓋還是合併；預設覆蓋，並說清楚會蓋掉什麼
- 檔案格式不對時給人話，不丟 JSON parse 錯誤
- 匯出檔含 `version` 欄位，供日後格式變更判斷

---

## 8. 部署

**GitHub Pages 從 `main` 分支的根目錄發布**，不用 Actions 建置（本專案沒有建置步驟，多一層只會多一個壞掉的地方）。

- `CNAME` 檔放 repo 根目錄，內容 `passport.beyondtaiwannpo.com`，**不可刪除**
- 若日後改用 Actions 部署，**輸出目錄必須含 CNAME**，否則自訂網域會掉
- `index.html` 與 `src/` 在 repo 根目錄。Pages 不從 `/docs` 發布，該目錄留給規格文件

### 8.1 保活

Supabase 免費方案閒置 7 天會暫停。資料不會不見，但網站會空白直到有人手動恢復。本站是月頻使用，一定會踩到。

`.github/workflows/ping.yml`：每日 cron，對 `activities` 做一次 count 查詢。

**另外，DB 連不上時前端不得空白。** 顯示：

> 資料庫休眠中，你的資料都還在。請寄信到 beyondtaiwan2020@gmail.com 請人恢復。

不放任何個人姓名或個人聯絡方式。

---

## 9. README

寫給**非工程背景的接手者**，不是寫給工程師。至少包含：

1. 這是什麼、給誰用
2. **怎麼改活動文案** —— 進 Supabase 後台哪張表、改哪個欄位、改完即時生效
3. **怎麼發新邀請碼** —— `invite_codes` 新增一列、`uses_left` 怎麼設
4. **怎麼關閉 email 確認** —— Supabase 後台 Authentication 設定的實際路徑
5. **專案休眠後怎麼恢復** —— 後台哪個按鈕，恢復要多久
6. 為什麼 publishable key 出現在原始碼裡是正常的，以及 **secret key 絕對不能放進去**
7. 不要刪活動，改 `active = false`
8. **管理者怎麼處理帳號問題** —— 見 §9.2，這一節要寫成可以照著點的步驟

### 9.1 帳號歸屬

明年會換一批幹部。GitHub、Supabase、網域三個帳號都要掛在組織 email（`beyondtaiwan2020@gmail.com`）之下，**不要用個人帳號**，否則明年交接會斷。

### 9.2 管理者與帳號問題流程

指定**一位**護照管理者，姓名與任期寫在 README 的固定位置，交接時更新。這個人是唯一持有 Supabase 後台權限的人，也是 `beyondtaiwan2020@gmail.com` 的收信人。

**管理者的自律規範（README 要明寫）**

- 後台看得到所有人的 `entries`。**不因好奇翻閱。** 只有在使用者主動求助時才進去，而且事先告訴對方
- 代設密碼後立即銷毀手上的記錄，不留在對話紀錄或筆記裡
- 不把任何後台截圖貼進群組 —— 截圖常常連 secret key 一起入鏡

**逐項流程**，README 要寫到能照著點，不能只寫「去後台處理」：

| 使用者說 | 管理者怎麼做 |
|---|---|
| 我忘記密碼了 | Authentication → Users → 搜 email → 該列的 `⋯` → 設定新密碼 → 私訊本人。**不要在群組裡發** |
| 我 email 打錯／要換 email | Authentication → Users → 改 email。護照內容綁 `auth.uid()`，改 email 不影響章與心得 |
| 我想改姓名／團隊／一句話 | 請對方自己在資料頁改。資料頁改不動才由管理者改 `passports` 表 |
| 我要一組邀請碼 | `invite_codes` 新增一列，`uses_left = 1`，`note` 寫發給誰（見 §9 第 3 項）|
| 我不小心註冊了兩個帳號 | 確認哪個有章，刪掉沒章的那個。Authentication → Users → 刪除。`passports` 有 `on delete cascade`，章與心得會一併清掉 |
| 我要離開 BT，請刪掉我的資料 | **順序不能反**：先請對方自己按匯出（§7.4）拿到 JSON、回報收到，才刪帳號。資料表是 `on delete cascade`，刪 `auth.users` 那一列會連帶刪掉他的 `passports` / `stamps` / `entries`，免費方案沒有備份，救不回來 |
| 我的章不見了 | 先確認是不是登錯帳號（最常見）。真的不見再查 `stamps` 表。若有備份檔就走匯入還原 |
| 網站整個打不開 | 多半是專案休眠，見 §9 第 5 項。恢復後確認每日 ping 的 workflow 還在跑 |

**不做的事**：不做管理後台畫面。這些操作一年幾次，Supabase 內建後台夠用，自己做一個只會多一份要維護、又要另外做權限控管的程式碼。

---

## 10. 順手修掉的錯

原型與資料檔對不上的地方：

1. 分類代碼統一為 `gather` / `prompt` / `frame`。原型用 `G`/`P`/`F`，且第 272 行的註解停在更早的版本（「G 相聚 / S 分享 / T 留痕」），一併刪除
2. 申請頁文案「一年 36 格」改為 33 格（原型第 595 行）
3. 進度牆 `.track` 的 grid 從 12 欄改為 11 欄（原型第 179 行），與實際月份數一致

另：`HANDOFF.md` 第 1 節提到的 `BT-Passport-規劃.md` 不在交接檔案中。它是團隊面的規劃書，不影響實作，但若之後找到應一併入庫。

---

## 11. 驗收標準

以下每一條都要有實際執行過的證據，不接受「看起來沒問題」。

**安全（最高優先）**

1. 開兩個測試帳號 A 與 B。以 B 的身分實際查詢 A 的 `entries`，**必須回傳 0 列**。不是前端沒渲染，是資料庫回 0 列
2. 以 B 的身分嘗試 `update` / `delete` A 的 `stamps` 與 `passports`，必須失敗
3. 以任何登入身分查詢 `invite_codes`，必須回傳 0 列
4. 用無效邀請碼註冊，必須失敗，且 `auth.users` 不留下任何一列
5. 用已用完的邀請碼註冊，必須失敗
6. 全 repo 搜尋 `sb_secret_` 與 `service_role`，**必須零命中**。含 git 歷史
7. 前端使用的金鑰為 `sb_publishable_` 開頭，不是 JWT 格式的 anon key

**功能**

8. 蓋章 → 重新整理 → 章還在
9. 蓋章 → 換一台裝置登入 → 章還在
10. 匯出 → 清除護照 → 匯入還原 → 33 格的章、心得、照片、大頭照全部回來
11. 匯出的檔案在另一個帳號匯入，內容正確落在該帳號名下
12. `07B` 打開時顯示 `09B` 的內容；`09B` 未填寫時顯示替代文案且不阻擋作答
13. 管理者在後台代設密碼後，該帳號能用新密碼登入，且章與心得完好

**視覺**

14. 全站搜尋不存在 `#FFC46C` / `#EDE5D8` / `#102A86` 以外的色碼。允許的例外只有三種：`rgba(16,42,134,α)`、`rgba(255,196,108,α)`，以及原型既有的 `rgba(255,255,255,α)` 紙面提亮（用於 `.person` 與輸入框底色，讀起來是紙不是顏色，不視為第四色）。不得新增任何其他色碼
15. 不載入任何中文網頁字體，字體請求只有 Barlow Condensed 與 Inter
16. logo 未被改色、拉伸、旋轉或調整透明度
17. `prefers-reduced-motion: reduce` 下動畫關閉
18. 登入頁的忘記密碼提示沿用 `.wnote`，未引入新元件、新顏色

**韌性**

19. 斷開 Supabase 連線，前端顯示休眠訊息而非空白畫面
20. 錯誤訊息與所有引導文字中不出現任何個人姓名或個人聯絡方式，包含登入頁的忘記密碼提示
21. README 的 §9.2 流程表，找一位非工程背景的人照著做一次「代重設密碼」，能獨力完成

---

*活動內容為草案，未經 Marketing Director 與 President / VP 確認前不得對外公布。*
