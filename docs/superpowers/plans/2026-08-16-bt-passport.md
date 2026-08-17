# BT Passport 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `BT-Passport.html` 原型的儲存層從 `window.storage` 換成 Supabase，補上登入註冊、匯出匯入、部署與交接文件，做成 30 位 BT 幹部可以用一整個學年的線上護照。

**Architecture:** 前端零建置、原生 ES module，由 `index.html` 載入 `src/{data,ui,main}.js`。`data.js` 是唯一碰資料的地方，其餘模組只呼叫它的函式 —— 原型的 `sget/sset/slist` 就是這個接縫，先把它換成同介面的 localStorage 版（Task 4）讓拆檔可獨立驗證，再把函式內容換成 Supabase（Task 6）。安全完全靠 Postgres RLS，前端不做任何隱藏式防護。

**Tech Stack:** 原生 JS（ES module，無框架、無建置）／ Supabase Postgres + Auth（免費方案）／ GitHub Pages ／ GitHub Actions cron

**Spec:** `docs/superpowers/specs/2026-08-16-bt-passport-design.md` —— 本計畫的每個決定都出自該文件，執行時兩份一起讀。衝突時以 spec 為準，並回報衝突。

## 測試策略

這個專案沒有、也不會有 npm 或建置步驟，所以沒有 Jest／Vitest。測試改用兩個零依賴的工具，兩者都是真的可以執行、會給出通過或失敗的：

1. **`supabase/rls-test.sql`** —— 貼進 Supabase SQL Editor 執行。用 `set local role` 與 `request.jwt.claims` 模擬兩個使用者，逐條 `assert`。這覆蓋 spec §11 的安全項 1–5，是本專案最重要的測試
2. **`check.sh`** —— 純 grep 的靜態檢查。覆蓋 spec §11 的視覺項與金鑰項（色碼、字體請求、`sb_secret_`）

互動與視覺（落章動畫、翻頁、reduced-motion）沒有辦法用這兩者驗，一律寫成**具體到可以照做的手動步驟**，寫在該 task 裡，不寫「檢查看看有沒有問題」。

先寫測試、跑到失敗、再實作、再跑到通過的循環照走，只是「跑測試」在不同 task 分別指 `psql`／`./check.sh`／瀏覽器裡的一串明確動作。

## Global Constraints

每個 task 的要求都隱含包含這一節。逐字抄自 spec。

- **顏色只有三個**：`#FFC46C` 主橘、`#EDE5D8` 米白、`#102A86` 深藍。深淺變化只能調透明度。允許的例外只有 `rgba(16,42,134,α)`、`rgba(255,196,108,α)`、`rgba(255,255,255,α)`。**不得出現任何其他色碼**（spec §3.1、§11-14）
- **深藍不得作為大面積背景**，只能用在文字、線條、印章框（spec §3.1）
- **字體只有兩個**：Barlow Condensed、Inter。**不載入任何中文網頁字體** —— 不加 `@font-face`，Google Fonts 請求不得含中文家族。字體堆疊保留 `"Noto Sans TC"` 作為 fallback 名稱即可（spec §3.2、§11-15）
- **logo 不可改色、拉伸、旋轉或調整透明度**（spec §3.3）
- **新畫面不引入任何新的視覺元件**，一律沿用 `.card` / `.btn` / `label` / `.wnote`。不加漸層、不加陰影（`.toast` 既有的除外）（spec §3.4）
- **前端金鑰用 `sb_publishable_…`**，不用 anon key。**`sb_secret_…` 絕不可出現在前端、repo 或截圖**（spec §4.1）
- **活動內容一律來自資料庫**，不得寫死在程式裡。`activities.json` 只用於初次灌資料（spec §5）
- **任何錯誤訊息與引導文字都不得出現個人姓名或個人聯絡方式**，一律導向 `beyondtaiwan2020@gmail.com`（spec §6.1、§6.4、§8.1、§11-20）
- **分類代碼一律是 `gather` / `prompt` / `frame`**，不是原型的 `G`/`P`/`F`（spec §10-1）
- **一年 33 格**，11 個月（spec §10-2、§10-3）
- 照片一律壓到 **640px / q0.68**，大頭照 **420px / q0.7**（沿用原型 `compress()`）

---

## File Structure

| 檔案 | 職責 |
|---|---|
| `index.html` | 骨架、`<style>`、SVG 濾鏡、`<script type="module">` 進入點。樣式照搬原型，只改印章墨色與 `.track` 欄數 |
| `logo.png` | 從原型 base64 還原，尺寸比例不動 |
| `CNAME` | `passport.beyondtaiwannpo.com`，**不可刪除** |
| `activities.json` | seed 來源，保留在 repo，不被前端載入 |
| `vendor/supabase-js.js` | 釘住版本的 supabase-js ESM build，vendored 進 repo |
| `src/config.js` | Supabase URL 與 publishable key，只有兩行，方便交接時替換 |
| `src/data.js` | 所有資料存取：auth、passports、stamps、entries、匯出、匯入。**唯一碰 Supabase 的檔案** |
| `src/ui.js` | 所有畫面的 HTML 產生。純函式，吃 state 吐字串，不碰網路 |
| `src/main.js` | state、事件委派、路由、啟動 |
| `supabase/schema.sql` | 表、RLS、trigger、grant |
| `supabase/seed.sql` | months 與 activities 的 33 格資料 |
| `supabase/rls-test.sql` | 安全驗收測試 |
| `check.sh` | 靜態檢查 |
| `.github/workflows/ping.yml` | 每日保活 |
| `README.md` | 給非工程背景接手者 |

`ui.js` 與 `main.js` 分開的理由：原型把 HTML 產生與事件處理混在同一段，改動時容易一起壞。分開之後畫面可以單獨檢查。`data.js` 獨立是硬需求 —— 換儲存層時只有這一個檔案要動。

---

## Task 1: 資料表與 RLS

**Files:**
- Create: `supabase/schema.sql`
- Create: `supabase/rls-test.sql`

**Interfaces:**
- Consumes: 無
- Produces: 資料表 `months` `activities` `invite_codes` `passports` `stamps` `entries`，欄位與型別如 spec §5。後續所有 task 依賴這些名稱

- [ ] **Step 1: 寫失敗的測試 —— `supabase/rls-test.sql`**

這個檔案在 SQL Editor 執行，每個 `assert` 失敗會直接 raise。設計成可重複執行。

```sql
-- BT Passport RLS 驗收測試
-- 用法：整份貼進 Supabase SQL Editor 執行。
-- 全部通過會看到最後一列 'ALL RLS TESTS PASSED'。
-- 任何一條失敗會 raise exception 並中止，訊息說明是哪一條。

begin;

-- 兩個假使用者。不經過 auth，直接塞 passports，測的是 RLS 不是註冊流程。
-- 需要先在 auth.users 有列，因為 passports.id 有 FK。
insert into auth.users (id, email, encrypted_password, created_at, updated_at,
                        raw_user_meta_data, aud, role)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'rlstest-a@example.com', 'x', now(), now(), '{}', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'rlstest-b@example.com', 'x', now(), now(), '{}', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into passports (id, name_zh, team) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '測試甲', 'Curriculum Team'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '測試乙', 'Marketing Team')
on conflict (id) do nothing;

insert into stamps (user_id, act_id, stamped_on) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '09A', '2026-09-10')
on conflict do nothing;

insert into entries (user_id, act_id, note) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '09B', '甲的私人心得，乙不可以看到')
on conflict do nothing;

insert into invite_codes (code, uses_left, note) values
  ('RLSTEST-CODE', 1, 'rls test')
on conflict (code) do nothing;

-- 以下切換成使用者乙的身分
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}';

do $$
declare n int;
begin
  -- spec §11-1：乙查甲的 entries，必須 0 列
  select count(*) into n from entries
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 0 then
    raise exception 'FAIL §11-1: B 看得到 A 的 entries（% 列）。這是最嚴重的一條。', n;
  end if;

  -- 乙看得到自己的 entries（沒有就是政策寫太緊）
  insert into entries (user_id, act_id, note)
       values ('bbbbbbbb-0000-0000-0000-000000000002', '09B', '乙自己的');
  select count(*) into n from entries
   where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  if n <> 1 then
    raise exception 'FAIL: B 看不到自己的 entries，政策過緊';
  end if;

  -- spec §11-2：乙不能改甲的 stamps
  update stamps set stamped_on = '2000-01-01'
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL §11-2: B 改得動 A 的 stamps（% 列）', n;
  end if;

  delete from stamps where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL §11-2: B 刪得掉 A 的 stamps（% 列）', n;
  end if;

  -- spec §11-2：乙不能改甲的 passports
  update passports set name_zh = '被改掉了'
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL §11-2: B 改得動 A 的 passports（% 列）', n;
  end if;

  -- 乙看得到甲的 stamps（進度牆要用）
  select count(*) into n from stamps
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 1 then
    raise exception 'FAIL: B 看不到 A 的 stamps，進度牆會是空的';
  end if;

  -- 乙看得到甲的 passports（進度牆要用）
  select count(*) into n from passports
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 1 then
    raise exception 'FAIL: B 看不到 A 的 passports，進度牆會是空的';
  end if;

  -- spec §11-3：任何登入身分都讀不到 invite_codes
  select count(*) into n from invite_codes;
  if n <> 0 then
    raise exception 'FAIL §11-3: 登入者讀得到 invite_codes（% 列）', n;
  end if;

  -- 乙看得到 activities 與 months
  select count(*) into n from activities;
  if n = 0 then
    raise exception 'FAIL: 登入者讀不到 activities，整個護照會是空的';
  end if;
  select count(*) into n from months;
  if n <> 11 then
    raise exception 'FAIL: months 應該有 11 列，實際 %', n;
  end if;

  raise notice 'ALL RLS TESTS PASSED';
end $$;

rollback;  -- 測試資料不留下
```

- [ ] **Step 2: 跑測試確認失敗**

在 Supabase SQL Editor 貼上並執行 `supabase/rls-test.sql`。
Expected: FAIL，錯誤訊息類似 `relation "months" does not exist`。表都還沒建。

- [ ] **Step 3: 寫 `supabase/schema.sql`**

```sql
-- BT Passport schema
-- 用法：整份貼進 Supabase SQL Editor 執行。可重複執行。

-- ---------- 表 ----------

create table if not exists months (
  seq      int primary key,          -- 學年順序 1-11
  month    int not null,             -- 1-12
  theme_zh text not null,
  theme_en text not null
);

create table if not exists activities (
  id          text primary key,      -- '09A'，穩定不變
  month       int  not null,
  seq         int  not null,
  category    text not null check (category in ('gather','prompt','frame')),
  title_zh    text not null,
  title_en    text not null,
  description text,
  needs_host  boolean default false,
  callback_to text references activities,
  active      boolean default true
);

create table if not exists invite_codes (
  code       text primary key,
  uses_left  int not null default 1,
  note       text,
  created_at timestamptz default now()
);

create table if not exists passports (
  id         uuid primary key references auth.users on delete cascade,
  name_zh    text,
  name_en    text,
  team       text,
  motto      text,
  avatar     text,                   -- base64 jpeg
  issued     date default current_date,
  updated_at timestamptz default now()
);

create table if not exists stamps (
  user_id    uuid references passports on delete cascade,
  act_id     text references activities,
  stamped_on date not null,
  created_at timestamptz default now(),
  primary key (user_id, act_id)
);

create table if not exists entries (
  user_id uuid references passports on delete cascade,
  act_id  text references activities,
  note    text,
  photo   text,                      -- base64 jpeg，前端壓到 640px / q0.68
  primary key (user_id, act_id)
);

-- ---------- RLS ----------
-- 六張表全開 RLS。invite_codes 開了但不給任何 policy，等於對所有角色關閉。

alter table months       enable row level security;
alter table activities   enable row level security;
alter table invite_codes enable row level security;
alter table passports    enable row level security;
alter table stamps       enable row level security;
alter table entries      enable row level security;

drop policy if exists months_read on months;
create policy months_read on months
  for select to authenticated using (true);

drop policy if exists activities_read on activities;
create policy activities_read on activities
  for select to authenticated using (true);

-- invite_codes：故意沒有任何 policy。只有 security definer 的 trigger 讀得到。
revoke all on invite_codes from anon, authenticated;

drop policy if exists passports_read on passports;
create policy passports_read on passports
  for select to authenticated using (true);

drop policy if exists passports_write on passports;
create policy passports_write on passports
  for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);
-- 沒有 insert policy：那一列由註冊 trigger 建立（spec §5.1）

drop policy if exists stamps_read on stamps;
create policy stamps_read on stamps
  for select to authenticated using (true);

drop policy if exists stamps_insert on stamps;
create policy stamps_insert on stamps
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists stamps_update on stamps;
create policy stamps_update on stamps
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists stamps_delete on stamps;
create policy stamps_delete on stamps
  for delete to authenticated using (auth.uid() = user_id);

-- entries：這個系統唯一真正重要的安全需求（spec §5.1）。四種操作全部限本人。
drop policy if exists entries_read on entries;
create policy entries_read on entries
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists entries_insert on entries;
create policy entries_insert on entries
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists entries_update on entries;
create policy entries_update on entries
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists entries_delete on entries;
create policy entries_delete on entries
  for delete to authenticated using (auth.uid() = user_id);

-- ---------- grant ----------

grant select on months, activities to authenticated;
grant select, insert, update, delete on passports, stamps, entries to authenticated;
```

