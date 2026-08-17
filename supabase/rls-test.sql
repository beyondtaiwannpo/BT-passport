-- BT Passport RLS 驗收測試
-- 用法：整份貼進 Supabase SQL Editor 執行，在 schema.sql 與 seed.sql 之後。
--
-- 跑完會在下方的 Results 直接看到一張結果表，一條測試一列：
--   test_name（是哪一條、對應規格哪一節）／ expected（應該是什麼）／
--   actual（實際是什麼）／ pass（PASS 或 FAIL）
-- 失敗的列會排在最上面，而且第一列固定是 OVERALL 總結 ——
-- 只要看第一列的 pass 是 PASS 還是 FAIL，就知道這次有沒有全過，不用一列一列掃。
--
-- 為什麼不用 raise notice：SQL Editor 只顯示「最後一句」的結果，
-- raise notice 是走另一個訊息通道，編輯器不會顯示。
-- 之前這份檔案用 raise notice 回報，貼進去跑只會看到 "Success. No rows returned"，
-- 等於在唯一會用它的地方沒有任何輸出。所以現在改成把每一條的結果寫進一張暫存表，
-- 最後一句 select 把它撈出來。
--
-- 也因為要讓最後那句 select 看得到結果，這份檔案不能再包在 begin ... rollback 裡：
-- rollback 會把結果表一起復原掉，什麼都不會剩。
-- 改用另一種方式做到「可以重複執行」：開頭先把上一次可能留下的測試資料刪掉，
-- 測完再刪一次。清理只認固定的那九個測試 UUID，以及正規化之後（去掉前後空白、
-- 轉成大寫）以 RLSTEST- 開頭的邀請碼，碰不到任何真實資料。
-- 邀請碼那邊用正規化後的前綴比對而不是列舉固定幾個值，是因為下面測大小寫的那幾條
-- 會故意存小寫的碼、以及前後帶空白的碼，列舉固定值會漏掉它們、清不乾淨。
--
-- 但要老實說一件事：跟 rollback 不同，這種做法不保證「跑完什麼都不留」。
-- 如果中途出現硬錯誤（紅色錯誤訊息、腳本沒跑到最後），測試資料有可能留在資料庫裡。
-- 那不用手動清，直接把這個檔案再跑一次，開頭那段清理就會把它們清掉。

-- ---------- 0. 先清乾淨 ----------
-- 先把身分切回來。萬一上一次跑到一半掛掉、連線還停在 authenticated 身分上，
-- 下面的清理會因為 RLS 而刪不掉東西。
reset role;
select set_config('request.jwt.claims', '', false);

-- 上一次留下來的結果表（同一個連線重跑時才會有）
drop table if exists pg_temp.rls_result;

-- 子表先刪、父表後刪。passports 對 auth.users 是 on delete cascade，
-- 所以刪 auth.users 那一句其實會連帶清掉，這裡還是一句一句寫出來，
-- 是為了讓「這個檔案到底會動到哪些表」看得一清二楚。
delete from entries   where user_id in ('aaaaaaaa-0000-0000-0000-000000000001',
                                        'bbbbbbbb-0000-0000-0000-000000000002',
                                        'cccccccc-0000-0000-0000-000000000003',
                                        'dddddddd-0000-0000-0000-000000000004',
                                        'eeeeeeee-0000-0000-0000-000000000005',
                                        '11111111-0000-0000-0000-000000000011',
                                        '22222222-0000-0000-0000-000000000012',
                                        '33333333-0000-0000-0000-000000000013',
                                        '44444444-0000-0000-0000-000000000014');
delete from stamps    where user_id in ('aaaaaaaa-0000-0000-0000-000000000001',
                                        'bbbbbbbb-0000-0000-0000-000000000002',
                                        'cccccccc-0000-0000-0000-000000000003',
                                        'dddddddd-0000-0000-0000-000000000004',
                                        'eeeeeeee-0000-0000-0000-000000000005',
                                        '11111111-0000-0000-0000-000000000011',
                                        '22222222-0000-0000-0000-000000000012',
                                        '33333333-0000-0000-0000-000000000013',
                                        '44444444-0000-0000-0000-000000000014');
