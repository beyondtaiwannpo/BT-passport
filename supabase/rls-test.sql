-- BT Site RLS 與角色升級 驗收測試　2026-09-01 改寫
--
-- 用法：整份貼進 Supabase SQL Editor 執行，在 schema.sql 與 migrations 之後。
-- 跑完在 Results 直接看到一張結果表，失敗的列排在最上面，
-- 第一列固定是 OVERALL —— 只看它就知道有沒有全過。
--
-- ============================================================================
-- ★ 讀這一份之前一定要先懂的一件事
-- ============================================================================
-- **每一條「讀得到」的正向測試，都是「讀不到」那幾條的對照組。**
--
-- 這份測試裡有大量「乙讀不到甲的東西，0 列」型的斷言。它們有一個共同的失敗模式：
-- **當受測帳號其實什麼都讀不到的時候，它們全部都會通過。** 角色設錯、RLS 寫太緊、
-- 政策掛在錯的表上、測試帳號根本沒被建出來 —— 每一種都會讓整份測試變成全綠，
-- 而它證明的是「這個帳號什麼都看不到」，不是「隔離有效」。
--
-- 所以每一組負向測試旁邊都配了正向的對照：
--   乙讀不到甲的 entries（0 列）  ←→  乙讀得到自己的 entries（1 列）
--   學員讀不到別人的 profiles（0）←→  學員讀得到自己的 profiles（1）
--   學員改不動自己的 role         ←→  學員改得動自己的 name_zh
-- **不要因為「正向的那條本來就會過」而刪掉它。** 它存在的理由不是測那個功能，
-- 是證明旁邊那條 0 列不是因為什麼都讀不到。
--
-- ============================================================================
-- ★ 測試帳號的角色一律明寫，不准依賴 default
-- ============================================================================
-- profiles.role 的 default 在階段 5-7 會從 'cadre' 改成 'student'。
-- 如果這份測試靠 default 拿到 cadre，那一天所有 RLS 測試會集體變成學員視角，
-- 然後全綠 —— 正是上面那個失敗模式。
-- 所以下面每一個測試帳號建立之後都有一句 update profiles set role = ...，
-- **那幾句不是多餘的，不要因為「反正 default 就是 cadre」把它們拿掉。**
--
-- ============================================================================
-- 為什麼不用 raise notice、為什麼不包在交易裡
-- ============================================================================
-- SQL Editor 只顯示「最後一句」的結果，raise notice 走另一個訊息通道不會顯示。
-- 所以每一條的結果寫進一張暫存表，最後一句 select 撈出來。
-- 也因為要讓最後那句 select 看得到結果，不能包在 begin ... rollback 裡 ——
-- rollback 會把結果表一起復原掉。改用「開頭先清、結尾再清」做到可重複執行。
--
-- 清理只認下面那組固定的測試 UUID，以及正規化之後以 RLSTEST- 開頭的邀請碼，
-- 碰不到任何真實資料。中途硬錯誤（紅色訊息、腳本沒跑完）有可能留下測試資料，
-- 那不用手動清，把這個檔案再跑一次就會清掉。
-- ============================================================================

-- ---------- 0. 先清乾淨 ----------
reset role;
select set_config('request.jwt.claims', '', false);

drop table if exists pg_temp.rls_result;

-- 子表先刪、父表後刪。auth.users 那句其實會連帶清掉全部（一路 on delete cascade），
-- 這裡還是一句一句寫出來，是為了讓「這個檔案會動到哪些表」一看就清楚。
delete from entries   where user_id in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000004','eeeeeeee-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000011','22222222-0000-0000-0000-000000000012','33333333-0000-0000-0000-000000000013','44444444-0000-0000-0000-000000000014','55555555-0000-0000-0000-000000000055','66666666-0000-0000-0000-000000000066');
delete from stamps    where user_id in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000004','eeeeeeee-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000011','22222222-0000-0000-0000-000000000012','33333333-0000-0000-0000-000000000013','44444444-0000-0000-0000-000000000014','55555555-0000-0000-0000-000000000055','66666666-0000-0000-0000-000000000066');
delete from visas     where user_id in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000004','eeeeeeee-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000011','22222222-0000-0000-0000-000000000012','33333333-0000-0000-0000-000000000013','44444444-0000-0000-0000-000000000014','55555555-0000-0000-0000-000000000055','66666666-0000-0000-0000-000000000066');
delete from passports where id      in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000004','eeeeeeee-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000011','22222222-0000-0000-0000-000000000012','33333333-0000-0000-0000-000000000013','44444444-0000-0000-0000-000000000014','55555555-0000-0000-0000-000000000055','66666666-0000-0000-0000-000000000066');
delete from profiles  where id      in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000004','eeeeeeee-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000011','22222222-0000-0000-0000-000000000012','33333333-0000-0000-0000-000000000013','44444444-0000-0000-0000-000000000014','55555555-0000-0000-0000-000000000055','66666666-0000-0000-0000-000000000066');
delete from auth.users where id     in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000004','eeeeeeee-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000011','22222222-0000-0000-0000-000000000012','33333333-0000-0000-0000-000000000013','44444444-0000-0000-0000-000000000014','55555555-0000-0000-0000-000000000055','66666666-0000-0000-0000-000000000066');
delete from invite_codes where upper(btrim(code)) like 'RLSTEST-%';