- [ ] **Step 4: 執行 schema.sql，然後重跑測試**

先在 SQL Editor 執行 `supabase/schema.sql`，再執行 `supabase/rls-test.sql`。
Expected: 仍然 FAIL，訊息是 `FAIL: 登入者讀不到 activities` 或 `months 應該有 11 列，實際 0`。表建好了但還沒 seed —— 這正是 Task 3 要補的。安全的五條（§11-1、2、3）此時必須全部通過。

若安全的任一條失敗，**停下來修 policy，不要往下走**。

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql supabase/rls-test.sql
git commit -m "feat(db): 資料表與 RLS 政策，附安全驗收測試"
```

---

## Task 2: 邀請碼與註冊 trigger

**Files:**
- Modify: `supabase/schema.sql`（在檔尾追加）
- Modify: `supabase/rls-test.sql`（追加 trigger 測試）

**Interfaces:**
- Consumes: Task 1 的 `invite_codes`、`passports`
- Produces: `public.handle_new_user()` 函式與 `on_auth_user_created` trigger。註冊時 `signUp` 的 `options.data.invite` 會被它讀取

- [ ] **Step 1: 寫失敗的測試**

追加到 `supabase/rls-test.sql` 的 `rollback;` **之前**：

```sql
-- ---------- 註冊 trigger ----------
reset role;
reset request.jwt.claims;

do $$
declare n int; ok boolean;
begin
  -- spec §11-4：無效邀請碼，註冊必須失敗且不留下 auth.users
  begin
    insert into auth.users (id, email, encrypted_password, created_at, updated_at,
                            raw_user_meta_data, aud, role)
    values ('cccccccc-0000-0000-0000-000000000003', 'rlstest-c@example.com', 'x',
            now(), now(), '{"invite":"THIS-CODE-DOES-NOT-EXIST"}', 'authenticated', 'authenticated');
    raise exception 'FAIL §11-4: 無效邀請碼竟然註冊成功了';
  exception when sqlstate 'P0001' then
    null;  -- 預期會走到這裡
  end;

  select count(*) into n from auth.users
   where id = 'cccccccc-0000-0000-0000-000000000003';
  if n <> 0 then
    raise exception 'FAIL §11-4: 註冊失敗但 auth.users 留下了 % 列', n;
  end if;

  -- 有效邀請碼可以註冊，且 uses_left 扣到 0，passports 自動建列
  insert into auth.users (id, email, encrypted_password, created_at, updated_at,
                          raw_user_meta_data, aud, role)
  values ('dddddddd-0000-0000-0000-000000000004', 'rlstest-d@example.com', 'x',
          now(), now(), '{"invite":"RLSTEST-CODE"}', 'authenticated', 'authenticated');

  select uses_left into n from invite_codes where code = 'RLSTEST-CODE';
  if n <> 0 then
    raise exception 'FAIL: 邀請碼用過之後 uses_left 應為 0，實際 %', n;
  end if;

  select count(*) into n from passports
   where id = 'dddddddd-0000-0000-0000-000000000004';
  if n <> 1 then
    raise exception 'FAIL: 註冊後 passports 沒有自動建列';
  end if;

  -- spec §11-5：同一組碼已用完，再註冊必須失敗
  begin
    insert into auth.users (id, email, encrypted_password, created_at, updated_at,
                            raw_user_meta_data, aud, role)
    values ('eeeeeeee-0000-0000-0000-000000000005', 'rlstest-e@example.com', 'x',
            now(), now(), '{"invite":"RLSTEST-CODE"}', 'authenticated', 'authenticated');
    raise exception 'FAIL §11-5: 用完的邀請碼竟然還能註冊';
  exception when sqlstate 'P0001' then
    null;
  end;

  raise notice 'TRIGGER TESTS PASSED';
end $$;
```

- [ ] **Step 2: 跑測試確認失敗**

在 SQL Editor 執行 `supabase/rls-test.sql`。
Expected: `FAIL §11-4: 無效邀請碼竟然註冊成功了`。trigger 還不存在，任何 metadata 都會直接寫進去。

- [ ] **Step 3: 追加 trigger 到 `supabase/schema.sql` 檔尾**

```sql
-- ---------- 註冊 trigger ----------
-- Supabase Auth 沒有內建邀請碼機制，免費方案也不用 Edge Function。
-- 用 DB trigger 擋在註冊交易裡：驗證失敗就 raise，整筆註冊回滾（spec §6）。

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_code text := new.raw_user_meta_data->>'invite';
begin
  -- update ... where uses_left > 0 搭配 if not found，
  -- 一次完成檢查與扣減，避免兩人同時用同一組最後一次的碼（spec §6）
  update invite_codes set uses_left = uses_left - 1
   where code = v_code and uses_left > 0;
  if not found then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;

  insert into passports(id) values (new.id);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 4: 執行後重跑測試**

在 SQL Editor 執行 `supabase/schema.sql`，再執行 `supabase/rls-test.sql`。
Expected: 安全五條全過，看到 `TRIGGER TESTS PASSED`。仍會在 activities/months 的斷言停下 —— 那是 Task 3。

- [ ] **Step 5: 在後台關閉信箱驗證**

Supabase 後台 → Authentication → Sign In / Providers → Email → 關閉 "Confirm email"（spec §6）。
記下實際的點擊路徑，Task 12 的 README 第 4 項要用。

- [ ] **Step 6: Commit**

```bash
git add supabase/schema.sql supabase/rls-test.sql
git commit -m "feat(db): 邀請碼驗證 trigger，無效碼整筆註冊回滾"
```

---

## Task 3: 灌入月份與活動資料

**Files:**
- Create: `supabase/seed.sql`
- Read: `activities.json`

**Interfaces:**
- Consumes: Task 1 的 `months`、`activities`
- Produces: 11 列 months、33 列 activities。`07B.callback_to = '09B'`

- [ ] **Step 1: 跑現有測試確認缺資料**

執行 `supabase/rls-test.sql`。
Expected: `FAIL: months 應該有 11 列，實際 0`。

- [ ] **Step 2: 寫 `supabase/seed.sql`**

資料逐字取自 `activities.json`。`seq` 是學年順序（9 月 = 1），不是月份數字。`category` 用 `gather`/`prompt`/`frame`，不是原型的 `G`/`P`/`F`。

```sql
-- BT Passport seed
-- 資料來源：activities.json（唯一來源）。可重複執行。
-- 課程組日後要改文案，直接在 Supabase 後台改 activities 表，不要改這個檔案。

insert into months (seq, month, theme_zh, theme_en) values
  (1,  9,  '開學',   'FIRST WEEK'),
  (2,  10, '換季',   'TURNING'),
  (3,  11, '低潮期', 'THE DIP'),
  (4,  12, '收尾',   'WRAP'),
  (5,  1,  '起頭',   'OPENING'),
  (6,  2,  '配對季', 'MATCHING'),
  (7,  3,  '長跑',   'THE LONG RUN'),
  (8,  4,  '春天',   'SPRING'),
  (9,  5,  '生日月', 'BIRTH MONTH'),
  (10, 6,  '大場面', 'SHOWTIME'),
  (11, 7,  '散場',   'CURTAIN')
on conflict (seq) do update set
  month = excluded.month, theme_zh = excluded.theme_zh, theme_en = excluded.theme_en;

-- callback_to 有自我參照的 FK，所以先全部插入不含 callback_to，最後再補 07B。
insert into activities (id, month, seq, category, title_zh, title_en, description, needs_host) values
  ('09A', 9,  1,  'gather', '開學電影夜',        'OPENING NIGHT',    '新學年第一次全員上線，選片權給今年的新幹部', true),
  ('09B', 9,  1,  'prompt', '我是怎麼進來的',    'HOW I GOT HERE',   '三句話，寫下你當初為什麼點進 BT', false),
  ('09C', 9,  1,  'frame',  '開學第一天',        'DAY ONE',          '你的桌子、教室、通勤路上，隨便哪個', false),
  ('10A', 10, 2,  'gather', '遊戲夜',            'GAME NIGHT',       'Gartic Phone、狼人殺、Among Us，主辦組決定', true),
  ('10B', 10, 2,  'prompt', '沒有人知道的事',    'NOBODY KNOWS',     '一件 BT 裡沒人知道的關於你的事', false),
  ('10C', 10, 2,  'frame',  '十月的天空',        'OCTOBER SKY',      '抬頭拍一張，不管你在哪個城市', false),
  ('11A', 11, 3,  'gather', '線上自習',          'STUDY WITH ME',    '開鏡頭、靜音、唸兩小時，中間休息十分鐘', true),
  ('11B', 11, 3,  'prompt', '最想放棄的一刻',    'THE LOWEST HOUR',  '寫下來就好，不用解決它', false),
  ('11C', 11, 3,  'frame',  '桌上的一團亂',      'THE MESS',         '你現在的桌面，不要整理', false),
  ('12A', 12, 4,  'gather', '年末大合照',        'YEAR-END PHOTO',   '缺席的用手機同框', true),
  ('12B', 12, 4,  'prompt', '今年學會的一件事',  'ONE THING',        '跟 BT 無關也可以', false),
  ('12C', 12, 4,  'frame',  '你的十二月',        'DECEMBER LIGHT',   '燈、街、窗，任何一種光', false),
  ('01A', 1,  5,  'gather', '慶功宵夜',          'AFTER PARTY',      '寒期探索營結束當晚，線上實體都算', true),
  ('01B', 1,  5,  'prompt', '今年想丟掉的一件事','LEAVE BEHIND',     '習慣、想法、任何東西', false),
  ('01C', 1,  5,  'frame',  '冬天的樣子',        'WINTER',           '外套、暖氣、手，隨便哪個', false),
  ('02A', 2,  6,  'gather', '桌遊夜',            'BOARD GAME NIGHT', '試玩留學大富翁，順便回報 bug', true),
  ('02B', 2,  6,  'prompt', '我最不擅長的事',    'WHAT I''M BAD AT', '寫下來，不用改善它', false),
  ('02C', 2,  6,  'frame',  '有人在忙',          'SOMEONE WORKING',  '拍一張別人在做 BT 的樣子', false),
  ('03A', 3,  7,  'gather', '廚房夜',            'KITCHEN NIGHT',    '各自煮、同框吃，泡麵也是煮', true),
  ('03B', 3,  7,  'prompt', '如果不做 BT',       'THE OTHER LIFE',   '這學期你會在做什麼', false),
  ('03C', 3,  7,  'frame',  '走路回家的路上',    'THE WAY HOME',     '一張就好', false),
  ('04A', 4,  8,  'gather', '教我一件事',        'TEACH ME',         '五分鐘閃電分享，折衣服也算', true),
  ('04B', 4,  8,  'prompt', '我改變想法的一件事','I CHANGED MY MIND','以前這樣想、現在那樣想', false),
  ('04C', 4,  8,  'frame',  '綠色的東西',        'SOMETHING GREEN',  '四月了，找一個', false),
  ('05A', 5,  9,  'gather', 'BT 慶生',           'BIRTHDAY TABLE',   '五月是 BT 的生日月，找張桌子', true),
  ('05B', 5,  9,  'prompt', '在 BT 最喜歡的一天','BEST DAY',         '到目前為止', false),
  ('05C', 5,  9,  'frame',  '期末的樣子',        'FINALS',           '圖書館、咖啡廳、房間', false),
  ('06A', 6,  10, 'gather', '跨國連線夜',        'GLOBAL CALL',      '不同時區同框截圖，誰在凌晨誰就贏', true),
  ('06B', 6,  10, 'prompt', '這一年沒做到的事',  'WHAT I MISSED',    '誠實一點', false),
  ('06C', 6,  10, 'frame',  '官方活動的非官方照','OFF THE RECORD',   '愈亂愈好', false),
  ('07A', 7,  11, 'gather', '學年最後一夜',      'LAST NIGHT',       '電影夜還是遊戲夜，今年的幹部自己決定', true),
  ('07B', 7,  11, 'prompt', '現在還算數嗎',      'STILL TRUE?',      '回去看九月寫的那三句，補一段今天的回應', false),
  ('07C', 7,  11, 'frame',  '這一年最喜歡的一張','PHOTO OF THE YEAR','翻相簿，挑一張', false)
on conflict (id) do update set
  month = excluded.month, seq = excluded.seq, category = excluded.category,
  title_zh = excluded.title_zh, title_en = excluded.title_en,
  description = excluded.description, needs_host = excluded.needs_host;

-- 07B 回望 09B（spec §7.3）。此欄位驅動回望機制，不在程式裡寫死 '07B'。
update activities set callback_to = '09B' where id = '07B';
```