delete from passports where id      in ('aaaaaaaa-0000-0000-0000-000000000001',
                                        'bbbbbbbb-0000-0000-0000-000000000002',
                                        'cccccccc-0000-0000-0000-000000000003',
                                        'dddddddd-0000-0000-0000-000000000004',
                                        'eeeeeeee-0000-0000-0000-000000000005',
                                        '11111111-0000-0000-0000-000000000011',
                                        '22222222-0000-0000-0000-000000000012',
                                        '33333333-0000-0000-0000-000000000013',
                                        '44444444-0000-0000-0000-000000000014');
delete from auth.users where id     in ('aaaaaaaa-0000-0000-0000-000000000001',
                                        'bbbbbbbb-0000-0000-0000-000000000002',
                                        'cccccccc-0000-0000-0000-000000000003',
                                        'dddddddd-0000-0000-0000-000000000004',
                                        'eeeeeeee-0000-0000-0000-000000000005',
                                        '11111111-0000-0000-0000-000000000011',
                                        '22222222-0000-0000-0000-000000000012',
                                        '33333333-0000-0000-0000-000000000013',
                                        '44444444-0000-0000-0000-000000000014');
delete from invite_codes where upper(btrim(code)) like 'RLSTEST-%';

-- ---------- 1. 結果表 ----------
-- ok 存的是 boolean，最後一句 select 才把它翻成 PASS / FAIL。
-- 翻譯只寫在那一個地方，就不會有某一條測試不小心把 PASS 跟 FAIL 寫反。
create temp table rls_result (
  ord       int,      -- 排序用，不會出現在最後的結果表裡
  test_name text,
  expected  text,
  actual    text,
  ok        boolean
);

-- 下面大部分的測試是以「使用者乙」的身分跑的，而這張表是用管理者身分建的，
-- 不發權限的話乙寫不進來，整份測試會在第一條就爆掉。
grant all on rls_result to authenticated;

-- ---------- 2. 準備測試資料 ----------
-- 兩個假使用者甲和乙。測的是 RLS 不是註冊流程，但因為 passports.id 對 auth.users
-- 有 FK，還是得先在 auth.users 有列。
--
-- 邀請碼要先插，因為 auth.users 一有新列，schema.sql 最下面那個 trigger 就會跑，
-- 沒有有效邀請碼的話這兩列根本插不進去。

--
-- 下面四組碼是給「大小寫與前後空白」那幾條測試用的。它們刻意用四種不同的存法：
-- 存小寫的、存大寫的、存乾淨的、存的時候前後就帶著空白（管理員貼上時很容易發生）。
-- 舊版這份測試每一組碼都是大寫、送出的也是大寫，所以 2026-08-17 那個
-- 「管理員建了小寫的 bt2026test，全部學生註冊失敗」的真實災情，這份測試一條都測不到。

insert into invite_codes (code, uses_left, note) values
  ('RLSTEST-SETUP',     2, 'rls test 用，甲乙各一次'),
  ('RLSTEST-CODE',      1, 'rls test 用，留給下面的 trigger 測試'),
  ('rlstest-lower',     1, 'rls test 用，故意存小寫，學生會打大寫'),
  ('RLSTEST-UPPER',     1, 'rls test 用，故意存大寫，學生會打小寫'),
  ('RLSTEST-TRIM',      1, 'rls test 用，學生會在前後多打空白'),
  ('  RLSTEST-PAD  ',   1, 'rls test 用，存進去的時候前後就帶著空白');

