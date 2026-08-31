-- 階段 5-1：角色升級的 RPC　2026-09-01
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後印出 PASS / FAIL 表。
--
-- ============================================================================
-- 這一支「不會」讓守門變弱
-- ============================================================================
-- 註冊 trigger 的邀請碼檢查**完全沒有被碰到**。這一支只是多開一條路：
-- 已經登入的人可以拿邀請碼把自己升級成 cadre。
--
-- 也就是說跑完之後有**兩道門並存**：
--   舊門：沒有邀請碼就註冊不了（trigger，還在）
--   新門：登入後拿邀請碼才升得上 cadre（這個函式）
-- 舊門要到 5-7 才拆，而且要等新門被測試證明「會擋、也會放」之後。
-- 驗收的最後三條就是在確認舊門原封不動 —— 如果這一支不小心動到它，會當場變紅。
--
-- ============================================================================
-- 兩個競態，防法不一樣
-- ============================================================================
-- 一、**兩個人搶同一組只剩一次的碼**（規格 §3-5 第 2 點）
--    用一句 `update ... where uses_left > 0` 加 `if not found` 解決。
--    拆成「先 select 檢查、再 update 扣減」的話兩個人都會通過 ——
--    這樣寫由資料庫的列鎖擋掉。
--
-- 二、**同一個人連點兩下**（規格沒提，2026-09-01 補）
--    上面那一句擋不住這個：兩個請求都看到自己是 student，兩個都扣一次，
--    燒掉兩組碼，而使用者要回去跟組長再要一組。三十個人發碼，這一定會發生。
--    防法是在讀自己角色時 `for update` 鎖住那一列，讓同一個人的兩次呼叫排隊。
--    第二次進來會看到自己已經是 cadre，直接回報而**不扣碼**。
--
-- ============================================================================
-- 正規化全部在資料庫做，前端一個字都不准改
-- ============================================================================
-- 比對不分大小寫、也不分前後空白，兩邊都套 upper(btrim(...))，
-- 跟註冊 trigger 用同一套。2026-08-17 出過事：前端偷偷把碼轉大寫而資料庫是嚴格
-- 比對，管理員建的小寫碼讓所有人註冊失敗，畫面卻只說「這個邀請碼不對」。
-- 病根是「同一件事在兩個地方各做一半」。**不要在前端加任何大小寫轉換。**
--
-- invite_codes 上那個 upper(btrim(code)) 的唯一索引是這一行的搭檔：
-- 沒有它的話，兩組只差大小寫的碼會被這句 update 一次扣掉兩列。
-- ============================================================================

-- ── 參數為什麼叫 p_code 而不是 code ──
--
-- **不要改成 code。** 下面那句比對是：
--     where upper(btrim(code)) = upper(btrim(p_code))
-- 左邊的 code 指的是 invite_codes 那張表的欄位。參數如果也叫 code，plpgsql 會
-- 讓參數蓋過欄位名，那句就變成「拿參數跟自己比」—— 恆為真，**任何字串都能把
-- 自己升級成幹部**。而且不會報錯、不會有任何東西變紅，看起來就是升級成功了。
--
-- 這不是風格偏好，是一個會靜靜地拆掉整個守門的改名。
-- 驗收裡有兩條在守它：參數名必須是 p_code，函式本文裡必須出現 btrim(p_code)。
create or replace function public.claim_invite(p_code text)
returns text
language plpgsql
security definer                     -- 要讀寫 invite_codes（對所有登入身分關閉）與 profiles.role
set search_path = public, pg_temp    -- 釘死搜尋路徑，別人就沒辦法用同名的暫存表換掉下面三張表
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  -- for update 是防「同一個人連點兩下」的那道鎖，見檔頭。**不要拿掉。**
  select role into v_role from profiles where id = v_uid for update;

  if v_role is null then
    -- 沒有 profiles 那一列。註冊 trigger 會建，所以正常情況查得到；
    -- 查不到代表這個帳號是 trigger 存在之前建的，或有人手動刪了那一列。
    raise exception 'no_profile' using errcode = 'P0001';
  end if;

  if v_role = 'cadre' then
    -- 已經是幹部：**不扣碼**，直接回報。手滑按兩下不該燒掉一組碼。
    return 'already_cadre';
  end if;

  update invite_codes set uses_left = uses_left - 1
   where upper(btrim(code)) = upper(btrim(p_code)) and uses_left > 0;
  if not found then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;

  update profiles set role = 'cadre' where id = v_uid;

  -- 升級成 cadre 的時候才建 passports 那一列（規格 §3-5 第 5 點）。
  -- on conflict do nothing：這個人可能曾經是幹部、被降級、又升回來。
  insert into passports (id) values (v_uid) on conflict (id) do nothing;

  return 'upgraded';