- [ ] **Step 3: 執行後重跑測試**

在 SQL Editor 執行 `supabase/seed.sql`，再執行 `supabase/rls-test.sql`。
Expected: 最後一列 `ALL RLS TESTS PASSED` 與 `TRIGGER TESTS PASSED`，沒有任何 exception。

- [ ] **Step 4: 手動確認資料筆數**

在 SQL Editor 執行：

```sql
select count(*) as acts from activities;                      -- 期望 33
select count(*) as m from months;                             -- 期望 11
select count(*) from activities where category = 'gather';    -- 期望 11
select count(*) from activities where category = 'prompt';    -- 期望 11
select count(*) from activities where category = 'frame';     -- 期望 11
select id, callback_to from activities where callback_to is not null;  -- 期望只有 07B → 09B
```

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat(db): 灌入 11 個月份與 33 格活動，07B 回望 09B"
```

---

## Task 4: 拆檔、還原 logo、修掉視覺違規

這個 task **不碰 Supabase**。目的是把原型拆成模組、把 spec §10 的錯與 §3.1 的三色違規修掉，並且結束時是一個**在瀏覽器裡可以真的操作的 app**（資料暫時存 localStorage）。把拆檔與換後端分開，是為了出問題時知道是哪一步壞的。

**Files:**
- Create: `index.html`（骨架 + `<style>`，樣式照搬原型）
- Create: `logo.png`
- Create: `src/ui.js`、`src/main.js`、`src/data.js`（localStorage 版）
- Create: `check.sh`
- Keep: `BT-Passport.html`（原型保留在 repo 供比對，不刪）

**Interfaces:**
- Produces —— `data.js` 匯出的介面，Task 6 會換掉內容但**簽名不變**：
  - `async loadAll(): Promise<{profile, stamps, entries, activities, months}>` —— `stamps` 是 `{[actId]: {date}}`，`entries` 是 `{[actId]: {note, photo}}`
  - `async saveProfile(p): Promise<void>` —— `p` 為 `{name_zh, name_en, team, motto}`
  - `async saveAvatar(dataUrl): Promise<void>`
  - `async saveStamp(actId, {date, note, photo}): Promise<void>`
  - `async removeStamp(actId): Promise<void>`
  - `async loadWall(): Promise<Array<{id, name_zh, name_en, team, avatar, stamps: Array<{act_id, stamped_on}>}>>`
  - `passportNo(id): string` —— 純函式。**放在 `data.js` 而不是 `ui.js`**，因為 Task 9 的匯出檔名要用它，而 `data.js` 不可以反向依賴 `ui.js`。`ui.js` 從這裡 import
- Produces —— `ui.js` 匯出：`barHTML(S)`、`bookHTML(S)`、`idPageHTML(S)`、`monthPageHTML(S, m)`、`slotHTML(S, a)`、`stampHTML(a, st, animate)`、`wallHTML(S)`、`setupHTML(p)`、`esc(s)`、`today()`、`CATNAME`
- Produces —— `main.js`：`boot()` 是**具名 async 函式**（不是原型的匿名 IIFE），因為 Task 5 的登入成功後要再呼叫一次

- [ ] **Step 1: 從 base64 還原 logo.png**

原型第 254 行的 `LOGO` 常數是 data URI。取出 base64 主體寫成檔案：

```bash
grep -o 'base64,[^"]*' BT-Passport.html | head -1 | sed 's/^base64,//' | base64 -d > logo.png
file logo.png
```

Expected: `logo.png: PNG image data, 386 x 191, 8-bit colormap, non-interlaced`（寬高以實際輸出為準，重點是能被認出是 PNG）。

- [ ] **Step 2: 寫 `check.sh` —— 這是本 task 的測試**

```bash
#!/usr/bin/env bash
# BT Passport 靜態檢查。對應 spec §11 的視覺項與金鑰項。
# 用法：./check.sh
set -u
fail=0
say() { printf '%s\n' "$1"; }
bad() { printf 'FAIL  %s\n' "$1"; fail=1; }
ok()  { printf 'ok    %s\n' "$1"; }

FILES="index.html src"

# §11-6 secret key 絕不可入庫
if grep -rIq --exclude-dir=.git 'sb_secret_\|service_role' . ; then
  bad "§11-6 repo 裡出現 sb_secret_ 或 service_role"
  grep -rIn --exclude-dir=.git 'sb_secret_\|service_role' .
else
  ok "§11-6 沒有 secret key"
fi

# §11-14 只有三色。抓所有 #hex，扣掉三個允許值。
stray=$(grep -rhIo '#[0-9A-Fa-f]\{3,8\}\b' $FILES 2>/dev/null \
        | tr 'a-f' 'A-F' | sort -u \
        | grep -v '^#FFC46C$' | grep -v '^#EDE5D8$' | grep -v '^#102A86$')
if [ -n "$stray" ]; then
  bad "§11-14 出現不允許的色碼："
  printf '%s\n' "$stray"
else
  ok "§11-14 只有三個色碼"
fi

# §11-14 rgba 只允許三種底色
strayrgba=$(grep -rhIo 'rgba([0-9 ]*,[0-9 ]*,[0-9 ]*,[^)]*)' $FILES 2>/dev/null \
        | sed 's/ //g' | sort -u \
        | grep -v '^rgba(16,42,134,' | grep -v '^rgba(255,196,108,' | grep -v '^rgba(255,255,255,')
if [ -n "$strayrgba" ]; then
  bad "§11-14 出現不允許的 rgba："
  printf '%s\n' "$strayrgba"
else
  ok "§11-14 rgba 只用允許的三個底色"
fi

# §11-15 不載入中文網頁字體
if grep -rIq '@font-face' $FILES 2>/dev/null; then
  bad "§11-15 出現 @font-face，不得自行載入字體"
else
  ok "§11-15 沒有 @font-face"
fi
fontreq=$(grep -rhIo 'fonts.googleapis.com/css2?[^"]*' $FILES 2>/dev/null)
if printf '%s' "$fontreq" | grep -qi 'Noto\|Source+Han\|CJK\|TC\b'; then
  bad "§11-15 Google Fonts 請求含中文字體：$fontreq"
else
  ok "§11-15 字體請求只有 Barlow Condensed 與 Inter"
fi

# §10-1 分類代碼
if grep -rIqE '"[GPF]"' $FILES 2>/dev/null; then
  bad "§10-1 還有原型的 G/P/F 分類代碼"
else
  ok "§10-1 分類代碼已統一"
fi

# §10-2 33 格
if grep -rIq '36 格' $FILES 2>/dev/null; then
  bad "§10-2 還有『36 格』的文案"
else
  ok "§10-2 沒有 36 格"
fi

# §10-3 進度牆 11 欄
if grep -rIq 'repeat(12,1fr)' $FILES 2>/dev/null; then
  bad "§10-3 .track 還是 12 欄"
else
  ok "§10-3 .track 不是 12 欄"
fi

# §11-20 不得出現個人聯絡方式：檢查除了組織信箱以外的 email
mails=$(grep -rhIo '[A-Za-z0-9._%+-]*@[A-Za-z0-9.-]*\.[A-Za-z]\{2,\}' $FILES 2>/dev/null \
        | sort -u | grep -v '^beyondtaiwan2020@gmail.com$' | grep -v 'example.com$')
if [ -n "$mails" ]; then
  bad "§11-20 出現非組織信箱："
  printf '%s\n' "$mails"
else
  ok "§11-20 只有組織信箱"
fi

# CNAME 不可掉
if [ -f CNAME ]; then
  ok "CNAME 存在"
else
  bad "CNAME 不見了，自訂網域會掉（spec §8）"
fi

[ $fail -eq 0 ] && say "" && say "全部通過。" || { say ""; say "有項目未通過。"; }
exit $fail
```

- [ ] **Step 3: 跑 check.sh 確認失敗**

```bash
chmod +x check.sh && ./check.sh
```

Expected: FAIL。`index.html` 與 `src/` 還不存在，且 CNAME 不存在。

- [ ] **Step 4: 建 `index.html`，樣式照搬原型並改三處**

把原型第 1–252 行搬進 `index.html`，`LOGO` 改成 `logo.png`，並做以下**三處**修改：

改法一（spec §3.1）—— 刪掉 `#E09A2E`，聚會章與疊印改為橘底藍字。原型第 129 行與第 137–143 行：

```css
  /* 原型：.ink-orange{color:#E09A2E}  ← 第四色，刪掉 */
  /* 聚會章：橘底 + 深藍文字與框線（spec §3.1）*/
  .stamp.ink-fill{
    color:var(--bt-navy);
    background:var(--bt-orange);
  }
  .ink-navy{color:var(--bt-navy)}

  .overprint{
    position:absolute;top:70px;right:26px;z-index:2;pointer-events:none;
    transform:rotate(-11deg);
    color:var(--bt-navy);background:var(--bt-orange);
    opacity:.85;
    border:3px double currentColor;border-radius:4px;padding:3px 13px;
    font-family:var(--display);font-size:21px;font-weight:700;letter-spacing:.2em;
    filter:url(#bt-ink);
  }
```

`.stamp` 既有的 `opacity:.86` 在有底色時會讓橘底透出紙面，讀起來仍像墨。保留。
`.overprint` 原本 `opacity:.55` 配線框，改成有底色後太淡，提到 `.85`。這不是新增顏色，是同一個橘的透明度調整，符合 §3.1。

改法二（spec §10-3）—— 原型第 179 行：

```css
  .track{display:grid;grid-template-columns:repeat(11,1fr);gap:2px;margin-top:10px}
```

改法三 —— 刪掉原型第 272 行的過時註解 `// cat: G 相聚 / S 分享 / T 留痕`（該行在搬進 `src/` 時直接不要帶）。

檔尾的 script 標籤改為：

```html
<div id="bt-root"><div class="empty">載入護照中…</div></div>
<script type="module" src="./src/main.js"></script>
```

- [ ] **Step 5: 建 `src/data.js`（localStorage 版）**

介面就是上面 Interfaces 那六個函式。Task 6 只換內容，不換簽名。

```js
// 暫時的 localStorage 儲存層。Task 6 會把每個函式的內容換成 Supabase，
// 簽名不變。這一版的存在是為了讓拆檔可以獨立驗證。
const KEY = "bt-passport:local";

// 活動與月份在正式版來自資料庫。這一版先從 activities.json 讀，
// 讓拆檔階段就用「非同步取得活動」的形狀，Task 6 換來源時不必改 ui.js。
async function seedFromJson() {
  const r = await fetch("./activities.json");
  const j = await r.json();
  return {
    months: j.months,
    activities: j.activities.map(a => ({
      id: a.id, month: a.month, category: a.category,
      title_zh: a.title_zh, title_en: a.title_en,
      description: a.desc, needs_host: a.needs_host,
      callback_to: a.callback_to || null, active: true
    }))
  };
}

function readLocal() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch (e) { return {}; }
}
function writeLocal(o) { localStorage.setItem(KEY, JSON.stringify(o)); }

export async function loadAll() {
  const { months, activities } = await seedFromJson();
  const d = readLocal();
  return {
    profile: d.profile || null,
    stamps: d.stamps || {},
    entries: d.entries || {},
    months, activities
  };
}

export async function saveProfile(p) {
  const d = readLocal();
  d.profile = Object.assign({ issued: new Date().toISOString().slice(0, 10) }, d.profile, p);
  if (!d.profile.id) d.profile.id = "local-" + Math.random().toString(36).slice(2, 10);
  writeLocal(d);
}

export async function saveAvatar(dataUrl) {
  const d = readLocal();
  if (!d.profile) return;
  d.profile.avatar = dataUrl;
  writeLocal(d);
}

export async function saveStamp(actId, { date, note, photo }) {
  const d = readLocal();
  d.stamps = d.stamps || {}; d.entries = d.entries || {};
  d.stamps[actId] = { date };
  d.entries[actId] = { note: note || "", photo: photo || null };
  writeLocal(d);
}

export async function removeStamp(actId) {
  const d = readLocal();
  if (d.stamps) delete d.stamps[actId];
  if (d.entries) delete d.entries[actId];
  writeLocal(d);
}

export async function loadWall() {
  const d = readLocal();
  if (!d.profile) return [];
  return [{
    id: d.profile.id, name_zh: d.profile.name_zh, name_en: d.profile.name_en,
    team: d.profile.team, avatar: d.profile.avatar || null,
    stamps: Object.keys(d.stamps || {}).map(k => ({ act_id: k, stamped_on: d.stamps[k].date }))
  }];
}
```

- [ ] **Step 5b: 把 `passportNo` 放進 `data.js`**

原型第 350–353 行。它是純函式，但 Task 9 的匯出檔名要用，所以放 `data.js` 並 export，
`ui.js` 從這裡 import。**不要**放 `ui.js` 再讓 `data.js` 反向 import。