-- 若 Supabase 在這裡報「null value in column ... violates not-null constraint」，
-- 代表你們專案的 auth.users 比這份測試多幾個必填欄位（版本之間會有差異）。
-- 照錯誤訊息把那個欄位補進下面的欄位清單就好，隨便給個合理的值即可 ——
-- 這兩列只是用來讓 FK 有東西可以指，補欄位不會影響測試在測的事情。
insert into auth.users (id, email, encrypted_password, created_at, updated_at,
                        raw_user_meta_data, aud, role)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'rlstest-a@example.com', 'x', now(), now(), '{"invite":"RLSTEST-SETUP"}', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'rlstest-b@example.com', 'x', now(), now(), '{"invite":"RLSTEST-SETUP"}', 'authenticated', 'authenticated');

-- trigger 已經幫這兩個人建好 passports 的空白列了，這裡只是補上名字和組別，
-- 讓下面「乙看得到甲的護照」那幾條測起來像真的資料。
insert into passports (id, name_zh, team) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '測試甲', 'Curriculum Team'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '測試乙', 'Marketing Team')
on conflict (id) do update set
  name_zh = excluded.name_zh, team = excluded.team;

insert into stamps (user_id, act_id, stamped_on) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '09A', '2026-09-10');

insert into entries (user_id, act_id, note) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '09B', '甲的私人心得，乙不可以看到');

-- ---------- 3. 以下切換成使用者乙的身分 ----------
-- 沒有交易可以包了，所以不能用 set local，改用 set role / set_config(..., false)，
-- 這一段跑完會在下面自己切回來。
set role authenticated;
select set_config('request.jwt.claims',
                  '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}',
                  false);

do $$
declare
  n       int;
  blocked boolean;
