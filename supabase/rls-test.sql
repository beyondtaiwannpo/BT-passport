-- BT Passport RLS 驗收測試
-- 用法：整份貼進 Supabase SQL Editor 執行，在 schema.sql 與 seed.sql 之後。
-- 全部通過會在 Results 下方的訊息看到 'ALL RLS TESTS PASSED' 與 'TRIGGER TESTS PASSED'。
-- 任何一條失敗會直接 raise exception 並中止，訊息會說明是哪一條。
--
-- 整份包在 begin ... rollback 裡，測試資料不會留下來，所以可以重複執行。

begin;

-- ---------- 準備測試資料 ----------
-- 兩個假使用者甲和乙。測的是 RLS 不是註冊流程，但因為 passports.id 對 auth.users
-- 有 FK，還是得先在 auth.users 有列。
--
-- 邀請碼要先插，因為 auth.users 一有新列，schema.sql 最下面那個 trigger 就會跑，
-- 沒有有效邀請碼的話這兩列根本插不進去。

insert into invite_codes (code, uses_left, note) values
  ('RLSTEST-SETUP', 2, 'rls test 用，甲乙各一次'),
  ('RLSTEST-CODE',  1, 'rls test 用，留給下面的 trigger 測試')
on conflict (code) do nothing;

-- 若 Supabase 在這裡報「null value in column ... violates not-null constraint」，
-- 代表你們專案的 auth.users 比這份測試多幾個必填欄位（版本之間會有差異）。
-- 照錯誤訊息把那個欄位補進下面的欄位清單就好，隨便給個合理的值即可 ——
-- 這兩列只是用來讓 FK 有東西可以指，補欄位不會影響測試在測的事情。
insert into auth.users (id, email, encrypted_password, created_at, updated_at,
                        raw_user_meta_data, aud, role)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'rlstest-a@example.com', 'x', now(), now(), '{"invite":"RLSTEST-SETUP"}', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'rlstest-b@example.com', 'x', now(), now(), '{"invite":"RLSTEST-SETUP"}', 'authenticated', 'authenticated')
on conflict (id) do nothing;

-- trigger 已經幫這兩個人建好 passports 的空白列了，這裡只是補上名字和組別，
-- 讓下面「乙看得到甲的護照」那幾條測起來像真的資料。
insert into passports (id, name_zh, team) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '測試甲', 'Curriculum Team'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '測試乙', 'Marketing Team')
on conflict (id) do update set
  name_zh = excluded.name_zh, team = excluded.team;

insert into stamps (user_id, act_id, stamped_on) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '09A', '2026-09-10')
on conflict do nothing;

insert into entries (user_id, act_id, note) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '09B', '甲的私人心得，乙不可以看到')
on conflict do nothing;