```js
// 護照號碼由 id 決定，固定不變。Task 6 之後 id 是 auth uuid，
// 所以護照號碼從此穩定，不會因為重新登入而變（spec §7.2）。
export function passportNo(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return "BT" + String(h % 10000000).padStart(7, "0");
}
```

- [ ] **Step 6: 建 `src/ui.js`**

從原型搬過來並 `export`（括號內是原型行號）：`esc`(343)、`today`(344)、`mrz`(355-369)、
`stampHTML`(489-499)、`slotHTML`(513-528)、`monthPageHTML`(501-511)、`idPageHTML`(458-487)、
`wallHTML`(544-576)、`setupHTML`(590-606)、`barHTML`(428-438)、`bookHTML`(440-456)。
`passportNo` 從 `data.js` import。同時做這些**必要的改寫**：

1. 分類：刪掉 `CATNAME = {G:…, P:…, F:…}`，改為

```js
export const CATNAME = {
  gather: "聚會 GATHER",
  prompt: "題目 PROMPT",
  frame:  "鏡頭 FRAME"
};
```

2. `stampHTML` 的墨色改吃新分類，並用新的 class：

```js
export function stampHTML(act, st, animate) {
  const ink = act.category === "gather" ? "ink-fill" : "ink-navy";
  const rot = ((act.id.charCodeAt(2) * 7) % 11) - 5;   // 角度由 id 決定，固定不變（spec §7.1）
  return `<div class="stampwrap"><div class="tilt" style="transform:rotate(${rot}deg)">
    <div class="stamp ${ink}${animate ? " land" : ""}">
      <div class="s1">Beyond Taiwan</div>
      <div class="s2">${esc(act.title_en)}</div>
      <div class="s3">${esc(st.date).replace(/-/g, ".")}</div>
    </div>
  </div></div>`;
}
```

3. 所有讀 `a.zh` / `a.en` / `a.hint` / `a.m` / `a.c` 的地方改成 `a.title_zh` / `a.title_en` / `a.description` / `a.month` / `a.category`。活動與月份從 `S.activities` / `S.months` 取，不再有模組層級的 `ACTS` / `MONTHS` 常數（spec §5：活動內容不得寫死在程式裡）。

4. `passportNo` 保持不變（Task 6 會餵它 auth uuid，護照號碼從此穩定）。

5. `setupHTML` 兩處文案（spec §10-2、§6.2）：

```js
    <div class="sub">${p.id ? "改完按儲存，章不會消失。" : "一年 33 格，每個月三個。蓋滿的人，年底會有一整本回憶。"}</div>
```

```js
    <div class="wnote" style="margin:0 0 16px">送出後，你的姓名、團隊、大頭照與蓋章紀錄會出現在全體進度牆上，<b>其他 BT 幹部看得到，包含你的大頭照</b>。你寫的心得和上傳的活動照片只留在你自己的護照裡，<b>其他幹部看不到</b>。</div>
```

6. `wallHTML` 的 `.wnote` 同步改為同一套措辭：

```js
    <div class="wnote">這面牆是公開的：所有 BT 幹部都看得到你的名字、團隊、大頭照與蓋章紀錄。你寫的心得和上傳的活動照片不會出現在這裡，其他幹部看不到。</div>
```

7. `monthPageHTML` 的月份中文名原型寫死在 `MONTHS` 常數。改由 `S.months` 提供 `theme_zh` / `theme_en`，中文月名用一個純顯示用的小陣列（這是語言常數不是活動內容，可以留在程式裡）：

```js
const MONTH_ZH = { 1:"一月",2:"二月",3:"三月",4:"四月",5:"五月",6:"六月",
                   7:"七月",8:"八月",9:"九月",10:"十月",11:"十一月",12:"十二月" };
```

- [ ] **Step 7: 建 `src/main.js`**

把原型的 `S` state、`compress`、`toast`、`hydratePhotos`、`render`、`openModal`、`doStamp`、click 委派、keydown 委派、boot IIFE 搬過來，改為 `import * as DATA from "./data.js"` 與 `import * as UI from "./ui.js"`。刪掉 `sget/sset/slist/saveLocal/pushWall/PKEY/rid`，改呼叫 `DATA.*`。

state 形狀：

```js
let S = {
  profile: null, stamps: {}, entries: {},
  activities: [], months: [],
  page: 0, view: "passport", wall: null, wallLoading: false,
  justStamped: null
};
```

`doStamp` 改為：

```js
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
```

「核發護照 / 儲存」的 `issue` 事件改為（欄位名一律 snake_case，與資料表一致；
不再有 `rid()` 產生的本地 id —— 那一行連同函式一起刪掉）：

```js
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
```

boot 改為**具名函式**（原型是匿名 IIFE，但 Task 5 登入成功後要再呼叫一次）：

```js
export async function boot() {
  const all = await DATA.loadAll();
  S.activities = all.activities.filter(a => a.active !== false);
  S.months = all.months;
  S.profile = all.profile;
  S.stamps = all.stamps;
  S.entries = all.entries;
  render();
}
boot();
```

- [ ] **Step 8: 建 CNAME**

```bash
printf 'passport.beyondtaiwannpo.com\n' > CNAME
```

- [ ] **Step 9: 跑 check.sh**

```bash
./check.sh
```

Expected: 全部 ok，最後一行 `全部通過。`

- [ ] **Step 10: 在瀏覽器手動驗證**

```bash
python3 -m http.server 8000
```

開 `http://localhost:8000/`，依序做完並確認每一項：

1. 出現申請護照畫面，副標寫「一年 33 格」
2. 填名字送出 → 出現資料頁，有 logo、護照號碼、機讀碼
3. 按「下一頁」到九月 → 三格顯示「開學電影夜／我是怎麼進來的／開學第一天」，分類標示是「聚會 GATHER」等
4. 點第一格蓋章 → **章要有落下動畫**，且是**橘底深藍字**，不是舊的 `#E09A2E`
5. 點第二格蓋章 → 章是**深藍線框**
6. 三格都蓋滿 → 頁面右上浮出斜的 `MONTH CLEARED`，同樣是橘底深藍字
7. 重新整理 → 章還在（localStorage）
8. 按鍵盤左右鍵 → 會翻頁
9. 開蓋章視窗按 Esc → 關閉
10. 進度牆分頁 → 每個人的 `.track` 是 **11 格**，不是 12
11. 系統設定開啟「減少動態」後重整 → 蓋章不再有動畫

- [ ] **Step 11: Commit**

```bash
git add index.html logo.png CNAME check.sh src/
git commit -m "refactor: 拆成 index.html + src 模組，修掉第四色與 36 格/12 欄的錯"
```

---

## Task 5: 登入、註冊與邀請碼畫面

**Files:**
- Create: `src/config.js`
- Create: `vendor/supabase-js.js`
- Modify: `src/data.js`（加 auth 區段）
- Modify: `src/ui.js`（加 `authHTML`）
- Modify: `src/main.js`（加 auth 事件與啟動分支）

**Interfaces:**
- Consumes: Task 2 的 trigger
- Produces:
  - `data.js`: `supabase`（client 實例）、`async signIn(email, pw)`、`async signUp(email, pw, invite)`、`async signOut()`、`async currentUser()`、`authMessage(err)`
  - `ui.js`: `authHTML(mode, msg)`，`mode` 為 `"in"` 或 `"up"`

- [ ] **Step 1: Vendored supabase-js**

不從 CDN 即時載入 —— CDN 掛掉整站就掛掉，且明年接手的人看不出版本。抓一份釘住版本的 ESM build 進 repo：

```bash
mkdir -p vendor
curl -L 'https://esm.sh/@supabase/supabase-js@2?bundle&target=es2020' -o vendor/supabase-js.js
head -c 200 vendor/supabase-js.js
```

Expected: 看得到 JS 內容而不是 HTML 錯誤頁。檔案大小應在數百 KB 量級。
在檔案最上方加一行註解記下版本與抓取日期。

- [ ] **Step 2: 建 `src/config.js`**

```js
// Supabase 連線設定。換專案時只改這個檔案。
// publishable key 出現在這裡是正常的，不是外洩 —— 真正的防線是資料庫的 RLS。
// 詳見 README「為什麼金鑰可以放在原始碼裡」。
// 絕對不要把 sb_secret_ 開頭的金鑰放進這個檔案或這個 repo 的任何地方。
export const SUPABASE_URL = "https://<專案代號>.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_<貼上後台 Project Settings → API Keys 的 publishable key>";
```

實作時把 `<…>` 換成真實值。若後台只看到 legacy 的 anon key，先在同一頁把新版金鑰啟用／建立，取得 `sb_publishable_` 開頭的字串再繼續（spec §4.1）。

- [ ] **Step 3: 先實測「錯誤長什麼樣」，再寫翻譯 —— 順序不可以顛倒**

**不要照著預期的錯誤字串寫 `authMessage`。** trigger `raise` 之後，Supabase 回給前端的
是籠統的資料庫錯誤，不會是 `invalid_invite`。實際的 `status`、`code`、`message` 三者
長什麼樣，只有真的失敗一次才知道，而且會隨 GoTrue 版本變。

所以先做這件事，Step 4 的程式碼才有依據：

1. 在 SQL Editor 建一組測試碼：`insert into invite_codes (code, uses_left, note) values ('TEST-ONCE', 1, '手動測試用，測完刪掉');`
2. 用一個最小的 HTML 頁面（或瀏覽器 console）打四次 `signUp`，把**原始錯誤物件**印出來：

```js
const { data, error } = await supabase.auth.signUp({
  email: "probe1@example.com", password: "123456",
  options: { data: { invite: "WRONG-CODE" } }
});
console.log(JSON.stringify({ error, user: data && data.user }, null, 2));
```

四個情境各打一次，把回應原封不動記下來：

| # | 送什麼 | 記下 |
|---|---|---|
| 1 | 無效邀請碼 | `error.status`、`error.code`、`error.message` |
| 2 | 已用完的碼 | 同上（預期與 1 相同，因為 trigger 走同一條路徑）|
| 3 | 重複的 email + 有效碼 | 有 `error` 還是回 200 且 `data.user.identities` 為空陣列 |
| 4 | 密碼 `12345`（5 字）| `error.status`、`error.message` |

3. **把四次的原始回應貼進 `.superpowers/sdd/2026-08-16-bt-passport/task-5-report.md`**，
   Step 4 的判斷式依據實測結果寫，不依據猜測。
4. 若實測與 spec §6.1 的假設不符（例如重複 email 回 200 而非 4xx），**回報並更新 spec §6.1**，
   不要默默改程式了事。

每個情境的**畫面文案**是固定的，逐字抄自 spec §6.1；會變的只有「怎麼判斷落到哪一格」：

| 情境 | 必須出現的文案 |
|---|---|
| 邀請碼無效或用完 | 這個邀請碼不對，或是已經被用完了。跟你的組長要一組新的。 |
| email 已註冊 | 這個 email 已經有護照了，直接登入就好。 |
| 密碼太短 | 密碼至少要 6 個字。 |
| 連不上資料庫 | 現在連不上資料庫。請寄信到 beyondtaiwan2020@gmail.com，資料都還在。 |
| 其他未預期錯誤 | 出了點狀況，再試一次。還是不行的話寄信到 beyondtaiwan2020@gmail.com。 |

- [ ] **Step 4: 在 `src/data.js` 最上方加入 client 與 auth**

```js
import { createClient } from "../vendor/supabase-js.js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const MSG = {
  invite:   "這個邀請碼不對，或是已經被用完了。跟你的組長要一組新的。",
  dupEmail: "這個 email 已經有護照了，直接登入就好。",
  shortPw:  "密碼至少要 6 個字。",
  offline:  "現在連不上資料庫。請寄信到 beyondtaiwan2020@gmail.com，資料都還在。",
  badLogin: "email 或密碼不對。忘記密碼的話寄信到 beyondtaiwan2020@gmail.com。",
  other:    "出了點狀況，再試一次。還是不行的話寄信到 beyondtaiwan2020@gmail.com。"
};

// 絕對不能把原始錯誤丟給高中生看（spec §6.1）。一律翻譯。
export function authMessage(err) {
  if (!err) return MSG.other;
  const m = String(err.message || "").toLowerCase();
  const s = Number(err.status || 0);

  if (err.name === "TypeError" || m.includes("failed to fetch") || m.includes("networkerror")) return MSG.offline;
  if (m.includes("password") && (m.includes("6") || m.includes("short") || m.includes("weak"))) return MSG.shortPw;
  if (m.includes("already registered") || m.includes("already been registered") || m.includes("user already")) return MSG.dupEmail;
  if (m.includes("invalid login credentials")) return MSG.badLogin;
  // trigger raise 之後 GoTrue 回通用 500「Database error saving new user」。
  // 這是唯一會讓 signUp 拋 500 的路徑，所以 500 一律視為邀請碼問題（spec §6.1）。
  if (s >= 500 || m.includes("database error")) return MSG.invite;
  return MSG.other;
}

export async function signUp(email, pw, invite) {
  const { data, error } = await supabase.auth.signUp({
    email, password: pw,
    options: { data: { invite: invite } }
  });
  if (error) throw new Error(authMessage(error));
  // Supabase 的「防止帳號列舉」設定開啟時，重複 email 不會回錯誤，
  // 而是回一個 identities 為空陣列的 user。這是 spec §6.1 沒有涵蓋的第三種形狀。
  if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error(MSG.dupEmail);
  }
  return data;
}

export async function signIn(email, pw) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });
  if (error) throw new Error(authMessage(error));
  return data;
}

export async function signOut() { await supabase.auth.signOut(); }

export async function currentUser() {
  const { data } = await supabase.auth.getUser();
  return (data && data.user) || null;
}
```