begin
  -- ===== 讀得到／讀不到 =====
  -- 這一段擺在寫入測試前面是刻意的：萬一某條寫入政策被放寬，
  -- 下面那些「乙偷寫甲的資料」的測試會真的寫進去，數量就會影響到這裡的計數。

  -- spec §11-1：乙查甲的 entries，必須 0 列。整份測試最嚴重的一條。
  select count(*) into n from entries
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  insert into rls_result values
    (10, '§11-1 B 讀不到 A 的 entries', '0 列', n || ' 列', n = 0);

  -- 乙寫得進自己的 entries。這條測的是「政策有沒有寫太緊」——
  -- 寫不進去的話護照就不能用了，跟外洩一樣是壞掉，所以也算一條測試，
  -- 而且要接住例外，不然政策過緊時整份測試會在這裡中止、一列結果都看不到。
  blocked := false;
  begin
    insert into entries (user_id, act_id, note)
         values ('bbbbbbbb-0000-0000-0000-000000000002', '09B', '乙自己的');
  exception when insufficient_privilege or check_violation then
    blocked := true;
  end;
  insert into rls_result values
    (11, 'B 寫得進自己的 entries', '寫入成功',
     case when blocked then '被政策擋下，政策過緊' else '寫入成功' end,
     not blocked);

  select count(*) into n from entries
   where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  insert into rls_result values
    (12, 'B 讀得到自己的 entries', '1 列', n || ' 列', n = 1);

  -- 乙看得到甲的 stamps 與 passports（進度牆要用，看不到就是空的）
  select count(*) into n from stamps
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  insert into rls_result values
    (13, 'B 看得到 A 的 stamps（進度牆）', '1 列', n || ' 列', n = 1);

  select count(*) into n from passports
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  insert into rls_result values
    (14, 'B 看得到 A 的 passports（進度牆）', '1 列', n || ' 列', n = 1);

  select count(*) into n from activities;
  insert into rls_result values
    (15, 'B 讀得到 activities', '大於 0 列', n || ' 列', n > 0);

  select count(*) into n from months;
  insert into rls_result values
    (16, 'B 讀得到 months', '11 列', n || ' 列', n = 11);

  -- ===== 寫不動別人的東西 =====
  -- spec §11-1 續：讀不到只是一半。乙也不能把東西塞進甲的名下、
  -- 不能改甲的心得、不能刪甲的心得。
  --
  -- 這裡不再用 raise exception 回報失敗，改成把結果記進 rls_result。
  -- 這一改順便解掉舊版一個很陰的坑：raise exception 不指定 errcode 預設是 P0001，
  -- 會被自己那句 exception when 接走，失敗被吃掉、測試假裝通過。
  -- 現在 begin ... exception 區塊只做一件事：把「有沒有被擋下」記在 blocked 這個旗標上。
  -- 沒被擋下 = 那句 SQL 真的成功了 = 這條測試失敗，兩者分得清清楚楚。

  blocked := false;
  begin
    insert into entries (user_id, act_id, note)
         values ('aaaaaaaa-0000-0000-0000-000000000001', '11B', '乙偽造在甲名下的心得');
  exception when insufficient_privilege or check_violation then
    blocked := true;   -- 預期會走到這裡
  end;
  insert into rls_result values
    (20, '§11-1 B 不能偽造 A 的 entries', '被政策擋下',
     case when blocked then '被政策擋下' else '寫進去了，A 名下多了一列' end,
     blocked);

  -- 乙也不能把自己的心得改掛到甲名下（測的是 update 的 with check 那一半）
  -- 這裡除了「有沒有被擋」還要記 row_count：如果上面那條「乙寫自己的 entries」失敗了，
  -- 這句 update 會一列都沒對到，也就不會有例外可以接。那不是「被擋下」，
  -- 只是根本沒東西可以搬 —— actual 要老實寫出來，不要報成「搬過去了」。
  blocked := false;
  n := -1;
  begin
    update entries set user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and act_id = '09B';
    get diagnostics n = row_count;
  exception when insufficient_privilege or check_violation then
    blocked := true;
  end;
  insert into rls_result values
    (21, '§11-1 B 不能把自己的 entries 搬到 A 名下', '被政策擋下',
     case when blocked then '被政策擋下'
          when n = 0  then '沒被擋，但也沒有列可以搬（B 自己那列沒建起來）'
          else             '搬過去了 ' || n || ' 列' end,
     blocked);

  update entries set note = 'hacked'
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  insert into rls_result values
    (22, '§11-1 B 改不動 A 的 entries', '改到 0 列', '改到 ' || n || ' 列', n = 0);

  delete from entries where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  insert into rls_result values
    (23, '§11-1 B 刪不掉 A 的 entries', '刪掉 0 列', '刪掉 ' || n || ' 列', n = 0);

  -- spec §11-2：乙不能把章蓋在甲的護照上、不能改也不能刪甲的章與護照
  blocked := false;
  begin
    insert into stamps (user_id, act_id, stamped_on)
         values ('aaaaaaaa-0000-0000-0000-000000000001', '11A', '2026-11-10');
  exception when insufficient_privilege or check_violation then
    blocked := true;
  end;
  insert into rls_result values
    (30, '§11-2 B 不能在 A 的護照上蓋章', '被政策擋下',
     case when blocked then '被政策擋下' else '蓋上去了' end,
     blocked);

  update stamps set stamped_on = '2000-01-01'
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  insert into rls_result values
    (31, '§11-2 B 改不動 A 的 stamps', '改到 0 列', '改到 ' || n || ' 列', n = 0);

  delete from stamps where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  insert into rls_result values
    (32, '§11-2 B 刪不掉 A 的 stamps', '刪掉 0 列', '刪掉 ' || n || ' 列', n = 0);

  update passports set name_zh = '被改掉了'
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  insert into rls_result values
    (33, '§11-2 B 改不動 A 的 passports', '改到 0 列', '改到 ' || n || ' 列', n = 0);

  -- ===== 邀請碼 =====
  -- spec §11-3：任何登入身分都讀不到 invite_codes。
  -- 兩種結果都算通過：schema.sql 把表層級權限 revoke 掉了，所以正常會直接
  -- 報 42501「權限不足」；萬一權限還在，RLS 也必須讓它回 0 列。
  -- 這裡一樣要分清楚「被擋下」跟「查得到」，所以 exception 區塊只負責改寫結果，
  -- 不做任何 raise。
  begin
    select count(*) into n from invite_codes;
    insert into rls_result values
      (40, '§11-3 登入者讀不到 invite_codes', '0 列或權限不足', n || ' 列', n = 0);
  exception when insufficient_privilege then
    insert into rls_result values
      (40, '§11-3 登入者讀不到 invite_codes', '0 列或權限不足',
       '權限不足 42501，連查都不給查', true);
  end;

  -- 上面那條只測得到「查出來是幾列」，測不到表層級的權限有沒有被收回：
  -- 就算有人把 select 權限 grant 回去給 authenticated，invite_codes 沒有任何 policy，
  -- 查出來還是 0 列，上面那條照樣通過。
  -- 但 schema.sql 那段 revoke 不只是為了 select —— 它連 TRUNCATE 都一起收掉了，
  -- 而 RLS 管不到 TRUNCATE。所以這裡直接數權限：這兩個角色對這張表一種權限都不該有。
  select count(*) into n
    from (values ('anon'), ('authenticated')) as r(role_name),
         (values ('select'), ('insert'), ('update'), ('delete'), ('truncate')) as p(priv)
   where has_table_privilege(r.role_name, 'invite_codes', p.priv);
  insert into rls_result values
    (41, '§11-3 invite_codes 表層級權限已收回', 'anon 與 authenticated 共 0 種權限',
     n || ' 種權限', n = 0);

  -- ===== 政策本身長什麼樣子 =====
  -- 上面那些都是「以乙的身分實際去碰甲的資料」，是最有說服力的一種測法。
  -- 但有一種情況行為測不出來：只要 entries 的 SELECT 政策是對的，乙就看不到甲的心得，
  -- 那麼 UPDATE 與 DELETE 政策即使被改成全開，乙也還是碰不到 —— 行為測會過。
  -- 那等於整道防線只剩 SELECT 一條在撐，哪天有人放寬它就全破。
  -- 所以這裡直接數政策：entries 的四條、stamps 的三條寫入政策，條件都必須綁 auth.uid()。
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'entries'
     and coalesce(qual, '') || ' ' || coalesce(with_check, '') like '%uid()%';
  insert into rls_result values
    (50, '§11-1 entries 四條政策都綁 auth.uid()', '4 條', n || ' 條', n = 4);

  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'stamps'
     and policyname in ('stamps_insert', 'stamps_update', 'stamps_delete')
     and coalesce(qual, '') || ' ' || coalesce(with_check, '') like '%uid()%';
  insert into rls_result values
    (51, '§11-2 stamps 三條寫入政策都綁 auth.uid()', '3 條', n || ' 條', n = 3);
