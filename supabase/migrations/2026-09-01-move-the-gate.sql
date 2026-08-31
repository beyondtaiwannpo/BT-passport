-- 階段 5-7：把邀請碼那道門從「註冊」移到「角色升級」　2026-09-01
--
-- ⚠⚠ **這是整輪唯一一個守門變弱的瞬間。** ⚠⚠
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。包在一個 transaction 裡。
--
-- ============================================================================
-- 這一支做兩件事，而且兩件必須是原子的
-- ============================================================================
--   1. profiles.role 的 default 從 'cadre' 改成 'student'
--   2. handle_new_user() 拿掉邀請碼檢查，而且不再建 passports 那一列
--
-- **中間那個狀態是危險的**：如果 trigger 已經不驗邀請碼、而 default 還是 'cadre'，
-- 那麼任何人註冊就是幹部 —— 而且不會有任何東西報錯、不會有紅燈、
-- 使用者那邊看起來一切正常。所以兩件事包在同一個 begin/commit 裡。
--
-- 順序也刻意：**先改 default，再改 trigger。** 萬一有人把這份檔案拆開來跑、
-- 或中途停在一半，停在「default 已經是 student、但註冊仍然要邀請碼」是安全的
-- （比現在更嚴），停在反過來那一半是災難。順序讓意外的方向倒向安全那邊。
--
-- ============================================================================
-- 跑完之後世界長什麼樣
-- ============================================================================
--   任何人都能用 email + 密碼註冊，身分是 student，**什麼都看不到**
--   （每一條 RLS 都認 is_cadre()，學員讀不到 months / activities / 別人的 profiles）。
--   要成為幹部只有一條路：登入之後呼叫 claim_invite，驗碼、扣碼、升級、
--   建 passports 那一列，全部在資料庫裡一次做完。
--
--   守門沒有消失，只是換了觸發點 —— 而且更合理：以後學員本來就該能自己註冊。
--
-- ⚠ email 確認這時候還沒開（排在階段 7 之後）。所以這段期間有人可以用假信箱
--   開一堆 student 帳號。它們拿不到任何資料，成本是資料庫裡多幾列垃圾。
--   使用者 2026-09-01 判斷這個成本可以接受，理由是「提前開等於測一個之後會被
--   丟掉的流程」。**那個判斷的前提是網址還沒發給任何人。**
--
-- ============================================================================
-- 已經存在的兩個帳號不受影響
-- ============================================================================
-- alter column set default **只影響之後新建的列，不會回填**。
-- 王平與安現在是 cadre，跑完還是 cadre。這句話常被誤解，所以寫在這裡。
-- ============================================================================

begin;

-- ---------- 1. default 改成 student ----------
-- 這一句就是「守門變弱」的那一刻。在它之前，能註冊的都是幹部；
-- 在它之後，註冊只是拿到一個什麼都看不到的帳號。
alter table profiles alter column role set default 'student';

-- ---------- 2. 註冊 trigger 拿掉邀請碼檢查 ----------
-- 對照舊版（見 2026-08-31-profiles-and-role.sql），這一版少了兩段：
--
--   a. update invite_codes ... / if not found then raise 'invalid_invite'
--      → 整段搬到 claim_invite 了（2026-09-01-claim-invite.sql）。
--        **不是刪掉，是搬家。** 那段邏輯連同它的大小寫／空白正規化、
--        「檢查與扣減同一句」的競態防護，一個字都沒改地在新的地方繼續執行。
--
--   b. insert into passports
--      → passports 只有幹部才有。現在註冊出來的是 student，沒有護照；
--        claim_invite 升級成功的時候才建那一列。
--
-- 剩下的只有一件事：每個進到 auth.users 的人都要有一列 profiles。
-- **這一句不能省**：profiles 是所有外鍵指向的地方，也是 is_cadre() 查的地方。
-- 沒有那一列的人，claim_invite 會回 no_profile，而他自己什麼也修不了。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer                     -- profiles 沒有 insert policy，要用擁有者身分寫
set search_path = public, pg_temp    -- 釘死搜尋路徑，別人就沒辦法用同名的暫存表換掉 profiles
as $$
begin
  -- role 吃資料表的 default，也就是上面剛改成的 'student'。
  -- **不要在這裡寫死角色。** 寫死的話，上面那句 alter default 就變成裝飾，
  -- 而下一個人改了 default 卻發現沒有效果 —— 那種找不到原因的落差最花時間。
  insert into profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

commit;