- [ ] **Step 5: 在 `src/ui.js` 加 `authHTML`**

只用既有的 `.card` / `label` / `.btn` / `.wnote`，不新增任何樣式（spec §3.4）。

```js
export function authHTML(mode, msg) {
  const up = mode === "up";
  return `<div class="card">
    <img src="./logo.png" alt="Beyond Taiwan" style="height:30px;display:block;margin-bottom:18px">
    <h2>${up ? "註冊 BT 護照" : "登入"}</h2>
    <div class="sub">${up ? "需要一組 BT 邀請碼。跟你的組長拿。" : "用你註冊時的 email 登入。"}</div>
    ${msg ? `<div class="wnote" style="margin:0 0 16px">${esc(msg)}</div>` : ""}
    <label><i>Email</i><input id="ae" type="email" autocomplete="email" placeholder="you@example.com"></label>
    <label><i>密碼 / Password${up ? "（至少 6 個字）" : ""}</i><input id="ap" type="password" autocomplete="${up ? "new-password" : "current-password"}"></label>
    ${up ? `<label><i>邀請碼 / Invite code</i><input id="ai" autocomplete="off" placeholder="跟組長拿"></label>` : ""}
    ${up ? `<div class="wnote" style="margin:0 0 16px">送出後，你的姓名、團隊、大頭照與蓋章紀錄會出現在全體進度牆上，<b>其他 BT 幹部看得到，包含你的大頭照</b>。你寫的心得和上傳的活動照片只留在你自己的護照裡，<b>其他幹部看不到</b>。</div>` : ""}
    <div class="row">
      <button class="btn" data-act="${up ? "do-signup" : "do-signin"}">${up ? "註冊" : "登入"}</button>
      <button class="btn ghost" data-act="switch-auth" data-m="${up ? "in" : "up"}">${up ? "我已經有帳號了" : "我有邀請碼，要註冊"}</button>
    </div>
    ${up ? "" : `<div class="wnote" style="margin:16px 0 0">忘記密碼？寄信到 beyondtaiwan2020@gmail.com，我們會幫你重設。你的資料都還在。</div>`}
  </div>`;
}
```

忘記密碼只有這一行提示，**不做**自助重設、**不做**重設畫面、**不呼叫** `resetPasswordForEmail`（spec §6.4）。

- [ ] **Step 6: 在 `src/main.js` 接上事件與啟動分支**

```js
if (act === "switch-auth") { S.authMode = b.dataset.m; S.authMsg = ""; render(); return; }

if (act === "do-signin" || act === "do-signup") {
  const email = document.getElementById("ae").value.trim();
  const pw = document.getElementById("ap").value;
  const inv = document.getElementById("ai") ? document.getElementById("ai").value.trim() : "";
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
```

`render()` 最前面加分支：

```js
function render() {
  const el = root();
  if (!S.user) { el.innerHTML = UI.authHTML(S.authMode || "in", S.authMsg); return; }
  if (!S.profile || !S.profile.name_zh && !S.profile.name_en) { el.innerHTML = UI.setupHTML(S.profile); return; }
  el.innerHTML = UI.barHTML(S) + (S.view === "wall" ? UI.wallHTML(S) : UI.bookHTML(S));
}
```

`barHTML` 加一顆登出：在 `.tabs` 之後、`.sp` 之前插入
`<button class="btn ghost sm" data-act="signout">登出</button>`。

- [ ] **Step 7: 準備測試用邀請碼**

在 SQL Editor：

```sql
insert into invite_codes (code, uses_left, note)
values ('TEST-ONCE', 1, '手動測試用，測完刪掉');
```

- [ ] **Step 8: 手動驗證五個情境**

`python3 -m http.server 8000`，開 `http://localhost:8000/`：

1. 註冊頁填 email + 密碼 `12345`（5 字）+ 任意碼 → **必須**看到「密碼至少要 6 個字。」
2. 填 email + `123456` + 邀請碼 `WRONG-CODE` → **必須**看到「這個邀請碼不對，或是已經被用完了。跟你的組長要一組新的。」
3. 用 `TEST-ONCE` 註冊 → 成功，進到申請護照畫面
4. 登出，用**同一個 email**再註冊一次（碼再發一組新的）→ **必須**看到「這個 email 已經有護照了，直接登入就好。」
5. 用 `TEST-ONCE`（已用完）再註冊一個新 email → **必須**看到邀請碼那句
6. 關掉網路（或把 `config.js` 的 URL 改成不存在的網域）再登入 → **必須**看到「現在連不上資料庫。請寄信到 beyondtaiwan2020@gmail.com，資料都還在。」
7. 登入頁底部**必須**看得到忘記密碼那一行，且信箱是 `beyondtaiwan2020@gmail.com`

任何一項出現英文原始錯誤訊息就是不通過。

- [ ] **Step 9: 確認無效註冊沒有留下 auth.users（spec §11-4）**

```sql
select email, created_at from auth.users order by created_at desc limit 10;
```

Expected: 只有情境 3 成功的那一個 email，情境 2、5 用的 email **不得出現**。

- [ ] **Step 10: 跑 check.sh**

```bash
./check.sh
```

Expected: 全部通過。特別確認 `§11-6 沒有 secret key` 與 `§11-20 只有組織信箱`。

- [ ] **Step 11: Commit**

```bash
git add src/ vendor/ index.html
git commit -m "feat(auth): 登入註冊與邀請碼，錯誤訊息全面翻譯成人話"
```

---

## Task 6: 儲存層換成 Supabase

**Files:**
- Modify: `src/data.js`（換掉六個函式的內容，簽名不動）
- Modify: `src/ui.js:idPageHTML`（護照號碼改吃 auth uuid）
- Modify: `src/main.js`（大頭照上傳時的再次告知）

**Interfaces:**
- Consumes: Task 1 的表、Task 5 的 `supabase` client
- Produces: 與 Task 4 完全相同的六個函式簽名。`ui.js` 與 `main.js` 除了下述兩處外**不需要改動** —— 這是拆檔設計的驗證點

- [ ] **Step 1: 換掉 `loadAll`**

```js
export async function loadAll() {
  const user = await currentUser();
  if (!user) return { profile: null, stamps: {}, entries: {}, activities: [], months: [] };

  const [mo, ac, pa, st, en] = await Promise.all([
    supabase.from("months").select("*").order("seq"),
    supabase.from("activities").select("*").eq("active", true).order("month"),
    supabase.from("passports").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("stamps").select("act_id, stamped_on").eq("user_id", user.id),
    supabase.from("entries").select("act_id, note, photo").eq("user_id", user.id)
  ]);

  const firstErr = [mo, ac, pa, st, en].find(r => r.error);
  if (firstErr) throw firstErr.error;

  const stamps = {};
  (st.data || []).forEach(r => { stamps[r.act_id] = { date: r.stamped_on }; });
  const entries = {};
  (en.data || []).forEach(r => { entries[r.act_id] = { note: r.note, photo: r.photo }; });

  return {
    profile: pa.data || null,
    stamps, entries,
    activities: ac.data || [],
    months: mo.data || []
  };
}
```

註冊 trigger 已預先建好 `passports` 那一列，所以這裡一定拿得到（除非是 trigger 之前註冊的舊帳號）。

- [ ] **Step 2: 換掉 `saveProfile` 與 `saveAvatar`**

`passports` 那一列由 trigger 建立，所以是 `update` 不是 `insert`（spec §5.1）。

```js
export async function saveProfile(p) {
  const user = await currentUser();
  if (!user) throw new Error("尚未登入");
  const { error } = await supabase.from("passports").update({
    name_zh: p.name_zh, name_en: p.name_en, team: p.team, motto: p.motto,
    updated_at: new Date().toISOString()
  }).eq("id", user.id);
  if (error) throw error;
}

export async function saveAvatar(dataUrl) {
  const user = await currentUser();
  if (!user) throw new Error("尚未登入");
  const { error } = await supabase.from("passports")
    .update({ avatar: dataUrl, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) throw error;
}
```

- [ ] **Step 3: 換掉 `saveStamp` 與 `removeStamp`**

章與心得分兩張表：章公開、心得私人（spec §5.1）。

```js
export async function saveStamp(actId, { date, note, photo }) {
  const user = await currentUser();
  if (!user) throw new Error("尚未登入");

  const s = await supabase.from("stamps")
    .upsert({ user_id: user.id, act_id: actId, stamped_on: date }, { onConflict: "user_id,act_id" });
  if (s.error) throw s.error;

  const e = await supabase.from("entries")
    .upsert({ user_id: user.id, act_id: actId, note: note || "", photo: photo || null },
            { onConflict: "user_id,act_id" });
  if (e.error) throw e.error;
}

export async function removeStamp(actId) {
  const user = await currentUser();
  if (!user) throw new Error("尚未登入");
  const e = await supabase.from("entries").delete().eq("user_id", user.id).eq("act_id", actId);
  if (e.error) throw e.error;
  const s = await supabase.from("stamps").delete().eq("user_id", user.id).eq("act_id", actId);
  if (s.error) throw s.error;
}
```

- [ ] **Step 4: 護照號碼改吃 auth uuid**

`passportNo` 函式本身不用改，但要確認 `idPageHTML` 讀的是 `S.profile.id`（=auth uuid），
而不是任何本地產生的值。護照號碼從此穩定不變（spec §7.2）。

確認沒有殘留：

```bash
grep -rn 'rid()\|Math.random\|nameZh\|nameEn\|hasAvatar\|hasPhoto' src/
```

Expected: 零命中。欄位名一律 snake_case，與資料表一致。

- [ ] **Step 5: 大頭照上傳時再次告知（spec §6.2）**

`main.js` 的 `avatar` 事件，在開檔案選擇器**之前**插入確認：

```js
if (act === "avatar") {
  if (!confirm("你的大頭照會出現在全體進度牆上，其他 BT 幹部看得到。要繼續上傳嗎？")) return;
  const i = document.createElement("input"); i.type = "file"; i.accept = "image/*";
  i.onchange = async () => {
    const f = i.files && i.files[0]; if (!f) return;
    try {
      const url = await compress(f, 420, 0.7);
      S.profile.avatar = url;
      render();
      await DATA.saveAvatar(url);
    } catch (err) { toast("這張圖存不下，換一張小一點的"); }
  };
  i.click(); return;
}
```

- [ ] **Step 6: 手動驗證持久化（spec §11-8、§11-9）**

`python3 -m http.server 8000`：

1. 登入 → 填護照資料 → 蓋一格章（含心得與照片）
2. **重新整理** → 章、心得、照片都還在
3. 開一個**無痕視窗**，同一組帳號登入 → 章還在（這就是「換一台裝置」）
4. 上傳大頭照 → **先跳出告知對話框** → 確認後上傳 → 重整後還在
5. 「撕掉這格」→ 重整 → 真的不見了

- [ ] **Step 7: 用 SQL 確認資料落在正確的表**

```sql
select * from stamps  order by created_at desc limit 5;
select act_id, left(note, 20) as note, (photo is not null) as has_photo from entries limit 5;
select id, name_zh, team, (avatar is not null) as has_avatar from passports;
```

Expected: 章在 `stamps`、心得與照片在 `entries`、大頭照在 `passports.avatar`。

- [ ] **Step 8: 重跑 RLS 測試確認沒有被改壞**

執行 `supabase/rls-test.sql`。
Expected: 兩行 PASSED，無 exception。

- [ ] **Step 9: Commit**

```bash
git add src/
git commit -m "feat(data): 儲存層換成 Supabase，護照號碼改吃 auth uuid"
```

---

## Task 7: 進度牆改查資料庫

**Files:**
- Modify: `src/data.js:loadWall`
- Modify: `src/ui.js:wallHTML`

**Interfaces:**
- Consumes: `passports`、`stamps` 的 RLS select 政策（登入者皆可）
- Produces: `loadWall()` 回傳陣列，元素含 `avatar`

原型的 `pushWall()` 與 `slist("wall:", true)` 整組刪除 —— 不再有 shared blob，進度牆直接 join 兩張表（spec §7.2）。

- [ ] **Step 1: 換掉 `loadWall`**

```js
export async function loadWall() {
  const { data, error } = await supabase
    .from("passports")
    .select("id, name_zh, name_en, team, avatar, stamps(act_id, stamped_on)");
  if (error) throw error;
  return (data || []).filter(p => p.name_zh || p.name_en);
}
```