-- ---------- 1. 結果表 ----------
create temp table rls_result (
  ord       int,
  test_name text,
  expected  text,
  actual    text,
  ok        boolean
);
grant all on rls_result to authenticated;

-- ---------- 2. 準備測試資料 ----------
-- 邀請碼。RLSTEST-SETUP 給建帳號用（註冊 trigger 現在還會驗），
-- 其餘給 claim_invite 的測試用。四組大小寫／空白的碼刻意用四種不同的存法。
insert into invite_codes (code, uses_left, note) values
  -- 次數給得寬鬆是刻意的。這一段建 8 個帳號、下面註冊測試再建 1 個，
  -- 剛好給 9 的話，之後多加一個測試帳號就會冒出一個跟邀請碼無關的失敗，
  -- 而且錯誤訊息會指向「邀請碼不對」，很難查。
  ('RLSTEST-SETUP',    20, 'rls test 用，建測試帳號'),
  ('RLSTEST-CLAIM',     1, 'rls test 用，claim_invite 的有效碼'),
  ('RLSTEST-SECOND',    1, 'rls test 用，確認「已經是幹部」不會扣掉它'),
  ('rlstest-lower',     1, 'rls test 用，故意存小寫，使用者會打大寫'),
  ('RLSTEST-UPPER',     1, 'rls test 用，故意存大寫，使用者會打小寫'),
  ('RLSTEST-TRIM',      1, 'rls test 用，使用者會在前後多打空白'),
  ('  RLSTEST-PAD  ',   1, 'rls test 用，存進去的時候前後就帶著空白');

-- 建帳號。註冊 trigger 會連帶建好 profiles 與 passports 兩列。
-- 若這裡報 "null value in column ... violates not-null constraint"，代表你們專案的
-- auth.users 比這份測試多幾個必填欄位（版本之間會有差異），照錯誤訊息把欄位補進
-- 下面的清單即可，隨便給個合理的值 —— 這幾列只是讓 FK 有東西可以指。
insert into auth.users (id, email, encrypted_password, created_at, updated_at,
                        raw_user_meta_data, aud, role)
values
  ('aaaaaaaa-0000-0000-0000-000000000001','rlstest-a@example.com','x',now(),now(),'{"invite":"RLSTEST-SETUP"}','authenticated','authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002','rlstest-b@example.com','x',now(),now(),'{"invite":"RLSTEST-SETUP"}','authenticated','authenticated'),
  ('55555555-0000-0000-0000-000000000055','rlstest-s@example.com','x',now(),now(),'{"invite":"RLSTEST-SETUP"}','authenticated','authenticated'),
  ('66666666-0000-0000-0000-000000000066','rlstest-t@example.com','x',now(),now(),'{"invite":"RLSTEST-SETUP"}','authenticated','authenticated'),
  ('11111111-0000-0000-0000-000000000011','rlstest-k1@example.com','x',now(),now(),'{"invite":"RLSTEST-SETUP"}','authenticated','authenticated'),
  ('22222222-0000-0000-0000-000000000012','rlstest-k2@example.com','x',now(),now(),'{"invite":"RLSTEST-SETUP"}','authenticated','authenticated'),
  ('33333333-0000-0000-0000-000000000013','rlstest-k3@example.com','x',now(),now(),'{"invite":"RLSTEST-SETUP"}','authenticated','authenticated'),
  ('44444444-0000-0000-0000-000000000014','rlstest-k4@example.com','x',now(),now(),'{"invite":"RLSTEST-SETUP"}','authenticated','authenticated');

-- ★ 角色一律明寫，不依賴 default（理由見檔頭）。
-- 甲乙是幹部；S 與 T 以及 K1-K4 是學員（等一下要測升級）。
update profiles set role = 'cadre'
 where id in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002');
update profiles set role = 'student'
 where id in ('55555555-0000-0000-0000-000000000055','66666666-0000-0000-0000-000000000066',
              '11111111-0000-0000-0000-000000000011','22222222-0000-0000-0000-000000000012',
              '33333333-0000-0000-0000-000000000013','44444444-0000-0000-0000-000000000014');

-- 名字放 profiles（2026-08-31 拆表之後 passports 沒有名字欄位了）。
update profiles set name_zh = '測試甲', team = 'Curriculum Team'
 where id = 'aaaaaaaa-0000-0000-0000-000000000001';
update profiles set name_zh = '測試乙', team = 'Marketing Team'
 where id = 'bbbbbbbb-0000-0000-0000-000000000002';
update profiles set name_zh = '測試學員'
 where id = '55555555-0000-0000-0000-000000000055';

-- ★ 幹部的 passports 列必須**明確建出來**（2026-09-01，階段 5-7 之後）。
--
-- 5-7 之前這一列是註冊 trigger 順手建的，所以測試不必管它。5-7 之後 trigger
-- 只建 profiles，護照那一列改由 claim_invite 在升級時建 —— 而甲乙是直接
-- update 成 cadre 的，沒有走過升級，所以**沒有人會幫他們建那一列**。
--
-- 少了下面這一句的話，第 33 條「乙改不動甲的 passports，改到 0 列」會通過 ——
-- 但通過的理由是**那一列根本不存在**，不是政策擋住了。空集合上的
-- 「改到 0 列」恆為真。這個 repo 已經被同一個 bug class 咬過好幾次
-- （dotOn 的圓點、idPageHTML 的 FULL 疊印、monthPageHTML 的 full 判斷），
-- 這是第四次，只是這次發生在測試資料的準備階段。
--
-- 學員（S / T / K1-K4）刻意**不**建，那正是要測的狀態（第 59 條）。
insert into passports (id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002')
on conflict (id) do nothing;

insert into stamps (user_id, act_id, stamped_on) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '09A', '2026-09-10');
insert into entries (user_id, act_id, note) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '09B', '甲的私人心得，乙不可以看到');