end $$;

-- ---------- 4. 註冊 trigger ----------
-- 切回管理者身分。這幾條測的是 trigger，不是 RLS，要用會觸發 trigger 的身分跑。
reset role;
select set_config('request.jwt.claims', '', false);

do $$
declare
  n       int;
  blocked boolean;
begin
  -- spec §11-4：無效邀請碼，註冊必須失敗且不留下 auth.users
  --
  -- 舊版這裡用 raise exception 回報失敗，而且必須小心指定 errcode，
  -- 否則預設的 P0001 會被自己下面那句 exception when sqlstate 'P0001' 接走。
  -- 現在整個 begin 區塊只做一件事：insert 沒爆 = 沒被擋（測試失敗），
  -- 收到 trigger 丟出來的 P0001 = 被擋下（測試通過）。沒有任何 raise，坑就不存在了。
  blocked := false;
  begin
    insert into auth.users (id, email, encrypted_password, created_at, updated_at,
                            raw_user_meta_data, aud, role)
    values ('cccccccc-0000-0000-0000-000000000003', 'rlstest-c@example.com', 'x',
            now(), now(), '{"invite":"THIS-CODE-DOES-NOT-EXIST"}', 'authenticated', 'authenticated');
  exception when sqlstate 'P0001' then
    blocked := true;   -- 預期會走到這裡，P0001 是 trigger 的 invalid_invite
  end;
  insert into rls_result values
    (60, '§11-4 無效邀請碼註冊失敗', '被 trigger 擋下',
     case when blocked then '被 trigger 擋下 P0001 invalid_invite' else '註冊成功了' end,
     blocked);

  select count(*) into n from auth.users
   where id = 'cccccccc-0000-0000-0000-000000000003';
  insert into rls_result values
    (61, '§11-4 註冊失敗不留下 auth.users', '0 列', n || ' 列', n = 0);

  -- 有效邀請碼可以註冊，且 uses_left 扣到 0，passports 自動建列
  blocked := false;
  begin
    insert into auth.users (id, email, encrypted_password, created_at, updated_at,
                            raw_user_meta_data, aud, role)
    values ('dddddddd-0000-0000-0000-000000000004', 'rlstest-d@example.com', 'x',
            now(), now(), '{"invite":"RLSTEST-CODE"}', 'authenticated', 'authenticated');
  exception when sqlstate 'P0001' then
    blocked := true;
  end;
  insert into rls_result values
    (62, '有效邀請碼註冊得成功', '註冊成功',
     case when blocked then '被 trigger 擋下，擋過頭了' else '註冊成功' end,
     not blocked);

  -- 這條的 n 是 select into 拿到的，查不到那一列的話會是 null。
  -- 用 coalesce 墊掉，別讓 ok 變成 null —— null 既不是 PASS 也不是 FAIL，
  -- 會在最後那句 select 裡變成一列看不懂的東西。
  select uses_left into n from invite_codes where code = 'RLSTEST-CODE';
  insert into rls_result values
    (63, '邀請碼用過之後 uses_left 扣到 0', '0 次',
     coalesce(n::text, '（查不到這組碼）') || ' 次',
     coalesce(n, -1) = 0);

  select count(*) into n from passports
   where id = 'dddddddd-0000-0000-0000-000000000004';
  insert into rls_result values
    (64, '註冊後 passports 自動建列', '1 列', n || ' 列', n = 1);

  -- spec §11-5：同一組碼已用完，再註冊必須失敗
  blocked := false;
  begin
    insert into auth.users (id, email, encrypted_password, created_at, updated_at,
                            raw_user_meta_data, aud, role)
    values ('eeeeeeee-0000-0000-0000-000000000005', 'rlstest-e@example.com', 'x',
            now(), now(), '{"invite":"RLSTEST-CODE"}', 'authenticated', 'authenticated');
  exception when sqlstate 'P0001' then
    blocked := true;
  end;
  insert into rls_result values
    (65, '§11-5 用完的邀請碼不能再註冊', '被 trigger 擋下',
     case when blocked then '被 trigger 擋下 P0001 invalid_invite' else '又註冊成功了' end,
     blocked);

  -- ===== 邀請碼的大小寫與前後空白 =====
  -- spec §6：比對不分大小寫、也不分前後空白，兩邊都先 upper(btrim(...)) 再比。
  --
  -- 這一段是 2026-08-17 那次災情的直接產物：管理員建了一組小寫的 bt2026test，
  -- 學生怎麼打都註冊失敗，而這份測試當時是全綠的 —— 因為上面每一組測試碼都是大寫、
  -- 送出的也是大寫，剛好把那個坑整個繞過去。所以現在四種組合各測一條：
  -- 存小寫打大寫、存大寫打小寫、送出時前後有空白、存進去時前後就有空白。
  -- 哪天有人把比對改回 where code = v_code，這四條會一起變紅。

  -- 存的是小寫 rlstest-lower，學生打大寫 RLSTEST-LOWER
  blocked := false;
  begin
    insert into auth.users (id, email, encrypted_password, created_at, updated_at,
                            raw_user_meta_data, aud, role)
    values ('11111111-0000-0000-0000-000000000011', 'rlstest-lower@example.com', 'x',
            now(), now(), '{"invite":"RLSTEST-LOWER"}', 'authenticated', 'authenticated');
  exception when sqlstate 'P0001' then
    blocked := true;
  end;
  insert into rls_result values
    (70, '§6 碼存小寫、學生打大寫，註冊得成功', '註冊成功',
     case when blocked then '被 trigger 擋下（比對還在分大小寫）' else '註冊成功' end,
     not blocked);

  -- 存的是大寫 RLSTEST-UPPER，學生打小寫 rlstest-upper
  blocked := false;
  begin
    insert into auth.users (id, email, encrypted_password, created_at, updated_at,
                            raw_user_meta_data, aud, role)
    values ('22222222-0000-0000-0000-000000000012', 'rlstest-upper@example.com', 'x',
            now(), now(), '{"invite":"rlstest-upper"}', 'authenticated', 'authenticated');
  exception when sqlstate 'P0001' then
    blocked := true;
  end;
  insert into rls_result values
    (71, '§6 碼存大寫、學生打小寫，註冊得成功', '註冊成功',
     case when blocked then '被 trigger 擋下（比對還在分大小寫）' else '註冊成功' end,
     not blocked);

  -- 碼存得乾乾淨淨，但學生送出的值前後有空白（複製貼上很常帶到）
  blocked := false;
  begin
    insert into auth.users (id, email, encrypted_password, created_at, updated_at,
                            raw_user_meta_data, aud, role)
    values ('33333333-0000-0000-0000-000000000013', 'rlstest-trim@example.com', 'x',
            now(), now(), '{"invite":"   RLSTEST-TRIM  "}', 'authenticated', 'authenticated');
  exception when sqlstate 'P0001' then
    blocked := true;
  end;
  insert into rls_result values
    (72, '§6 學生送出的碼前後有空白，註冊得成功', '註冊成功',
     case when blocked then '被 trigger 擋下（前後空白沒有被吃掉）' else '註冊成功' end,
     not blocked);

  -- 反過來：資料庫裡存的那組碼前後就帶著空白，學生打的是乾淨的值。
  -- 這一條測的是「btrim 有沒有套在左邊（資料庫存的值）那一半」——
  -- 只套右邊的話這條會紅，上面那條卻照樣綠。
  blocked := false;
  begin
    insert into auth.users (id, email, encrypted_password, created_at, updated_at,
                            raw_user_meta_data, aud, role)
    values ('44444444-0000-0000-0000-000000000014', 'rlstest-pad@example.com', 'x',
            now(), now(), '{"invite":"RLSTEST-PAD"}', 'authenticated', 'authenticated');
  exception when sqlstate 'P0001' then
    blocked := true;
  end;
  insert into rls_result values
    (73, '§6 碼存的時候前後有空白，學生打乾淨的值也能註冊', '註冊成功',
     case when blocked then '被 trigger 擋下（存的那一邊沒有 btrim）' else '註冊成功' end,
     not blocked);

  -- 上面四條只證明「註冊沒被擋下」，還要證明扣的是對的那一列、而且只扣一次。
  -- 四組碼各給 1 次，各被用掉一次，所以四組都該歸零。
  -- 如果有人把唯一索引拿掉、又存了兩組只差大小寫的碼，一次註冊會扣到兩列，
  -- 這條就會看到不該歸零的碼歸零了。
  select count(*) into n from invite_codes
   where upper(btrim(code)) in ('RLSTEST-LOWER', 'RLSTEST-UPPER',
                                'RLSTEST-TRIM',  'RLSTEST-PAD')
     and uses_left = 0;
  insert into rls_result values
    (74, '§6 四組大小寫測試碼各自扣掉 1 次', '4 組歸零', n || ' 組歸零', n = 4);

  -- 索引本身也要測。上面那些是行為測，但「兩組只差大小寫的碼不能同時存在」這件事
  -- 行為測不出來 —— 只要沒有人真的去建那種碼，測試永遠是綠的，
  -- 直到某天管理員手滑建了一組，才發現一次註冊會扣掉兩組碼的次數。
  -- 所以這裡直接檢查那個唯一索引還在不在。
  select count(*) into n from pg_indexes
   where schemaname = 'public' and tablename = 'invite_codes'
     and indexdef ilike '%unique%'
     and replace(indexdef, ' ', '') ilike '%upper(btrim(code))%';
  insert into rls_result values
    (75, '§6 invite_codes 有 upper(btrim(code)) 的唯一索引', '1 個', n || ' 個', n = 1);