`stamps(...)` 是 PostgREST 的內嵌關聯查詢，靠 `stamps.user_id → passports.id` 的 FK 自動推導。**不要**改成先查 passports 再逐人查 stamps —— 30 人就是 31 次往返。

- [ ] **Step 2: 改 `wallHTML` 吃新形狀**

`p.count` 改成 `(p.stamps||[]).length`，`p.stamps[].id` 改成 `.act_id`、`.d` 改成 `.stamped_on`，`p.nameZh` 改成 `p.name_zh`。排序與 feed 邏輯照原型。加上大頭照 —— 只用既有的 `.person` 樣式與一個 inline 的圓形裁切，不新增 class：

```js
const av = p.avatar
  ? `<img src="${p.avatar}" alt="" style="width:34px;height:34px;border-radius:50%;object-fit:cover;float:right;border:1px solid rgba(16,42,134,.2)">`
  : "";
```

`TOTAL` 從 `S.activities.length` 取，不寫死 33。

- [ ] **Step 3: 刪掉死掉的程式碼**

確認 `pushWall`、`slist`、`sget`、`sset`、`PKEY`、`S.wall` 以外的 shared 相關殘留全部刪乾淨：

```bash
grep -rn 'pushWall\|slist\|window.storage\|PKEY' src/ index.html
```

Expected: 零命中。

- [ ] **Step 4: 手動驗證（需要兩個帳號）**

1. 用帳號 A 蓋 2 格章，登出
2. 用帳號 B 登入、填資料、蓋 1 格章
3. 切到進度牆 → **兩個人都在**，A 顯示 2、B 顯示 1
4. A 有大頭照的話，B 看得到 A 的大頭照
5. **關鍵**：B 在進度牆上**看不到 A 的心得文字，也看不到 A 的活動照片**
6. 每個人的 `.track` 是 11 格

- [ ] **Step 5: 用 SQL 確認 B 真的讀不到 A 的 entries（spec §11-1）**

不是看畫面有沒有渲染，是資料庫真的回 0 列。在瀏覽器以 B 的身分開 console：

```js
const { data, error } = await (await import('./src/data.js')).supabase
  .from('entries').select('*');
console.log('B 看得到的 entries 列數：', data.length, data);
```

Expected: 只有 B 自己的列。A 的一列都沒有。

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "feat(wall): 進度牆改為 passports join stamps，刪除 shared blob"
```

---

## Task 8: 07B 的回望

**Files:**
- Modify: `src/main.js:openModal`
- Modify: `src/ui.js`（加 `callbackHTML`）

**Interfaces:**
- Consumes: `activities.callback_to`、`S.entries`、`S.stamps`
- Produces: `ui.js: callbackHTML(S, act)` 回傳字串，無回望時回空字串

由 `callback_to` 驅動，**不寫死 `07B`**。未來任何一格設了 `callback_to` 都自動有這個行為（spec §7.3）。

- [ ] **Step 1: 寫 `callbackHTML`**

只用既有的 `.wnote` 樣式（spec §3.4）。

```js
export function callbackHTML(S, act) {
  if (!act.callback_to) return "";
  const src = S.activities.find(a => a.id === act.callback_to);
  const label = src ? `你在${MONTH_ZH[src.month]}寫的` : "你之前寫的";
  const e = S.entries[act.callback_to];
  const st = S.stamps[act.callback_to];   // 日期取自 stamps，entries 沒有日期欄位

  if (!e || !e.note) {
    return `<div class="wnote" style="margin:0 0 16px">${esc(label.replace("你在", "你").replace("寫的", "沒有寫這格"))}。沒關係，這格照樣可以寫。</div>`;
  }
  return `<div class="wnote" style="margin:0 0 16px">
    <b>${esc(label)}</b>${st ? `　<span style="opacity:.7">${esc(st.date)}</span>` : ""}
    <div style="margin-top:6px;font-size:13px;opacity:.9">「${esc(e.note)}」</div>
  </div>`;
}
```

- [ ] **Step 2: 插進蓋章視窗，位置在題目上方**

`main.js` 的 `openModal`，在 `<p>` 描述之後、日期欄位之前插入 `${UI.callbackHTML(S, a)}`。

spec §7.3 要求「顯示在題目上方」—— 這裡的「題目」指的是要作答的輸入區。放在描述與輸入之間，使用者一眼看到九月寫的、接著就是今天要寫的，順序正確。

- [ ] **Step 3: 手動驗證兩條路徑（spec §11-12）**

有寫的情況：
1. 登入，到九月，`09B`「我是怎麼進來的」蓋章並寫一段心得，記下日期
2. 翻到七月，點 `07B`「現在還算數嗎」
3. **必須**在題目與輸入框之間看到「你在九月寫的」、當時的日期、以及那段文字的引用

沒寫的情況：
4. 換一個沒寫過 `09B` 的帳號，點 `07B`
5. **必須**看到「你九月沒有寫這格」之類的替代文案
6. **輸入框照樣可以打字、照樣可以蓋章**，不被阻擋

不寫死的驗證：
7. 在 SQL Editor 執行 `update activities set callback_to = '10B' where id = '06B';`
8. 重整，點 `06B` → 應該出現「你在十月寫的」的回望區塊
9. 執行 `update activities set callback_to = null where id = '06B';` 復原

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat(callback): 07B 打開時顯示 09B 的內容，由 callback_to 驅動"
```

---

## Task 9: 匯出與匯入

免費方案沒有自動備份，所以這是必要功能，不是加分項。**不能還原的備份不算備份**（spec §7.4）。

**Files:**
- Modify: `src/data.js`（加 `exportPassport`、`importPassport`）
- Modify: `src/ui.js:idPageHTML`（加兩顆按鈕）
- Modify: `src/main.js`（加事件）

**Interfaces:**
- Produces:
  - `async exportPassport(): Promise<object>` —— 回傳完整備份物件
  - `parseBackup(text): {version, exported_at, passport_no, stamps: Array}` —— 純函式，格式不對就 throw 人話
  - `async importPassport(backup, mode): Promise<{written:number}>` —— `mode` 為 `"overwrite"` 或 `"merge"`

- [ ] **Step 1: 寫 `exportPassport` 與 `parseBackup`**

```js
export const BACKUP_VERSION = 1;

export async function exportPassport() {
  const all = await loadAll();
  if (!all.profile) throw new Error("還沒有護照可以匯出。");
  return {
    version: BACKUP_VERSION,          // 供日後格式變更判斷（spec §7.4）
    exported_at: new Date().toISOString(),
    passport_no: passportNo(all.profile.id),
    profile: {
      name_zh: all.profile.name_zh, name_en: all.profile.name_en,
      team: all.profile.team, motto: all.profile.motto,
      avatar: all.profile.avatar, issued: all.profile.issued
    },
    // 章與心得合在一起，一個檔案就是完整備份，不需要 zip
    stamps: Object.keys(all.stamps).map(id => ({
      act_id: id,
      stamped_on: all.stamps[id].date,
      note: (all.entries[id] && all.entries[id].note) || "",
      photo: (all.entries[id] && all.entries[id].photo) || null
    }))
  };
}

// 格式不對時給人話，不丟 JSON parse 錯誤（spec §7.4）
export function parseBackup(text) {
  let j;
  try { j = JSON.parse(text); }
  catch (e) { throw new Error("這個檔案讀不出來，可能不是護照備份檔，或是在傳送過程中壞掉了。"); }
  if (!j || typeof j !== "object" || !Array.isArray(j.stamps) || !j.profile) {
    throw new Error("這是一個 JSON 檔，但不是護照備份檔。請選你從護照按「匯出備份」下載的那個檔案。");
  }
  if (Number(j.version) > BACKUP_VERSION) {
    throw new Error("這個備份檔來自比較新的版本，這個網站讀不了。請寄信到 beyondtaiwan2020@gmail.com。");
  }
  return j;
}
```

`passportNo` 在 Task 4 Step 5b 就已經放在 `data.js`，這裡直接用。

- [ ] **Step 2: 寫 `importPassport`**

**寫入目前登入的帳號，不是檔案裡記的那個 uuid** —— 換帳號也要能還原（spec §7.4）。

```js
export async function importPassport(backup, mode) {
  const user = await currentUser();
  if (!user) throw new Error("要先登入才能還原。");

  if (mode === "overwrite") {
    // entries 先刪（有 FK 指向同一組 act_id 的語意順序）
    const de = await supabase.from("entries").delete().eq("user_id", user.id);
    if (de.error) throw de.error;
    const ds = await supabase.from("stamps").delete().eq("user_id", user.id);
    if (ds.error) throw ds.error;
  }

  const rows = backup.stamps.filter(s => s.act_id && s.stamped_on);
  if (rows.length) {
    const s = await supabase.from("stamps").upsert(
      rows.map(r => ({ user_id: user.id, act_id: r.act_id, stamped_on: r.stamped_on })),
      { onConflict: "user_id,act_id" });
    if (s.error) throw s.error;

    const e = await supabase.from("entries").upsert(
      rows.map(r => ({ user_id: user.id, act_id: r.act_id, note: r.note || "", photo: r.photo || null })),
      { onConflict: "user_id,act_id" });
    if (e.error) throw e.error;
  }

  const p = backup.profile || {};
  const up = await supabase.from("passports").update({
    name_zh: p.name_zh, name_en: p.name_en, team: p.team,
    motto: p.motto, avatar: p.avatar,
    updated_at: new Date().toISOString()
  }).eq("id", user.id);
  if (up.error) throw up.error;

  return { written: rows.length };
}
```

`issued` 不還原 —— 核發日屬於這個帳號，不屬於備份檔。

- [ ] **Step 3: 加按鈕與事件**

`idPageHTML` 的 `.row` 加兩顆，沿用既有 `.btn ghost sm`：

```js
      <button class="btn ghost sm" data-act="export">匯出備份</button>
      <button class="btn ghost sm" data-act="import">匯入還原</button>
```

`main.js`：

```js
if (act === "export") {
  try {
    const b = await DATA.exportPassport();
    const blob = new Blob([JSON.stringify(b, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bt-passport-${b.passport_no}-${b.exported_at.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
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
    try { b = DATA.parseBackup(await f.text()); }
    catch (e) { alert(e.message); return; }

    // 匯入前顯示摘要（spec §7.4）
    const summary = `這個備份檔有 ${b.stamps.length} 個章，`
      + `匯出日期 ${String(b.exported_at).slice(0, 10)}，`
      + `原本屬於護照 ${b.passport_no}。`;
    const has = Object.keys(S.stamps).length;

    let mode = "overwrite";
    if (has > 0) {
      // 目前護照已有內容時，明確詢問覆蓋還是合併；預設覆蓋，並說清楚會蓋掉什麼
      mode = confirm(
        `${summary}\n\n`
        + `你現在的護照已經有 ${has} 個章。\n\n`
        + `按「確定」＝ 覆蓋：現在這 ${has} 個章、心得和照片會全部刪掉，換成備份檔裡的。\n`
        + `按「取消」＝ 合併：兩邊都留，同一格以備份檔的內容為準。`
      ) ? "overwrite" : "merge";
    } else if (!confirm(`${summary}\n\n要還原到你現在的帳號嗎？`)) {
      return;
    }

    try {
      const r = await DATA.importPassport(b, mode);
      toast(`還原了 ${r.written} 個章。`);
      await boot();
    } catch (e) { toast("還原失敗，資料沒有被改動。再試一次。"); }
  };
  i.click(); return;
}
```

- [ ] **Step 4: 手動驗證（spec §11-10、§11-11）**

完整還原：
1. 帳號 A 蓋滿至少 5 格，其中至少 2 格有照片、3 格有心得，並上傳大頭照
2. 按「匯出備份」→ 檔名應為 `bt-passport-BT#######-2026-08-16.json`
3. 逐格「撕掉這格」清空護照（或用 SQL `delete from stamps where user_id = '<A>'`）
4. 按「匯入還原」選那個檔案 → 摘要對話框顯示正確的章數與日期
5. 還原後：**章、心得、照片、大頭照全部回來**，數量與內容逐一比對

跨帳號還原：
6. 登入帳號 B（另一個測試帳號），匯入 A 的備份檔
7. 對話框應顯示「原本屬於護照 BT…」與 B 目前的章數
8. 選覆蓋 → 內容全部落在 B 名下
9. SQL 確認：`select user_id, count(*) from stamps group by user_id;` → 這些列的 `user_id` 是 **B 的 uuid**，不是檔案裡 A 的