-- ============================================================================
-- 3. 幹部乙的視角
-- ============================================================================
set role authenticated;
select set_config('request.jwt.claims',
                  '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', false);

do $$
declare n int; blocked boolean;
begin
  -- ===== 讀得到／讀不到 =====
  -- 這一段擺在寫入測試前面是刻意的：萬一某條寫入政策被放寬，
  -- 下面那些「乙偷寫甲的資料」的測試會真的寫進去，數量就會影響到這裡的計數。

  -- spec §11-1：整份測試最嚴重的一條。心得裡有未成年幹部寫的東西。
  select count(*) into n from entries where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  insert into rls_result values (10, '§11-1 乙讀不到甲的 entries', '0 列', n || ' 列', n = 0);

  -- ↓ 對照組。沒有這三條，上面那個 0 列可能只是「乙什麼都讀不到」。
  blocked := false;
  begin
    insert into entries (user_id, act_id, note)
         values ('bbbbbbbb-0000-0000-0000-000000000002', '09B', '乙自己的');
  exception when insufficient_privilege or check_violation then blocked := true;
  end;
  insert into rls_result values (11, '【對照】乙寫得進自己的 entries', '寫入成功',
    case when blocked then '被政策擋下，政策過緊' else '寫入成功' end, not blocked);

  select count(*) into n from entries where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  insert into rls_result values (12, '【對照】乙讀得到自己的 entries', '1 列', n || ' 列', n = 1);

  select count(*) into n from stamps where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  insert into rls_result values (13, '【對照】乙看得到甲的 stamps（進度牆）', '1 列', n || ' 列', n = 1);

  -- 2026-08-31 拆表之後進度牆改讀 profiles，這條跟著改。
  select count(*) into n from profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  insert into rls_result values (14, '【對照】乙看得到甲的 profiles（進度牆）', '1 列', n || ' 列', n = 1);

  select count(*) into n from activities;
  insert into rls_result values (15, '【對照】乙讀得到 activities', '大於 0 列', n || ' 列', n > 0);

  select count(*) into n from months;
  insert into rls_result values (16, '【對照】乙讀得到 months', '11 列', n || ' 列', n = 11);

  -- 學員不在進度牆上：profiles_read 只讓幹部看得到幹部。
  select count(*) into n from profiles where id = '55555555-0000-0000-0000-000000000055';
  insert into rls_result values (17, '乙看不到學員的 profiles', '0 列', n || ' 列', n = 0);

  -- ===== 乙不能動甲的東西 =====
  blocked := false;
  begin
    insert into entries (user_id, act_id, note)
         values ('aaaaaaaa-0000-0000-0000-000000000001', '09C', '乙偽造的');
  exception when insufficient_privilege or check_violation then blocked := true;
  end;
  insert into rls_result values (20, '§11-1 乙不能偽造甲的 entries', '被政策擋下',
    case when blocked then '被政策擋下' else '寫進去了' end, blocked);

  blocked := false;
  begin
    update entries set user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  exception when insufficient_privilege or check_violation then blocked := true;
  end;
  insert into rls_result values (21, '§11-1 乙不能把自己的 entries 搬到甲名下', '被政策擋下',
    case when blocked then '被政策擋下' else '搬過去了' end, blocked);

  with u as (update entries set note = '乙改的'
              where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1)
  select count(*) into n from u;
  insert into rls_result values (22, '§11-1 乙改不動甲的 entries', '改到 0 列', '改到 ' || n || ' 列', n = 0);

  with d as (delete from entries where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1)
  select count(*) into n from d;
  insert into rls_result values (23, '§11-1 乙刪不掉甲的 entries', '刪掉 0 列', '刪掉 ' || n || ' 列', n = 0);

  blocked := false;
  begin
    insert into stamps (user_id, act_id, stamped_on)
         values ('aaaaaaaa-0000-0000-0000-000000000001', '09C', current_date);
  exception when insufficient_privilege or check_violation then blocked := true;
  end;
  insert into rls_result values (30, '§11-2 乙不能在甲的護照上蓋章', '被政策擋下',
    case when blocked then '被政策擋下' else '蓋上去了' end, blocked);

  with u as (update stamps set stamped_on = current_date
              where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1)
  select count(*) into n from u;
  insert into rls_result values (31, '§11-2 乙改不動甲的 stamps', '改到 0 列', '改到 ' || n || ' 列', n = 0);

  with d as (delete from stamps where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1)
  select count(*) into n from d;
  insert into rls_result values (32, '§11-2 乙刪不掉甲的 stamps', '刪掉 0 列', '刪掉 ' || n || ' 列', n = 0);

  with u as (update passports set motto = '乙改的'
              where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1)
  select count(*) into n from u;
  insert into rls_result values (33, '§11-2 乙改不動甲的 passports', '改到 0 列', '改到 ' || n || ' 列', n = 0);

  -- ★★ 上面那條的對照組。**沒有它，第 33 條在「甲根本沒有 passports 那一列」
  -- 的時候也會通過** —— 空集合上的「改到 0 列」恆為真，而畫面上看起來一模一樣。
  --
  -- 這不是假想：2026-09-01 階段 5-7 把 passports 的建立從註冊 trigger 移到
  -- claim_invite 之後，測試資料裡的幹部就真的沒有那一列了（甲乙是直接 update
  -- 成 cadre 的，沒走過升級）。setup 因此補了一句明確的 insert，
  -- 而這一條是用來證明那句 insert 真的有效 —— 不然下次它壞掉也沒有人會知道。
  select count(*) into n from passports where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  insert into rls_result values (34, '★【對照】甲確實有 passports 那一列', '1 列', n || ' 列', n = 1);

  with u as (update profiles set name_zh = '乙改的'
              where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1)
  select count(*) into n from u;
  insert into rls_result values (35, '乙改不動甲的 profiles', '改到 0 列', '改到 ' || n || ' 列', n = 0);

  -- ★ §3-1 那個洞：幹部也不准改自己的 role（不然誰都能自己升級／降級別人）。
  blocked := false;
  begin
    update profiles set role = 'student' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  exception when insufficient_privilege then blocked := true;
  end;
  insert into rls_result values (36, '★ §3-1 幹部改不動自己的 role', '被權限擋下',
    case when blocked then '被權限擋下' else '改成功了' end, blocked);

  -- ↓ 對照組。沒有它，上面那條可能只是「整張 profiles 都寫不動」。
  blocked := false;
  begin
    update profiles set name_zh = '測試乙' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  exception when insufficient_privilege then blocked := true;
  end;
  insert into rls_result values (37, '【對照】幹部改得動自己的 name_zh', '改得動',
    case when blocked then '也被擋下 —— 擋的是整張表，不是 role' else '改得動' end, not blocked);

  -- ===== invite_codes 對所有登入身分關閉 =====
  begin
    select count(*) into n from invite_codes;
    insert into rls_result values (40, '§11-3 登入者讀不到 invite_codes', '0 列或權限不足', n || ' 列', n = 0);
  exception when insufficient_privilege then
    insert into rls_result values (40, '§11-3 登入者讀不到 invite_codes', '0 列或權限不足', '權限不足', true);
  end;

  -- 行為測不夠：invite_codes 現在沒有任何 policy，所以「讀不到」也可能只是
  -- policy 漏寫而權限還在。表層級的權限有沒有真的收掉，要直接查目錄。
  -- 只有 claim_invite 與註冊 trigger 那兩個 security definer 的函式碰得到這張表。
  select count(*) into n from pg_class c, aclexplode(c.relacl) x
   where c.oid = 'public.invite_codes'::regclass
     and x.grantee in ('anon'::regrole, 'authenticated'::regrole);
  insert into rls_result values (41, '§11-3 invite_codes 表層級權限已收回',
    'anon 與 authenticated 共 0 種權限', n || ' 種', n = 0);
