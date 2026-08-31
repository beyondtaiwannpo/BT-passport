-- 補上 profiles.team 的欄位層級 UPDATE 權限　2026-08-31
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後會印出 PASS / FAIL。
-- 這一支只發一個欄位的權限，不動任何一列資料、不動任何政策。
--
-- ============================================================================
-- 為什麼會漏
-- ============================================================================
-- 規格 §3-1 舉的例子是：
--     grant update (name_zh, name_en, tz, avatar) on profiles to authenticated;
-- 而規格 §3-2 的表格把 profiles 的欄位列成：
--     id、name_zh、name_en、team、role、tz、avatar、updated_at
-- **兩處對不起來，team 在表格裡、不在那行範例裡。** 遷移 A 照那行範例逐字抄，
-- 所以 team 沒有被發出去。
--
-- 後果不是「team 存不進去」而已 —— Postgres 要求 UPDATE 的 SET 清單裡
-- **每一欄**都要有權限，缺一欄就整句被拒。data.js 有三處會把 team 寫進同一句：
--     saveProfile（護照資料頁按儲存）
--     clearAll（清除這本護照）
--     importPassport（匯入還原）
-- 所以這三條路**整條都是壞的**，不是只有 team 那一格存不了。
--
-- ============================================================================
-- 這件事怎麼躲過驗收的
-- ============================================================================
-- 遷移 A 的驗收有一條「可改的欄位剛好是那四欄」，而且是集合相等、不是包含。
-- 它**如實地**通過了 —— 因為它比對的對象是規格那行範例，不是「前端實際會寫哪幾欄」。
-- 斷言寫的是「A 等於 B」，想守的是「A 是對的」（README 第 12 項）。
--
-- §8-3 的 API 實測也如實地通過了：改 role 被擋、改 name_zh 成功。
-- 但那一句只寫 name_zh 一欄，剛好是有權限的那一欄 —— 它證明了
-- 「role 被單獨擋下」，沒有證明「護照資料頁存得了檔」。
-- **量了，但量的是最容易過的那個案例**（README 第 12 項最後一段）。
--
-- 所以這一次除了補權限，也在 check.sh 加了一條守門：
-- 前端往 profiles 寫的每一欄，都必須在允許清單裡。清單寫死在 check.sh，
-- 改權限就要同時改它 —— 那是刻意的摩擦，跟 ESTAMP_PALETTE 同一個做法。
-- ============================================================================

grant update (team) on profiles to authenticated;

-- ---------- 驗收 ----------
-- 集合相等，不是包含。多發一欄（尤其是 role）或少發一欄都會紅。
select * from (
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when
      (select string_agg(distinct a.attname, ',' order by a.attname)
         from pg_attribute a, aclexplode(a.attacl) x
        where a.attrelid = 'public.profiles'::regclass
          and x.grantee = 'authenticated'::regrole and x.privilege_type = 'UPDATE')
        = 'avatar,name_en,name_zh,team,tz'
      and (select count(*) from pg_class c, aclexplode(c.relacl) x
            where c.oid = 'public.profiles'::regclass
              and x.grantee = 'authenticated'::regrole and x.privilege_type = 'UPDATE') = 0
    then 'PASS' else 'FAIL' end as 結果

  union all select 1, '★ 可改的欄位剛好是這五欄', 'avatar,name_en,name_zh,team,tz',
    coalesce((select string_agg(distinct a.attname, ',' order by a.attname)
                from pg_attribute a, aclexplode(a.attacl) x
               where a.attrelid = 'public.profiles'::regclass
                 and x.grantee = 'authenticated'::regrole and x.privilege_type = 'UPDATE'),
             '（一欄都沒發）'),
    case when (select string_agg(distinct a.attname, ',' order by a.attname)
                 from pg_attribute a, aclexplode(a.attacl) x
                where a.attrelid = 'public.profiles'::regclass
                  and x.grantee = 'authenticated'::regrole and x.privilege_type = 'UPDATE')
              = 'avatar,name_en,name_zh,team,tz'
    then 'PASS' else 'FAIL' end

  -- role 仍然改不動 —— 這一支只加 team，那個洞不能因此被撐開。
  union all select 2, '★ role 仍然不在可改的欄位裡', '不在',
    case when exists (select 1 from pg_attribute a, aclexplode(a.attacl) x
                       where a.attrelid = 'public.profiles'::regclass and a.attname = 'role'
                         and x.grantee = 'authenticated'::regrole and x.privilege_type = 'UPDATE')
         then '在裡面' else '不在' end,
    case when exists (select 1 from pg_attribute a, aclexplode(a.attacl) x
                       where a.attrelid = 'public.profiles'::regclass and a.attname = 'role'
                         and x.grantee = 'authenticated'::regrole and x.privilege_type = 'UPDATE')
         then 'FAIL' else 'PASS' end

  union all select 3, '表層級的 UPDATE 仍然是收掉的', '0 筆',
    (select count(*) from pg_class c, aclexplode(c.relacl) x
      where c.oid = 'public.profiles'::regclass
        and x.grantee = 'authenticated'::regrole and x.privilege_type = 'UPDATE')::text || ' 筆',
    case when (select count(*) from pg_class c, aclexplode(c.relacl) x
      where c.oid = 'public.profiles'::regclass
        and x.grantee = 'authenticated'::regrole and x.privilege_type = 'UPDATE') = 0
    then 'PASS' else 'FAIL' end

  union all select 4, 'updated_at 仍然由 trigger 蓋，前端寫不動', '不在',
    case when exists (select 1 from pg_attribute a, aclexplode(a.attacl) x
                       where a.attrelid = 'public.profiles'::regclass and a.attname = 'updated_at'
                         and x.grantee = 'authenticated'::regrole and x.privilege_type = 'UPDATE')
         then '在裡面' else '不在' end,
    case when exists (select 1 from pg_attribute a, aclexplode(a.attacl) x
                       where a.attrelid = 'public.profiles'::regclass and a.attname = 'updated_at'
                         and x.grantee = 'authenticated'::regrole and x.privilege_type = 'UPDATE')
         then 'FAIL' else 'PASS' end
) x order by ord;