end $$;

-- ---------- 5. 清掉測試資料 ----------
-- 跟開頭那段一模一樣。開頭那次是清「上一次留下的」，這次是清「這一次產生的」。
-- 結果表是暫存表，不在這裡清，不然最後那句 select 就沒東西可以撈了。
delete from entries   where user_id in ('aaaaaaaa-0000-0000-0000-000000000001',
                                        'bbbbbbbb-0000-0000-0000-000000000002',
                                        'cccccccc-0000-0000-0000-000000000003',
                                        'dddddddd-0000-0000-0000-000000000004',
                                        'eeeeeeee-0000-0000-0000-000000000005',
                                        '11111111-0000-0000-0000-000000000011',
                                        '22222222-0000-0000-0000-000000000012',
                                        '33333333-0000-0000-0000-000000000013',
                                        '44444444-0000-0000-0000-000000000014');
delete from stamps    where user_id in ('aaaaaaaa-0000-0000-0000-000000000001',
                                        'bbbbbbbb-0000-0000-0000-000000000002',
                                        'cccccccc-0000-0000-0000-000000000003',
                                        'dddddddd-0000-0000-0000-000000000004',
                                        'eeeeeeee-0000-0000-0000-000000000005',
                                        '11111111-0000-0000-0000-000000000011',
                                        '22222222-0000-0000-0000-000000000012',
                                        '33333333-0000-0000-0000-000000000013',
                                        '44444444-0000-0000-0000-000000000014');