end $$;

-- ============================================================================
-- 4. 學員的視角 —— 這一段是階段 5 新增的
-- ============================================================================
-- ★ 這裡每一條 0 列都配了一條對照。學員本來就什麼都看不到，
--   所以「全部 0 列」在這一段特別容易變成沒有意義的全綠。
set role authenticated;
select set_config('request.jwt.claims',
                  '{"sub":"55555555-0000-0000-0000-000000000055","role":"authenticated"}', false);

do $$
declare n int; blocked boolean;
begin
  select count(*) into n from months;
  insert into rls_result values (50, '學員讀不到 months', '0 列', n || ' 列', n = 0);

  select count(*) into n from activities;
  insert into rls_result values (51, '學員讀不到 activities', '0 列', n || ' 列', n = 0);

  select count(*) into n from destinations;
  insert into rls_result values (52, '學員讀不到 destinations', '0 列', n || ' 列', n = 0);

  select count(*) into n from stamps;
  insert into rls_result values (53, '學員讀不到任何 stamps', '0 列', n || ' 列', n = 0);

  select count(*) into n from entries;
  insert into rls_result values (54, '學員讀不到任何 entries', '0 列', n || ' 列', n = 0);

  select count(*) into n from profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  insert into rls_result values (55, '學員讀不到幹部的 profiles', '0 列', n || ' 列', n = 0);

  -- ★★ 這一條是整段的關鍵對照組。
  -- 沒有它的話，上面六條全 0 也可能是「這個測試帳號根本不存在」或
  -- 「RLS 把所有人都擋光了」—— 兩種都會讓這一段全綠而什麼都沒證明。
  select count(*) into n from profiles where id = '55555555-0000-0000-0000-000000000055';
  insert into rls_result values (56, '★【對照】學員讀得到自己的 profiles', '1 列', n || ' 列', n = 1);

  -- ★ §3-1 那個洞的主場：學員自己把 role 改成 cadre。
  blocked := false;
  begin
    update profiles set role = 'cadre' where id = '55555555-0000-0000-0000-000000000055';
  exception when insufficient_privilege then blocked := true;
  end;
  insert into rls_result values (57, '★ §3-1 學員改不動自己的 role', '被權限擋下',
    case when blocked then '被權限擋下' else '升級成功了 —— 洞開著' end, blocked);

  -- ↓ 對照組：擋的是 role 這一欄，不是整張表。
  blocked := false;
  begin
    update profiles set name_zh = '測試學員' where id = '55555555-0000-0000-0000-000000000055';
  exception when insufficient_privilege then blocked := true;
  end;
  insert into rls_result values (58, '★【對照】學員改得動自己的 name_zh', '改得動',
    case when blocked then '也被擋下 —— 擋的是整張表，不是 role' else '改得動' end, not blocked);

  -- 學員沒有護照那一列。
  select count(*) into n from passports where id = '55555555-0000-0000-0000-000000000055';
  insert into rls_result values (59, '學員沒有 passports 那一列', '0 列', n || ' 列', n = 0);