-- ---------- 以下切換成使用者乙的身分 ----------
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

  -- spec §11-1 續：讀不到只是一半。乙也不能把東西塞進甲的名下、
  -- 不能改甲的心得、不能刪甲的心得。
  --
  -- 下面幾個 raise 都指定了 errcode P0002。原因跟檔案最下面那段一樣：
  -- 不指定的話預設是 P0001，會被自己那句 exception when ... 接走，
  -- 失敗會被吃掉、測試假裝通過。改動這裡時千萬別把 errcode 拿掉。
  begin
    insert into entries (user_id, act_id, note)
         values ('aaaaaaaa-0000-0000-0000-000000000001', '11B', '乙偽造在甲名下的心得');
    raise exception 'FAIL §11-1: B 可以偽造 A 的 entries' using errcode = 'P0002';
  exception when insufficient_privilege or check_violation then
    null;  -- 預期會走到這裡
  end;

  -- 乙也不能把自己的心得改掛到甲名下（測的是 update 的 with check 那一半）
  begin
    update entries set user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and act_id = '09B';
    raise exception 'FAIL §11-1: B 可以把自己的 entries 搬到 A 名下' using errcode = 'P0002';
  exception when insufficient_privilege or check_violation then
    null;
  end;

  update entries set note = 'hacked'
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL §11-1: B 改得動 A 的 entries（% 列）', n;
  end if;

  delete from entries where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL §11-1: B 刪得掉 A 的 entries（% 列）', n;
  end if;

  -- spec §11-2：乙不能把章蓋在甲的護照上
  begin
    insert into stamps (user_id, act_id, stamped_on)
         values ('aaaaaaaa-0000-0000-0000-000000000001', '11A', '2026-11-10');
    raise exception 'FAIL §11-2: B 可以在 A 的護照上蓋章' using errcode = 'P0002';
  exception when insufficient_privilege or check_violation then
    null;
  end;

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

  -- spec §11-3：任何登入身分都讀不到 invite_codes。
  -- 兩種結果都算通過：schema.sql 把表層級權限 revoke 掉了，所以正常會直接
  -- 報 42501「權限不足」；萬一權限還在，RLS 也必須讓它回 0 列。
  begin
    select count(*) into n from invite_codes;
    if n <> 0 then
      raise exception 'FAIL §11-3: 登入者讀得到 invite_codes（% 列）', n;
    end if;
  exception when insufficient_privilege then
    null;  -- 連查都不給查，比回 0 列更嚴，通過
  end;

  -- 政策本身的檢查（不是行為測，是直接看政策長什麼樣子）
  --
  -- 上面那些都是「以乙的身分實際去碰甲的資料」，是最有說服力的一種測法。
  -- 但有一種情況行為測不出來：只要 entries 的 SELECT 政策是對的，乙就看不到甲的心得，
  -- 那麼 UPDATE 與 DELETE 政策即使被改成全開，乙也還是碰不到 —— 行為測會過。
  -- （PostgreSQL 連 UPDATE 之後的新列都會拿 SELECT 政策再檢查一次，所以連
  --   「把自己的心得改掛到甲名下」這條路也是 SELECT 政策擋掉的。）
  -- 那等於整道防線只剩 SELECT 一條在撐，哪天有人放寬它就全破。
  -- 所以這裡直接數政策：entries 的四條、stamps 的三條寫入政策，條件都必須綁 auth.uid()。
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'entries'
     and coalesce(qual, '') || ' ' || coalesce(with_check, '') like '%uid()%';
  if n <> 4 then
    raise exception 'FAIL §11-1: entries 的四條政策每一條都要綁 auth.uid()，符合的只有 % 條', n;
  end if;

  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'stamps'
     and policyname in ('stamps_insert', 'stamps_update', 'stamps_delete')
     and coalesce(qual, '') || ' ' || coalesce(with_check, '') like '%uid()%';
  if n <> 3 then
    raise exception 'FAIL §11-2: stamps 的三條寫入政策每一條都要綁 auth.uid()，符合的只有 % 條', n;
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

-- ---------- 註冊 trigger ----------
reset role;
reset request.jwt.claims;

do $$
declare n int; ok boolean;
begin
  -- spec §11-4：無效邀請碼，註冊必須失敗且不留下 auth.users
  --
  -- 這裡用 ok 這個旗標而不是直接在 begin 區塊裡 raise 'FAIL'，是有原因的：
  -- raise exception 不指定 errcode 的話預設就是 P0001，會被下面自己那個
  -- 「when sqlstate 'P0001'」接走，失敗會被吃掉、測試假裝通過。
  -- 下面 §11-5 同理。
  ok := false;
  begin
    insert into auth.users (id, email, encrypted_password, created_at, updated_at,
                            raw_user_meta_data, aud, role)
    values ('cccccccc-0000-0000-0000-000000000003', 'rlstest-c@example.com', 'x',
            now(), now(), '{"invite":"THIS-CODE-DOES-NOT-EXIST"}', 'authenticated', 'authenticated');
    ok := true;   -- 插得進去，代表 trigger 沒擋住
  exception when sqlstate 'P0001' then
    null;  -- 預期會走到這裡
  end;
  if ok then
    raise exception 'FAIL §11-4: 無效邀請碼竟然註冊成功了';
  end if;

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
  ok := false;
  begin
    insert into auth.users (id, email, encrypted_password, created_at, updated_at,
                            raw_user_meta_data, aud, role)
    values ('eeeeeeee-0000-0000-0000-000000000005', 'rlstest-e@example.com', 'x',
            now(), now(), '{"invite":"RLSTEST-CODE"}', 'authenticated', 'authenticated');
    ok := true;
  exception when sqlstate 'P0001' then
    null;
  end;
  if ok then
    raise exception 'FAIL §11-5: 用完的邀請碼竟然還能註冊';
  end if;

  raise notice 'TRIGGER TESTS PASSED';
end $$;

rollback;  -- 測試資料不留下