壞檔案：
10. 隨便建一個 `bad.json` 內容 `{"hello":1}` → 匯入應看到「這是一個 JSON 檔，但不是護照備份檔…」
11. 建一個 `bad2.json` 內容 `not json at all` → 應看到「這個檔案讀不出來…」
12. 兩者都**不得**出現 `SyntaxError` 或任何英文錯誤

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "feat(backup): 匯出與匯入還原，含摘要、覆蓋/合併選擇與壞檔案處理"
```

---

## Task 10: 休眠與斷線的處理

**Files:**
- Modify: `src/main.js`（boot 的錯誤處理）
- Modify: `src/ui.js`（加 `downHTML`）

**Interfaces:**
- Produces: `ui.js: downHTML()`

**DB 連不上時前端不得空白**（spec §8.1）。

- [ ] **Step 1: 寫 `downHTML`**

```js
export function downHTML() {
  return `<div class="card">
    <img src="./logo.png" alt="Beyond Taiwan" style="height:30px;display:block;margin-bottom:18px">
    <h2>資料庫休眠中</h2>
    <div class="wnote" style="margin:16px 0 0">
      資料庫休眠中，你的資料都還在。請寄信到 beyondtaiwan2020@gmail.com 請人恢復。
    </div>
    <div class="row"><button class="btn ghost" data-act="retry">再試一次</button></div>
  </div>`;
}
```

文案逐字照 spec §8.1，不放任何個人姓名或個人聯絡方式。

- [ ] **Step 2: boot 包錯誤處理**

```js
async function boot() {
  try {
    S.user = await DATA.currentUser();
    if (!S.user) { render(); return; }
    const all = await DATA.loadAll();
    S.activities = all.activities;
    S.months = all.months;
    S.profile = all.profile;
    S.stamps = all.stamps;
    S.entries = all.entries;
    S.down = false;
  } catch (e) {
    S.down = true;
  }
  render();
}
```

`render()` 最前面加：`if (S.down) { el.innerHTML = UI.downHTML(); return; }`
click 委派加：`if (act === "retry") { S.down = false; render(); await boot(); return; }`

- [ ] **Step 3: 手動驗證（spec §11-19）**

1. 把 `src/config.js` 的 `SUPABASE_URL` 改成 `https://this-project-does-not-exist.supabase.co`
2. 重整頁面
3. **必須**看到休眠訊息，**不得**是空白畫面、不得是 console 錯誤而畫面停在「載入護照中…」
4. 訊息裡的信箱是 `beyondtaiwan2020@gmail.com`，沒有任何人名
5. 改回正確 URL，按「再試一次」→ 正常載入

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat(resilience): DB 連不上時顯示休眠訊息而非空白畫面"
```

---

## Task 11: 部署與保活

**Files:**
- Create: `.github/workflows/ping.yml`
- Verify: `CNAME`（Task 4 已建）

**Interfaces:**
- Consumes: Supabase 專案的 URL 與 publishable key，存為 GitHub repo secrets

- [ ] **Step 1: 寫 `.github/workflows/ping.yml`**

```yaml
# Supabase 免費方案閒置 7 天會暫停。本站是月頻使用，一定會踩到。
# 這個 workflow 每天對 activities 做一次 count 查詢，讓專案保持活著。
# 停掉這個 workflow，網站會在某個沒人用的兩週後變成空白。不要停。
name: ping supabase

on:
  schedule:
    - cron: "17 3 * * *"     # 每天 UTC 03:17（台灣 11:17）
  workflow_dispatch:          # 也可以在 Actions 頁面手動按

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: count activities
        run: |
          code=$(curl -s -o /tmp/out.txt -w '%{http_code}' \
            "${{ secrets.SUPABASE_URL }}/rest/v1/activities?select=id&limit=1" \
            -H "apikey: ${{ secrets.SUPABASE_PUBLISHABLE_KEY }}" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_PUBLISHABLE_KEY }}")
          echo "HTTP $code"
          cat /tmp/out.txt
          if [ "$code" != "200" ] && [ "$code" != "401" ] && [ "$code" != "406" ]; then
            echo "資料庫沒有回應，可能已經休眠。去 Supabase 後台恢復專案。"
            exit 1
          fi
```

`activities` 的 select 政策限 `authenticated`，所以未登入的 ping 會拿到 401 —— **這仍然算成功**，因為請求有打到資料庫，休眠計時器已重置。只有連不上（000、502、503）才算失敗。

- [ ] **Step 2: 設 GitHub secrets**

repo → Settings → Secrets and variables → Actions → New repository secret：
- `SUPABASE_URL` = `https://<專案代號>.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_…`

即使 publishable key 本來就是公開的，放 secret 是為了 workflow 檔案在 fork 時不帶著走。**不要**在這裡放 secret key。

- [ ] **Step 3: 開啟 GitHub Pages**

repo → Settings → Pages → Source 選 **Deploy from a branch** → Branch `main` / `(root)`。
不用 Actions 建置 —— 本專案沒有建置步驟，多一層只會多一個壞掉的地方（spec §8）。

- [ ] **Step 4: 驗證部署**

1. push 到 main，等 1–2 分鐘
2. 開 `https://passport.beyondtaiwannpo.com/` → 應看到登入畫面
3. 開瀏覽器 DevTools → Network → 確認 `logo.png`、`src/*.js`、`vendor/supabase-js.js` 都是 200
4. Network 面板篩 `fonts` → **只有** Barlow Condensed 與 Inter 的請求，沒有任何中文字體（spec §11-15）
5. 完整跑一次：註冊 → 填資料 → 蓋章 → 重整 → 章還在

- [ ] **Step 5: 驗證保活 workflow**

Actions 分頁 → ping supabase → Run workflow → 手動觸發一次。
Expected: 綠勾，log 顯示 `HTTP 200` 或 `HTTP 401`。

- [ ] **Step 6: 確認 CNAME 沒掉**

```bash
cat CNAME
./check.sh
```

Expected: `passport.beyondtaiwannpo.com`，check.sh 的 `CNAME 存在` 通過。
Pages 設定頁的 Custom domain 欄位也應顯示同一個網域。

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/ping.yml
git commit -m "feat(deploy): 每日保活 workflow 與 GitHub Pages 設定"
```

---

## Task 12: README

寫給**非工程背景的接手者**，不是寫給工程師（spec §9）。假設讀者沒寫過程式、沒用過 Supabase、只想把事情辦完。

**Files:**
- Create: `README.md`

- [ ] **Step 1: 寫 README，八個必備段落**

每一段都要有**實際的點擊路徑**，不能只寫「去後台處理」。實作時先自己在後台走一遍，把真實看到的選單名稱抄下來 —— 介面文字與這份計畫寫的若有出入，以實際看到的為準。

必備結構：

```markdown
# BT Passport

Beyond Taiwan 內部幹部用的數位護照。學年制，9 月到隔年 7 月，33 格，
完成一格蓋一個章。約 30 位幹部使用。不是給學員 (mentee) 用的。

網站：https://passport.beyondtaiwannpo.com

## 這份文件給誰看
接手管理這個護照的人。不需要會寫程式。

## 護照管理者
目前的管理者：______（姓名）／任期 ______
交接時請更新這一行，並確認新的人拿得到下面三個帳號。

## 三個帳號都掛在組織信箱底下
GitHub、Supabase、網域，全部掛 beyondtaiwan2020@gmail.com。
不要換成個人帳號，否則明年交接會斷。

## 怎麼改活動文案
## 怎麼發新邀請碼
## 怎麼關閉 email 確認
## 專案休眠後怎麼恢復
## 為什麼金鑰可以放在原始碼裡
## 不要刪活動
## 管理者怎麼處理帳號問題
## 上線前的必要確認
## 出事的時候
```

- [ ] **Step 1b: 「上線前的必要確認」**

放在 README 開頭附近，不要埋在最底下 —— 這是擋在開放註冊之前的門。

```markdown
## 上線前的必要確認

> **上線前必須先取得 President / VP 對活動內容的確認。**
>
> 資料庫裡目前的 33 格活動內容是草案。在 President / VP 確認之前：
>
> - 不要發出任何邀請碼
> - 不要把網址給幹部
>
> 確認之後，把確認日期記在這裡：確認日 ______
```

- [ ] **Step 2: 「怎麼改活動文案」（spec §9-2）**

```markdown
## 怎麼改活動文案

課程組要改題目或活動說明，不用改程式，直接改資料庫，改完重整網頁就生效。

1. 登入 https://supabase.com（用組織信箱）
2. 左邊選單點 Table Editor
3. 選 `activities` 這張表
4. 像編試算表一樣直接點格子改：
   - `title_zh` 中文標題
   - `title_en` 英文標題（會印在印章上，建議全大寫、不要太長）
   - `description` 底下那行說明
5. 改完點空白處存檔，重整護照網站就看得到

**不要改 `id`。** 它是每一格的身分證，改了大家已經蓋的章會對不上。
```

- [ ] **Step 3: 「怎麼發新邀請碼」（spec §9-3）**

```markdown
## 怎麼發新邀請碼

沒有邀請碼就沒辦法註冊，這是擋住外人的唯一一道門。

1. Supabase → Table Editor → `invite_codes`
2. 點 Insert → Insert row
3. 填三欄：
   - `code`：碼本身。建議好念好打，例如 `BT-CURRICULUM-01`
   - `uses_left`：可以用幾次。**發給一個人就填 1**
   - `note`：發給誰，寫給人看的，例如「給課程組小明」
4. Save

**碼是逐字比對的，大小寫算數。** 你在 `code` 欄位打成什麼樣，學生就得打成什麼樣 ——
`bt2026test` 和 `BT2026TEST` 是兩組不同的碼。前後空白會被系統自動去掉，其他都不會。

建議一律用同一種寫法（例如全小寫、用連字號分段：`bt-curriculum-01`），
並且**用複製貼上的方式把碼給學生**，不要用口頭或截圖 —— 打錯一個字母就進不來，
而畫面上的訊息只會說「這個邀請碼不對」，不會告訴他錯在哪個字。

一組碼給一個人。要發給五個人就建五列，不要建一列 `uses_left = 5` ——
那樣沒辦法知道是誰用掉的。

碼用完之後 `uses_left` 會自動變成 0，那一列可以留著當紀錄。

### 不用發備用碼

**失敗的註冊不會消耗邀請碼。**（2026-08-17 在正式專案實測過，不是猜的。）

只有「註冊成功」會把 `uses_left` 減 1。以下情況通通不會扣：

- email 已經註冊過
- 邀請碼打錯
- 邀請碼已經用完
- 密碼太短

所以九月發碼時，**一個人一組、`uses_left = 1` 就夠**，不用因為怕學生打錯而多發。
同一個人拿同一組碼重試幾次都不會把它燒掉。

有人說「我的碼不能用了」，先查那一列的 `uses_left`：

- 還是 1 → 碼沒問題。八成是**大小寫或字母打錯**（見上面），其次是 email 打錯。
  請他把碼複製貼上，不要手打
- 已經是 0 → 那組碼真的被人成功註冊掉了。查 `auth.users` 看是誰用的，
  可能是他自己註冊過忘了，也可能是碼被轉給別人。確認之後再發新的

### 「這個邀請碼不對」不一定真的是邀請碼的問題

畫面上那句話涵蓋的範圍比字面大。**任何**伺服器端的錯誤都會顯示成這一句 ——
因為在前端看起來，「邀請碼對不到」和「資料庫出了別的問題」回傳的東西一模一樣，
分不出來。

所以碼確定沒問題、學生也確定沒打錯時，往這幾個方向查：

1. Supabase 後台 → Logs → Auth，看那個時間點的真實錯誤
2. 專案是不是休眠了（見「專案休眠後怎麼恢復」）
3. 請對方按 F12 打開瀏覽器主控台再試一次 —— 原始錯誤會印在那裡
```

- [ ] **Step 4: 「怎麼關閉 email 確認」（spec §9-4）**

```markdown
## 怎麼關閉 email 確認

新專案預設開著，開著的話幹部註冊完會卡在等信，而信多半寄不到。必須關掉。

1. Supabase → 左下角 Project Settings（齒輪）
2. Authentication → Sign In / Providers
3. 找到 Email，點開
4. 把 **Confirm email** 關掉
5. Save

（如果介面改版找不到，關鍵字就是 "Confirm email"，在 Email provider 底下。）
```

- [ ] **Step 5: 「專案休眠後怎麼恢復」（spec §9-5）**

```markdown
## 專案休眠後怎麼恢復

Supabase 免費方案閒置 7 天會把專案暫停。**資料不會不見**，
但網站會顯示「資料庫休眠中」。

1. 登入 Supabase
2. 首頁的專案卡片上會寫 Paused，點進去
3. 按 **Restore project**
4. 等 2–5 分鐘，重整護照網站

恢復之後請順手確認保活還在跑：
GitHub repo → Actions → 「ping supabase」→ 最近有沒有綠勾。
沒有的話手動按一次 Run workflow。
```

- [ ] **Step 6: 「為什麼金鑰可以放在原始碼裡」（spec §9-6、§4.1）**

```markdown
## 為什麼金鑰可以放在原始碼裡

有人看到 `src/config.js` 裡有一長串金鑰會嚇一跳，以為外洩了。沒有。

那個是 **publishable key**（`sb_publishable_` 開頭），它就是設計成公開的，
任何打開網頁的人都拿得到，這是正常的。它只能做「已登入的人可以做的事」，
真正擋住別人看你心得的是資料庫裡的 RLS 規則，不是這把金鑰。