end $$;

-- ============================================================================
-- 5. claim_invite —— 新的那道門
-- ============================================================================
-- 規格 §3-5 把邀請碼從「註冊時驗證」移到「登入後升級角色」。
-- 舊版這份測試的 §11-4／§11-5 測的是註冊那條路，整段搬到這裡重測。
--
-- **大小寫與前後空白那四條沒有被刪，是搬過來的。** 它們是 2026-08-17 那次災情
-- 的直接產物（管理員建了小寫的碼，學生怎麼打都失敗，而當時的測試全綠）。
-- 觸發點換了，正規化的邏輯一模一樣 —— 換觸發點的時候把測試刪掉，
-- 就是 README 第 12 項那條「移除一個字串，會把斷言它的測試變成空的」。
--
-- ============================================================================
-- ⚠ 為什麼這一段的身分切來切去
-- ============================================================================
-- **invite_codes 對所有登入身分完全關閉**（那正是第 40、41 條在測的事）。
-- 所以「呼叫 claim_invite」必須用使用者身分，而「檢查 uses_left 有沒有被扣」
-- 只能用管理者身分 —— 兩者不能寫在同一個 do 區塊裡。
--
-- 2026-09-01 第一版就是寫在同一個區塊，跑到第 61 條當場中止：
--     permission denied for table invite_codes
-- 測試撞到自己在測的那道牆。
--
-- ⚠⚠ **有兩種「修法」是錯的，而且錯得很安靜：** ⚠⚠
--
--   一、放寬 invite_codes 的權限讓測試查得到。
--       那會讓第 40、41 兩條從此永遠通過而什麼都沒測 ——
--       為了讓測試跑得動，把測試要守的東西拆掉。
--
--   二、把查 uses_left 那幾句包進 exception when insufficient_privilege，
--       然後回報「查不到」並算它通過。第 40 條**可以**那樣寫，因為對它來說
--       「讀不到」就是預期的結果；但 61 / 63 / 67 要證明的是
--       **「那個數字是多少」**。包起來之後，碼被扣掉了它也會通過 ——
--       一條看起來很安心、實際上什麼都沒守的測試。
--
-- 正確的做法就是下面這樣：呼叫用使用者身分，數字用管理者身分，各自一個區塊。

-- ---- 學員 S：無效的碼 ----
set role authenticated;
select set_config('request.jwt.claims',
                  '{"sub":"55555555-0000-0000-0000-000000000055","role":"authenticated"}', false);

do $$
declare msg text; res text;
begin
  msg := ''; res := null;
  begin res := claim_invite('THIS-CODE-DOES-NOT-EXIST');
  exception when sqlstate 'P0001' then msg := sqlerrm; end;
  insert into rls_result values (60, '★ 無效邀請碼升不了級', 'invalid_invite',
    case when msg <> '' then msg else '沒有被擋，回傳 ' || coalesce(res, 'null') end,
    msg = 'invalid_invite');
end $$;

-- ---- 管理者身分查數字 ----
reset role;
select set_config('request.jwt.claims', '', false);

do $$
declare n int;
begin
  -- 失敗的那次不可以扣到任何碼（例外會讓那個子交易整個回滾）。
  -- 這一句只能在管理者身分下跑，理由見上面那段警告。
  select uses_left into n from invite_codes where code = 'RLSTEST-CLAIM';
  insert into rls_result values (61, '★ 升級失敗不扣碼', '1 次',
    coalesce(n::text, '（查不到）') || ' 次', coalesce(n, -1) = 1);
end $$;

-- ---- 學員 S：有效的碼 ----
set role authenticated;
select set_config('request.jwt.claims',
                  '{"sub":"55555555-0000-0000-0000-000000000055","role":"authenticated"}', false);

do $$
declare msg text; res text;
begin
  msg := ''; res := null;
  begin res := claim_invite('RLSTEST-CLAIM');
  exception when sqlstate 'P0001' then msg := sqlerrm; end;
  insert into rls_result values (62, '★【對照】有效邀請碼升得了級', 'upgraded',
    case when msg <> '' then '被擋下：' || msg else coalesce(res, 'null') end,
    res = 'upgraded');
end $$;

-- ---- 管理者身分查升級後的狀態 ----
reset role;
select set_config('request.jwt.claims', '', false);