-- ---------- 驗收 ----------
-- ★ 標的四條是「門真的搬過去了、而且新的那道還在」。
-- 這裡查 prosrc 一律先剝掉 SQL 註解再比對：這個檔案的註解裡就寫了
-- invalid_invite 好幾次，不剝的話「trigger 裡沒有 invalid_invite」那條會被
-- 註解餵飽而誤報（README 第 10 項）。
select * from (
  with trg as (select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body
                 from pg_proc where proname = 'handle_new_user'),
       clm as (select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body
                 from pg_proc where proname = 'claim_invite')
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when
      (select column_default from information_schema.columns
        where table_schema='public' and table_name='profiles' and column_name='role') like '%student%'
      and (select body from trg) not like '%invalid_invite%'
      and (select body from trg) not like '%passports%'
      and (select body from trg) like '%insert into profiles%'
      and (select body from clm) like '%invalid_invite%'
      and (select body from clm) like '%uses_left > 0%'
      and (select body from clm) like '%for update%'
      and (select count(*) from profiles where role = 'cadre') = 2
      and (select count(*) from pg_attribute a, aclexplode(a.attacl) x
            where a.attrelid='public.profiles'::regclass and a.attname='role'
              and x.grantee='authenticated'::regrole and x.privilege_type='UPDATE') = 0
      and (select count(*) from pg_trigger
            where tgname='on_auth_user_created' and not tgisinternal) = 1
    then 'PASS' else 'FAIL' end as 結果

  union all select 1, '★ role 的 default 變成 student', 'student',
    coalesce((select column_default from information_schema.columns
               where table_schema='public' and table_name='profiles' and column_name='role'), '（無）'),
    case when (select column_default from information_schema.columns
                where table_schema='public' and table_name='profiles' and column_name='role')
              like '%student%' then 'PASS' else 'FAIL' end

  union all select 2, '★ trigger 不再驗邀請碼', '沒有 invalid_invite',
    case when (select body from trg) like '%invalid_invite%' then '還在' else '沒有了' end,
    case when (select body from trg) not like '%invalid_invite%' then 'PASS' else 'FAIL' end

  union all select 3, 'trigger 不再建 passports', '沒有 passports',
    case when (select body from trg) like '%passports%' then '還在' else '沒有了' end,
    case when (select body from trg) not like '%passports%' then 'PASS' else 'FAIL' end

  union all select 4, 'trigger 仍然會建 profiles（不能省）', '有',
    case when (select body from trg) like '%insert into profiles%' then '有' else '不見了' end,
    case when (select body from trg) like '%insert into profiles%' then 'PASS' else 'FAIL' end

  -- ★★ 這三條是這一支最重要的：門**搬過去了**，不是消失了。
  --    只驗「trigger 沒有邀請碼」的話，把 claim_invite 也一起刪掉會照樣全綠。
  union all select 5, '★ 新的門還在：claim_invite 會驗碼', '有 invalid_invite',
    case when (select body from clm) like '%invalid_invite%' then '有' else '不見了' end,
    case when (select body from clm) like '%invalid_invite%' then 'PASS' else 'FAIL' end

  union all select 6, '★ 新的門還在：檢查與扣減同一句', '有 uses_left > 0',
    case when (select body from clm) like '%uses_left > 0%' then '有' else '不見了' end,
    case when (select body from clm) like '%uses_left > 0%' then 'PASS' else 'FAIL' end

  union all select 7, '★ 新的門還在：for update 那道鎖', '有',
    case when (select body from clm) like '%for update%' then '有' else '不見了' end,
    case when (select body from clm) like '%for update%' then 'PASS' else 'FAIL' end

  union all select 8, 'trigger 本身還掛著', '1 個',
    (select count(*) from pg_trigger where tgname='on_auth_user_created' and not tgisinternal)::text || ' 個',
    case when (select count(*) from pg_trigger
                where tgname='on_auth_user_created' and not tgisinternal) = 1
    then 'PASS' else 'FAIL' end

  union all select 9, '★ 既有的兩個人仍然是 cadre（default 不回填）', '2 人',
    (select count(*) from profiles where role='cadre')::text || ' 人',
    case when (select count(*) from profiles where role='cadre') = 2 then 'PASS' else 'FAIL' end

  union all select 10, 'role 仍然不是使用者改得動的欄位', '0 筆',
    (select count(*) from pg_attribute a, aclexplode(a.attacl) x
      where a.attrelid='public.profiles'::regclass and a.attname='role'
        and x.grantee='authenticated'::regrole and x.privilege_type='UPDATE')::text || ' 筆',
    case when (select count(*) from pg_attribute a, aclexplode(a.attacl) x
      where a.attrelid='public.profiles'::regclass and a.attname='role'
        and x.grantee='authenticated'::regrole and x.privilege_type='UPDATE') = 0
    then 'PASS' else 'FAIL' end
) x order by ord;