**但是** —— 另外有一種 **secret key**（`sb_secret_` 開頭），
那把會繞過所有規則，拿到就等於拿到全部人的心得和照片。

- 絕對不要把 secret key 放進程式碼、放進 GitHub、貼進群組、或截圖露出來
- 這個專案完全不需要 secret key
- 如果哪天覺得「好像要用 secret key 才做得到」，那是規則寫錯了，去修規則

### 不要照著錯誤訊息裡的「hint」做

資料庫拒絕存取時，回來的訊息常常附一個 `hint` 欄位，直接告訴你怎麼把限制解除。例如：

> `permission denied for table invite_codes`
> hint: `Grant the required privileges to the current role with: GRANT SELECT ON public.invite_codes TO authenticated;`

**那句 hint 不要照做。** 它是資料庫在機械式地告訴你「怎麼讓這個錯誤消失」，
不是在建議你該怎麼做。`invite_codes` 讀不到就是我們刻意設計的 ——
照著做等於把全部邀請碼公開給每一個登入的人。

遇到 `permission denied`，正確的反應是問「為什麼這裡會需要讀這張表」，
不是把權限開下去。
```

- [ ] **Step 7: 「不要刪活動」（spec §9-7）**

```markdown
## 不要刪活動

某一格不辦了，**不要刪除那一列**。已經有人蓋過章的話，刪掉會連他的章
和心得一起弄壞。

正確做法：Table Editor → `activities` → 那一列的 `active` 改成 `false`。
它就不會再出現在護照上，但已經蓋過的人資料還在。

## Supabase 的 SQL Editor 有兩個要先知道的限制

第一次貼 SQL 進去的人一定會踩到這兩件事，先講：

**1. 它只顯示「最後一句」的結果。** 一份腳本裡有十句，前面九句的輸出你都看不到。
所以 `supabase/rls-test.sql` 的最後一句是一個 `select`，把 25 條檢查整理成一張表 ——
不是因為那樣比較好看，是因為不那樣做你就什麼都看不到。

**2. 它不顯示 `raise notice`。** PostgreSQL 的 `notice` 走的是另一條訊息通道，
SQL Editor 不會呈現。**不要叫人去找 notice 訊息，那裡永遠是空的。**
腳本跑完只看到「Success. No rows returned」不代表成功，只代表最後一句沒有回傳資料。

所以判斷 `rls-test.sql` 有沒有過，看的是那張表的第一列 `OVERALL 全部測試`：

- `PASS` → 25 條全過
- `FAIL` → 往下看，失敗的列會被排在最上面，`expected` 與 `actual` 兩欄會告訴你差在哪

## 要改資料表結構的話

`supabase/schema.sql` 的檔頭寫著「可以重複執行」，那句話只保證**重跑不會弄壞資料**。

它**不保證會更新結構**。`create table if not exists` 遇到已經存在的表就整個跳過，
不會比對欄位、不會補欄位、也不會報錯 —— 你會以為改好了，其實資料庫還是舊的。

所以：**資料庫已經有真實資料之後，要改欄位、改型別、改約束，一律另外寫一段
`alter table …` 執行，不要改 `schema.sql` 再重跑。** 改完之後也把 `schema.sql`
一起更新，讓它對新專案仍然正確。

（`create policy` 與 `create or replace function` 那些是會更新的 —— 它們寫了
`drop policy if exists` 與 `or replace`。會靜默跳過的只有「表和欄位」。）
```

- [ ] **Step 8: 「管理者怎麼處理帳號問題」（spec §9.2）**

這一節逐項照 spec §9.2 的表格寫，包含自律規範。

```markdown
## 管理者怎麼處理帳號問題

### 先講規矩

你在 Supabase 後台看得到所有人的心得和照片。這是後台權限的必然，
不是你可以看的意思。

- **不因為好奇去翻別人的心得。** 只有在對方主動求助時才進去，而且要先告訴他
- 幫人重設密碼之後，立刻把密碼從你的對話紀錄、筆記裡刪掉
- 不要把後台截圖貼進群組 —— 截圖常常連金鑰一起入鏡

護照裡有未成年幹部寫的東西。他們是相信這件事才寫的。

### 逐項處理

**「我忘記密碼了」**
1. Supabase → Authentication → Users
2. 搜尋他的 email
3. 那一列右邊的 `⋯` → 設定新密碼
4. **私訊**告訴他，不要在群組發

**「我 email 打錯了／要換 email」**
Authentication → Users → 改 email。
章和心得是綁在帳號上的，換 email 不影響，資料不會不見。

**「我想改姓名／團隊／護照上那句話」**
請他自己在護照的資料頁按「編輯資料」改。
真的改不動再由你去 Table Editor → `passports` 改。

**「我要一組邀請碼」**
看上面「怎麼發新邀請碼」。

**「我不小心註冊了兩個帳號」**
1. 先確認哪一個有章（Table Editor → `stamps`，看 `user_id`）
2. 刪掉沒有章的那個：Authentication → Users → 該列 `⋯` → Delete user
3. 章和心得會跟著一起清掉，這是設計好的

**「我要離開 BT，請刪掉我的資料」**

> **順序不能反。刪帳號的那一刻，他的章、心得、照片全部一起消失，救不回來。**
>
> 資料表是 `on delete cascade` 設計的：刪掉 `auth.users` 那一列，`passports`、
> `stamps`、`entries` 裡屬於他的每一列都會被連帶刪除。這是刻意的（他要求刪資料，
> 就該刪乾淨），但也表示**先刪帳號再想到要備份就來不及了**。免費方案沒有自動備份，
> 資料庫裡也不會留副本。

1. **先請他自己匯出。** 護照資料頁 → 「匯出備份」→ 下載 JSON 檔。
   **等他回報「檔案拿到了」再往下做。** 不要你幫他匯出，也不要跳過這步
2. 他說不需要備份的話，跟他確認一次：「刪掉之後這一年的章和心得都回不來，確定嗎？」
3. 確認之後：Authentication → Users → 該列 `⋯` → Delete user
4. 刪完不要再問「要不要復原」—— 沒有復原這個選項

**「我的章不見了」**
1. 先問他是不是登錯帳號 —— 這是最常見的原因，尤其是註冊過兩次的人
2. 真的不見再查 Table Editor → `stamps`，用他的 `user_id` 篩
3. 如果他有匯出過備份檔，請他用「匯入還原」自己救回來

**「網站整個打不開」**
多半是專案休眠，看上面「專案休眠後怎麼恢復」。

### 不要自己做管理後台

這些操作一年只會發生幾次。Supabase 內建的後台夠用了。
自己做一個管理畫面等於多一份要維護的程式碼，還要另外處理權限，不划算。
```

- [ ] **Step 9: 「出事的時候」**

```markdown
## 出事的時候

網站壞掉、資料看起來不見了、有人回報怪事 —— 先做這三件事，不要慌：

1. **資料幾乎不可能真的不見。** Supabase 的資料在暫停狀態下也還在
2. 到 Supabase → Table Editor → `stamps`，看看列數還在不在。在就沒事
3. 寄信到 beyondtaiwan2020@gmail.com 找人幫忙

給幹部的統一說法：「資料都還在，正在處理。」不要讓大家以為心得沒了。
```

- [ ] **Step 10: 找一個非工程背景的人實測（spec §11-21）**

請一位沒碰過這個專案、也不寫程式的人，只拿 README，照著「我忘記密碼了」那段
獨力完成一次代重設。全程不提示。

Expected: 能完成。過程中任何一次「這裡看不懂」或「找不到那個按鈕」，都回去改
README 那一句，不是口頭解釋給他聽。

- [ ] **Step 11: Commit**

```bash
git add README.md
git commit -m "docs: README 寫給非工程背景接手者，含管理者帳號問題流程"
```

---

## Task 13: 全量驗收

把 spec §11 的 21 條逐條跑過，留下證據。**不接受「看起來沒問題」**（spec §11）。

**Files:**
- Create: `docs/superpowers/plans/2026-08-16-acceptance.md`（驗收紀錄）

- [ ] **Step 1: 跑自動化的部分**

```bash
./check.sh
```
Expected: 全部通過。這覆蓋 §11 的 6、7、14、15、20（部分）。

在 SQL Editor 執行 `supabase/rls-test.sql`。
Expected: `ALL RLS TESTS PASSED` + `TRIGGER TESTS PASSED`。覆蓋 §11 的 1–5。

- [ ] **Step 2: 用真的兩個帳號再驗一次 entries 隔離**

自動化測試用的是模擬的 JWT claims。這裡用真的登入 session 再驗一次，因為
真實 session 走的是完整的 GoTrue 路徑。

以帳號 B 登入正式網站，開 console：

```js
const { supabase } = await import('./src/data.js');
const { data } = await supabase.from('entries').select('user_id, act_id, note');
console.table(data);
```

Expected: 每一列的 `user_id` 都是 B 自己的。A 的一列都沒有。**這是最重要的一條。**

- [ ] **Step 3: 逐條走完功能項（§11 的 8–13）**

| 條 | 動作 | 通過條件 |
|---|---|---|
| 8 | 蓋章 → 重整 | 章還在 |
| 9 | 蓋章 → 無痕視窗登入同帳號 | 章還在 |
| 10 | 匯出 → 清空 → 匯入 | 33 格的章、心得、照片、大頭照全回來 |
| 11 | A 的備份在 B 匯入 | 內容落在 B 名下，SQL 確認 `user_id` |
| 12 | 開 `07B` | 顯示 `09B` 內容；`09B` 空白時顯示替代文案且不阻擋 |
| 13 | 後台代設密碼 → 用新密碼登入 | 登得進去，章與心得完好 |

- [ ] **Step 4: 逐條走完視覺項（§11 的 16–18）**

16. logo：在 DevTools 檢查 `logo.png` 的 `<img>`，**不得**有 `filter`、`opacity`、
    `transform`，寬高比例與原檔一致
17. reduced-motion：系統設定開啟「減少動態」→ 重整 → 蓋章沒有落下動畫、翻頁沒有滑入
18. 登入頁的忘記密碼提示：用的是 `.wnote`，沒有新 class、沒有新色碼

- [ ] **Step 5: 逐條走完韌性項（§11 的 19–21）**

19. 把 config 的 URL 改壞 → 顯示休眠訊息不是空白（改回來）
20. 全站搜一次個人資訊：
```bash
grep -rIn '@' index.html src/ README.md | grep -v 'beyondtaiwan2020@gmail.com' | grep -v '@example.com'
```
Expected: 零命中，或只有非信箱的 `@`（如 CSS 的 `@media`）。
21. Task 12 Step 10 的非工程人員實測已通過

- [ ] **Step 6: 寫驗收紀錄**

建 `docs/superpowers/plans/2026-08-16-acceptance.md`，21 條逐條記：條號、做了什麼、
結果、日期。失敗過又修好的，寫下原本錯在哪 —— 明年接手的人會需要。

- [ ] **Step 7: 清掉測試資料**

```sql
delete from invite_codes where note like '%測試%' or note like '%test%';
-- 測試帳號：在 Authentication → Users 手動刪除 rlstest-* 與你自己開的測試帳號
```

確認正式的邀請碼已經按實際要發的人數建好。

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/plans/2026-08-16-acceptance.md
git commit -m "docs: spec §11 驗收紀錄，21 條逐條實測"
```

---

## 執行順序與依賴

```
Task 1 (schema+RLS) → Task 2 (trigger) → Task 3 (seed)
                                              ↓
Task 4 (拆檔+視覺修正，不依賴 DB) ────────────┤
                                              ↓
                                        Task 5 (auth)
                                              ↓
                                        Task 6 (換儲存層)
                                              ↓
                    ┌─────────────┬───────────┼───────────┐
                    ↓             ↓           ↓           ↓
              Task 7 (牆)   Task 8 (回望)  Task 9 (匯出匯入)  Task 10 (休眠)
                    └─────────────┴───────────┴───────────┘
                                              ↓
                                    Task 11 (部署) → Task 12 (README) → Task 13 (驗收)
```

Task 4 不依賴 1–3，可以與資料庫的部分平行做。Task 7、8、9、10 彼此獨立，做完 Task 6 之後可以平行。

## 未決事項

執行過程中若碰到以下情況，**停下來問，不要自己決定**：

1. **spec §6.1 的錯誤判斷方式與實際不符。** spec 寫「email 重複由 GoTrue 以 4xx 回報」，但 Supabase 若開著「防止帳號列舉」，重複 email 會回 200 且 `identities` 為空陣列。Task 5 的程式碼兩種都處理了，但如果實測發現第三種形狀，回報並更新 spec §6.1
2. **中文字體。** spec §3.2 說此判斷已送 Marketing Director 確認，「在回覆前照此實作」。若期間收到回覆要求載入中文字體，那會推翻 §3.2 與 §11-15，必須先改 spec 再改程式
3. **活動文案。** spec 末行：未經 Marketing Director 與 President / VP 確認前不得對外公布。Task 3 的 seed 是草案內容，正式開放給幹部註冊之前要先確認