do $$
declare n int; r text;
begin
  select uses_left into n from invite_codes where code = 'RLSTEST-CLAIM';
  insert into rls_result values (63, '用掉的碼 uses_left 扣到 0', '0 次',
    coalesce(n::text, '（查不到）') || ' 次', coalesce(n, -1) = 0);

  select role into r from profiles where id = '55555555-0000-0000-0000-000000000055';
  insert into rls_result values (64, '★ 升級後 role 變成 cadre', 'cadre',
    coalesce(r, '（查不到）'), r = 'cadre');

  select count(*) into n from passports where id = '55555555-0000-0000-0000-000000000055';
  insert into rls_result values (65, '★ 升級後才建出 passports 那一列', '1 列', n || ' 列', n = 1);
end $$;

-- ---- 已經是幹部再呼叫一次 ----
set role authenticated;
select set_config('request.jwt.claims',
                  '{"sub":"55555555-0000-0000-0000-000000000055","role":"authenticated"}', false);

do $$
declare res text; msg text;
begin
  msg := ''; res := null;
  begin res := claim_invite('RLSTEST-SECOND');
  exception when sqlstate 'P0001' then msg := sqlerrm; end;
  insert into rls_result values (66, '已經是幹部再呼叫一次，回 already_cadre', 'already_cadre',
    case when msg <> '' then '被擋下：' || msg else coalesce(res, 'null') end,
    res = 'already_cadre');
end $$;

reset role;
select set_config('request.jwt.claims', '', false);

do $$
declare n int;
begin
  -- ★★ 這一條是 for update 那道鎖存在的理由。
  -- 沒有「已經是 cadre 就直接回報」的話，第二次呼叫會照樣扣一次碼 ——
  -- 使用者手滑連點兩下就燒掉一組，還要回去跟組長再要一組。
  -- **只測「回傳 already_cadre」不夠**：回傳對而碼還是被扣了，使用者一樣受害。
  select uses_left into n from invite_codes where code = 'RLSTEST-SECOND';
  insert into rls_result values (67, '★ 而且沒有扣掉那組碼', '1 次',
    coalesce(n::text, '（查不到）') || ' 次', coalesce(n, -1) = 1);
end $$;

-- ---- 用完的碼不能再升級（換一個還沒升級的學員來試）----
set role authenticated;
select set_config('request.jwt.claims',
                  '{"sub":"66666666-0000-0000-0000-000000000066","role":"authenticated"}', false);

do $$
declare msg text; res text;
begin
  msg := ''; res := null;
  begin res := claim_invite('RLSTEST-CLAIM');
  exception when sqlstate 'P0001' then msg := sqlerrm; end;
  insert into rls_result values (68, '§11-5 用完的邀請碼不能再升級', 'invalid_invite',
    case when msg <> '' then msg else '沒有被擋，回傳 ' || coalesce(res, 'null') end,
    msg = 'invalid_invite');
end $$;

-- ---- 大小寫與前後空白（2026-08-17 那次災情的直接產物，從註冊那條路搬過來）----
-- 四種存法各測一條：存小寫打大寫、存大寫打小寫、送出時前後有空白、存進去時就帶空白。
-- 哪天有人把比對改回 where code = p_code，這四條會一起變紅。
-- 這個區塊只呼叫函式、不查 uses_left，所以可以留在使用者身分底下。
do $$
declare res text; msg text;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-0000-0000-0000-000000000011","role":"authenticated"}', false);
  msg := ''; res := null;
  begin res := claim_invite('RLSTEST-LOWER');
  exception when sqlstate 'P0001' then msg := sqlerrm; end;
  insert into rls_result values (70, '§6 碼存小寫、使用者打大寫，升得了級', 'upgraded',
    case when msg <> '' then '被擋下（比對還在分大小寫）' else coalesce(res,'null') end,
    res = 'upgraded');

  perform set_config('request.jwt.claims',
    '{"sub":"22222222-0000-0000-0000-000000000012","role":"authenticated"}', false);
  msg := ''; res := null;
  begin res := claim_invite('rlstest-upper');
  exception when sqlstate 'P0001' then msg := sqlerrm; end;
  insert into rls_result values (71, '§6 碼存大寫、使用者打小寫，升得了級', 'upgraded',
    case when msg <> '' then '被擋下（比對還在分大小寫）' else coalesce(res,'null') end,
    res = 'upgraded');

  perform set_config('request.jwt.claims',
    '{"sub":"33333333-0000-0000-0000-000000000013","role":"authenticated"}', false);
  msg := ''; res := null;
  begin res := claim_invite('   RLSTEST-TRIM  ');
  exception when sqlstate 'P0001' then msg := sqlerrm; end;
  insert into rls_result values (72, '§6 使用者送出的碼前後有空白，升得了級', 'upgraded',
    case when msg <> '' then '被擋下（前後空白沒被吃掉）' else coalesce(res,'null') end,
    res = 'upgraded');

  -- 反過來：資料庫裡存的那組碼前後就帶著空白，使用者打的是乾淨的值。
  -- 這條測的是 btrim 有沒有套在「資料庫存的那一半」——只套右邊的話這條會紅，
  -- 上面那條卻照樣綠。
  perform set_config('request.jwt.claims',
    '{"sub":"44444444-0000-0000-0000-000000000014","role":"authenticated"}', false);
  msg := ''; res := null;
  begin res := claim_invite('RLSTEST-PAD');
  exception when sqlstate 'P0001' then msg := sqlerrm; end;
  insert into rls_result values (73, '§6 碼存的時候前後有空白，使用者打乾淨的值也升得了級', 'upgraded',
    case when msg <> '' then '被擋下（存的那一邊沒有 btrim）' else coalesce(res,'null') end,
    res = 'upgraded');