end $$;

-- 只有登入的人能呼叫。anon 不行，public 不行。
revoke execute on function public.claim_invite(text) from public, anon;
grant  execute on function public.claim_invite(text) to authenticated;


-- ---------- 驗收 ----------
-- 這裡查 prosrc 的幾條，一律先把 SQL 註解剝掉再比對。
-- 理由是 README 第 10 項那個坑：這個 repo 的註解會解釋規則本身，於是註解裡的
-- 字面會跟真正的宣告重複 —— 上面檔頭就寫了三次 uses_left > 0。
-- 不剝註解的話，這幾條會被註解餵飽，**就算把真正那一行刪掉也照樣通過**。
select * from (
  with src as (
    select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body
      from pg_proc where proname = 'claim_invite'
  ), trg as (
    select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body
      from pg_proc where proname = 'handle_new_user'
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when
      (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='claim_invite' and p.prosecdef) = 1
      and (select count(*) from pg_proc where proname='claim_invite'
            and 'search_path=public, pg_temp' = any(proconfig)) = 1
      and (select body from src) like '%for update%'
      and (select body from src) like '%uses_left > 0%'
      and (select body from src) like '%invalid_invite%'
      and (select body from src) like '%already_cadre%'
      and (select array_to_string(proargnames, ',') from pg_proc where proname='claim_invite') = 'p_code'
      and (select body from src) like '%btrim(p_code)%'
      and (select count(*) from pg_proc p, aclexplode(p.proacl) x
            where p.proname='claim_invite' and x.grantee='authenticated'::regrole
              and x.privilege_type='EXECUTE') = 1
      and (select count(*) from pg_proc p, aclexplode(p.proacl) x
            where p.proname='claim_invite'
              and x.grantee in (0::regrole, 'anon'::regrole)
              and x.privilege_type='EXECUTE') = 0
      and (select body from trg) like '%invalid_invite%'
      and (select column_default from information_schema.columns
            where table_schema='public' and table_name='profiles' and column_name='role') like '%cadre%'
      and (select count(*) from pg_attribute a, aclexplode(a.attacl) x
            where a.attrelid='public.profiles'::regclass and a.attname='role'
              and x.grantee='authenticated'::regrole and x.privilege_type='UPDATE') = 0
    then 'PASS' else 'FAIL' end as 結果

  union all select 1, 'claim_invite 是 security definer', 'true',
    coalesce((select prosecdef::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
               where n.nspname='public' and p.proname='claim_invite'), '（函式不存在）'),
    case when (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='public' and p.proname='claim_invite' and p.prosecdef) = 1
    then 'PASS' else 'FAIL' end

  union all select 2, 'search_path 釘死了', 'search_path=public, pg_temp',
    coalesce((select array_to_string(proconfig, ' | ') from pg_proc where proname='claim_invite'), '（沒設）'),
    case when (select count(*) from pg_proc where proname='claim_invite'
                and 'search_path=public, pg_temp' = any(proconfig)) = 1
    then 'PASS' else 'FAIL' end

  union all select 3, '★ 有 for update（擋同一個人連點兩下）', '有',
    case when (select body from src) like '%for update%' then '有' else '沒有' end,
    case when (select body from src) like '%for update%' then 'PASS' else 'FAIL' end

  union all select 4, '★ 檢查與扣減同一句（uses_left > 0）', '有',
    case when (select body from src) like '%uses_left > 0%' then '有' else '沒有' end,
    case when (select body from src) like '%uses_left > 0%' then 'PASS' else 'FAIL' end

  union all select 5, '★ 驗不過會 raise invalid_invite', '有',
    case when (select body from src) like '%invalid_invite%' then '有' else '沒有' end,
    case when (select body from src) like '%invalid_invite%' then 'PASS' else 'FAIL' end

  -- ★ 守住參數名。有人把 p_code 改成 code 的話，那句比對會變成拿參數跟自己比，
  --   恆為真、任何字串都能升級，而且不會有任何東西報錯。
  union all select 6, '★ 參數名是 p_code（改成 code 會讓比對恆為真）', 'p_code',
    coalesce((select array_to_string(proargnames, ',') from pg_proc where proname='claim_invite'), '（查不到）'),
    case when (select array_to_string(proargnames, ',') from pg_proc where proname='claim_invite') = 'p_code'
    then 'PASS' else 'FAIL' end

  -- 光看參數名不夠：參數叫 p_code 而本文寫成 btrim(code) = btrim(code) 一樣是恆為真。
  -- 所以連本文裡真的用到 p_code 也一起守（剝過註解，不會被上面那段說明餵飽）。
  union all select 7, '★ 函式本文真的用到 btrim(p_code)', '有',
    case when (select body from src) like '%btrim(p_code)%' then '有' else '沒有' end,
    case when (select body from src) like '%btrim(p_code)%' then 'PASS' else 'FAIL' end

  union all select 8, '已經是幹部不扣碼（already_cadre）', '有',
    case when (select body from src) like '%already_cadre%' then '有' else '沒有' end,
    case when (select body from src) like '%already_cadre%' then 'PASS' else 'FAIL' end

  union all select 9, 'authenticated 可以呼叫', '1 筆',
    (select count(*) from pg_proc p, aclexplode(p.proacl) x
      where p.proname='claim_invite' and x.grantee='authenticated'::regrole
        and x.privilege_type='EXECUTE')::text || ' 筆',
    case when (select count(*) from pg_proc p, aclexplode(p.proacl) x
      where p.proname='claim_invite' and x.grantee='authenticated'::regrole
        and x.privilege_type='EXECUTE') = 1 then 'PASS' else 'FAIL' end

  union all select 10, 'public 與 anon 不能呼叫', '0 筆',
    (select count(*) from pg_proc p, aclexplode(p.proacl) x
      where p.proname='claim_invite' and x.grantee in (0::regrole, 'anon'::regrole)
        and x.privilege_type='EXECUTE')::text || ' 筆',
    case when (select count(*) from pg_proc p, aclexplode(p.proacl) x
      where p.proname='claim_invite' and x.grantee in (0::regrole, 'anon'::regrole)
        and x.privilege_type='EXECUTE') = 0 then 'PASS' else 'FAIL' end

  -- ── 以下三條確認這一支「沒有」動到舊門。它們不是形式：
  --    這一步的整個安全性建立在「新門蓋好之前舊門不動」上面。
  union all select 11, '★ 舊門還在：trigger 仍會擋無效邀請碼', '有 invalid_invite',
    case when (select body from trg) like '%invalid_invite%' then '有' else '不見了' end,
    case when (select body from trg) like '%invalid_invite%' then 'PASS' else 'FAIL' end

  union all select 12, '★ role 的 default 這一步仍是 cadre', 'cadre',
    coalesce((select column_default from information_schema.columns
               where table_schema='public' and table_name='profiles' and column_name='role'), '（無）'),
    case when (select column_default from information_schema.columns
                where table_schema='public' and table_name='profiles' and column_name='role')
              like '%cadre%' then 'PASS' else 'FAIL' end

  union all select 13, '★ role 仍然不是使用者改得動的欄位', '0 筆',
    (select count(*) from pg_attribute a, aclexplode(a.attacl) x
      where a.attrelid='public.profiles'::regclass and a.attname='role'
        and x.grantee='authenticated'::regrole and x.privilege_type='UPDATE')::text || ' 筆',
    case when (select count(*) from pg_attribute a, aclexplode(a.attacl) x
      where a.attrelid='public.profiles'::regclass and a.attname='role'
        and x.grantee='authenticated'::regrole and x.privilege_type='UPDATE') = 0
    then 'PASS' else 'FAIL' end
) x order by ord;