delete from passports where id      in ('aaaaaaaa-0000-0000-0000-000000000001',
                                        'bbbbbbbb-0000-0000-0000-000000000002',
                                        'cccccccc-0000-0000-0000-000000000003',
                                        'dddddddd-0000-0000-0000-000000000004',
                                        'eeeeeeee-0000-0000-0000-000000000005',
                                        '11111111-0000-0000-0000-000000000011',
                                        '22222222-0000-0000-0000-000000000012',
                                        '33333333-0000-0000-0000-000000000013',
                                        '44444444-0000-0000-0000-000000000014');
delete from auth.users where id     in ('aaaaaaaa-0000-0000-0000-000000000001',
                                        'bbbbbbbb-0000-0000-0000-000000000002',
                                        'cccccccc-0000-0000-0000-000000000003',
                                        'dddddddd-0000-0000-0000-000000000004',
                                        'eeeeeeee-0000-0000-0000-000000000005',
                                        '11111111-0000-0000-0000-000000000011',
                                        '22222222-0000-0000-0000-000000000012',
                                        '33333333-0000-0000-0000-000000000013',
                                        '44444444-0000-0000-0000-000000000014');
delete from invite_codes where upper(btrim(code)) like 'RLSTEST-%';

-- ---------- 6. 總結那一列 ----------
-- ord 給 0，所以不管排在通過組還是失敗組，它都會是那一組的第一列 ——
-- 而失敗組排在前面，所以這一列永遠是整張表的第一列。
-- 這裡的 select 讀的是 insert 之前的狀態，不會把自己也算進去。
insert into rls_result
select 0,
       'OVERALL 全部測試',
       count(*) || ' 條全部通過',
       count(*) filter (where ok) || ' 條通過、' || count(*) filter (where not ok) || ' 條失敗',
       bool_and(ok)
  from rls_result;

-- ---------- 7. 結果表 ----------
-- 這句一定要是整份檔案的最後一句：SQL Editor 只顯示最後一句的結果。
-- order by ok：false 排在 true 前面，所以失敗的列全部浮到最上面。
select test_name,
       expected,
       actual,
       case when ok then 'PASS' else 'FAIL' end as pass
  from rls_result
 order by ok, ord;