end $$;

reset role;
select set_config('request.jwt.claims', '', false);

do $$
declare n int; msg text; res text;
begin
  -- 上面四條只證明「沒有被擋下」，還要證明扣的是對的那一列、而且只扣一次。
  -- 四組碼各給 1 次、各被用掉一次，所以四組都該歸零。
  -- 如果有人把唯一索引拿掉、又存了兩組只差大小寫的碼，一次升級會扣到兩列，
  -- 這條就會看到不該歸零的碼歸零了。
  select count(*) into n from invite_codes
   where upper(btrim(code)) in ('RLSTEST-LOWER','RLSTEST-UPPER','RLSTEST-TRIM','RLSTEST-PAD')
     and uses_left = 0;
  insert into rls_result values (74, '§6 四組大小寫測試碼各自扣掉 1 次', '4 組歸零', n || ' 組歸零', n = 4);

  -- 索引本身也要測。上面那些是行為測，但「兩組只差大小寫的碼不能同時存在」
  -- 行為測不出來 —— 只要沒有人真的去建那種碼，測試永遠是綠的。
  select count(*) into n from pg_indexes
   where schemaname = 'public' and tablename = 'invite_codes'
     and indexdef ilike '%unique%'
     and replace(indexdef, ' ', '') ilike '%upper(btrim(code))%';
  insert into rls_result values (75, '§6 invite_codes 有 upper(btrim(code)) 的唯一索引', '1 個', n || ' 個', n = 1);

  -- 沒登入不能升級。這裡是管理者身分、request.jwt.claims 已清空，auth.uid() 是 null。
  msg := ''; res := null;
  begin res := claim_invite('RLSTEST-SETUP');
  exception when sqlstate 'P0001' then msg := sqlerrm; end;
  insert into rls_result values (76, '沒登入不能升級', 'not_signed_in',
    case when msg <> '' then msg else '沒有被擋，回傳 ' || coalesce(res,'null') end,
    msg = 'not_signed_in');
end $$;

-- ============================================================================
-- 6. 註冊這條路現在的行為（2026-09-01，階段 5-7 之後翻面）
-- ============================================================================
-- 5-7 之前這一節測的是「沒有邀請碼就註冊不了」。那道門已經搬到 claim_invite，
-- 所以下面 90 / 91 的斷言**翻了面**，不是被刪掉。
--
-- **為什麼不能直接刪掉這一節**（README 第 12 項）：移除一個字串，會把所有斷言
-- 它不存在的測試變成空的。刪掉的話「註冊這條路的行為」從此沒有任何東西在守，
-- 而剩下的測試會全綠 —— 因為它們測的是別的東西。
-- 註冊仍然是一條真實的路徑，只是它的正確行為變了：
--   以前：沒有碼 → 擋下來
--   現在：沒有碼 → 開一個什麼都看不到的 student 帳號
--
-- 門本身沒有消失，第 5 節那一整段就是它現在住的地方。
reset role;
select set_config('request.jwt.claims', '', false);

do $$
declare n int; blocked boolean; r text; before_uses int;
begin
  select uses_left into before_uses from invite_codes where code = 'RLSTEST-SETUP';

  -- ★ 翻面：不帶任何邀請碼也能註冊
  blocked := false;
  begin
    insert into auth.users (id, email, encrypted_password, created_at, updated_at,
                            raw_user_meta_data, aud, role)
    values ('cccccccc-0000-0000-0000-000000000003','rlstest-c@example.com','x',
            now(), now(), '{}', 'authenticated','authenticated');
  exception when sqlstate 'P0001' then blocked := true;
  end;
  insert into rls_result values (90, '★ 不帶邀請碼也能註冊（門已經搬走）', '註冊成功',
    case when blocked then '被擋下 —— 門還在註冊那一關' else '註冊成功' end, not blocked);

  -- ★ 翻面：註冊出來的是 student，而且沒有護照
  select role into r from profiles where id = 'cccccccc-0000-0000-0000-000000000003';
  insert into rls_result values (91, '★ 註冊出來的 role 是 student', 'student',
    coalesce(r, '（連 profiles 都沒建）'), r = 'student');

  select count(*) into n from passports where id = 'cccccccc-0000-0000-0000-000000000003';
  insert into rls_result values (92, '★ 註冊不再順手建 passports', '0 列', n || ' 列', n = 0);

  -- ↓ 對照組。沒有這條，上面那個 0 列可能只是 auth.users 根本沒插進去。
  select count(*) into n from profiles where id = 'cccccccc-0000-0000-0000-000000000003';
  insert into rls_result values (93, '【對照】註冊仍然會建 profiles（不能省）', '1 列', n || ' 列', n = 1);

  -- 帶著邀請碼註冊也還是可以 —— 它只是不再是必要條件。
  -- 這條的存在是為了確認「門搬走」沒有順手把註冊本身弄壞。
  blocked := false;
  begin
    insert into auth.users (id, email, encrypted_password, created_at, updated_at,
                            raw_user_meta_data, aud, role)
    values ('dddddddd-0000-0000-0000-000000000004','rlstest-d@example.com','x',
            now(), now(), '{"invite":"RLSTEST-SETUP"}','authenticated','authenticated');
  exception when sqlstate 'P0001' then blocked := true;
  end;
  insert into rls_result values (94, '【對照】metadata 裡帶著邀請碼也照樣註冊得成功', '註冊成功',
    case when blocked then '被擋下了' else '註冊成功' end, not blocked);

  -- ★ 而且那組碼**沒有被扣**。metadata 裡的 invite 現在是一個沒有人讀的欄位。
  -- 這條很重要：如果 trigger 還留著扣碼那一句（只是不 raise），
  -- 上面每一條都會綠，而碼會被安靜地燒掉 —— 三十個人註冊完，
  -- 所有的碼都歸零，而沒有人知道為什麼。
  select uses_left into n from invite_codes where code = 'RLSTEST-SETUP';
  insert into rls_result values (95, '★ 註冊不再扣掉邀請碼的次數',
    before_uses || ' 次（沒變）', coalesce(n::text,'（查不到）') || ' 次',
    coalesce(n, -1) = before_uses);
end $$;

-- ---------- 7. 清掉測試資料 ----------
-- 跟開頭那段一模一樣。開頭那次清「上一次留下的」，這次清「這一次產生的」。
-- 結果表是暫存表，不在這裡清，不然最後那句 select 就沒東西可以撈了。
reset role;
select set_config('request.jwt.claims', '', false);

delete from entries   where user_id in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000004','eeeeeeee-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000011','22222222-0000-0000-0000-000000000012','33333333-0000-0000-0000-000000000013','44444444-0000-0000-0000-000000000014','55555555-0000-0000-0000-000000000055','66666666-0000-0000-0000-000000000066');
delete from stamps    where user_id in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000004','eeeeeeee-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000011','22222222-0000-0000-0000-000000000012','33333333-0000-0000-0000-000000000013','44444444-0000-0000-0000-000000000014','55555555-0000-0000-0000-000000000055','66666666-0000-0000-0000-000000000066');
delete from visas     where user_id in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000004','eeeeeeee-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000011','22222222-0000-0000-0000-000000000012','33333333-0000-0000-0000-000000000013','44444444-0000-0000-0000-000000000014','55555555-0000-0000-0000-000000000055','66666666-0000-0000-0000-000000000066');
delete from passports where id      in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000004','eeeeeeee-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000011','22222222-0000-0000-0000-000000000012','33333333-0000-0000-0000-000000000013','44444444-0000-0000-0000-000000000014','55555555-0000-0000-0000-000000000055','66666666-0000-0000-0000-000000000066');
delete from profiles  where id      in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000004','eeeeeeee-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000011','22222222-0000-0000-0000-000000000012','33333333-0000-0000-0000-000000000013','44444444-0000-0000-0000-000000000014','55555555-0000-0000-0000-000000000055','66666666-0000-0000-0000-000000000066');
delete from auth.users where id     in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000004','eeeeeeee-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000011','22222222-0000-0000-0000-000000000012','33333333-0000-0000-0000-000000000013','44444444-0000-0000-0000-000000000014','55555555-0000-0000-0000-000000000055','66666666-0000-0000-0000-000000000066');
delete from invite_codes where upper(btrim(code)) like 'RLSTEST-%';

-- ---------- 8. 條目數 ----------
-- **「全綠」和「全部都跑到了」是兩件事。**
-- 這份測試分成十幾個 do 區塊。任何一個區塊中途丟出沒被接住的例外，
-- 整支腳本會當場中止 —— 那種情況你會看到紅色錯誤，很明顯。
-- 但還有一種不明顯的：有人把某個區塊註解掉、或改寫時漏了幾條，
-- 剩下的照樣全綠，而少掉的那幾條沒有任何東西會提醒你。
--
-- 2026-09-01 第一次跑就是中止在第 61 條（invite_codes 權限），
-- 那次是硬錯誤所以看得見。這一條守的是看不見的那一種。
--
-- 數字寫死在這裡：加測試就要回來改它。跟 ESTAMP_PALETTE 同一個做法 ——
-- 刻意的摩擦，不是為了難用。
do $$
declare n int;
begin
  select count(*) into n from rls_result;
  insert into rls_result values (98, '★ 這次實際跑完了幾條測試', '54 條',
    n || ' 條', n = 54);
end $$;

-- ---------- 9. 總結那一列 ----------
-- ord 給 0，而失敗組排在前面，所以這一列永遠是整張表的第一列。
-- 這裡的 select 讀的是 insert 之前的狀態，不會把自己算進去。
insert into rls_result
select 0, 'OVERALL 全部測試',
       count(*) || ' 條全部通過',
       count(*) filter (where ok) || ' 條通過、' || count(*) filter (where not ok) || ' 條失敗',
       bool_and(ok)
  from rls_result;

-- ---------- 10. 結果表 ----------
-- 這句一定要是整份檔案的最後一句：SQL Editor 只顯示最後一句的結果。
select test_name, expected, actual,
       case when ok then 'PASS' else 'FAIL' end as pass
  from rls_result
 order by ok, ord;
