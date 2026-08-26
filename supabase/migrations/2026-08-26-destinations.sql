-- Frame 十一格英文化、月份主題清空、二十四個目的地。
-- 2026-08-26。**使用者已於 2026-08-26 執行完畢，這個檔案是留底。**
-- 控制端當天實測確認：destinations 24 筆（全部 active）／
-- 還有主題的月份 0／還有中文的鏡頭格 0。
--
-- ── Frame 為什麼改英文 ──
-- 只有題目與說明改英文（activities 的 title_zh / description、milestones 的文案）。
-- **介面文字全部留中文**：蓋章、前一頁、我的護照、進度牆、清除這本護照，
-- 以及資料頁的「PASSPORT NO. / 護照號碼」這類雙語標籤。
-- 理由：幹部裡有還在唸高中的成員，介面用中文比較順；題目與說明改英文是因為
-- 多數幹部在海外，而且這些內容會被拿去做成年末的展示素材。
--
-- ── 十一格的排序依據 ──
-- 「一天」的框架已廢除。新的十一格是你每天路過但從來沒看過的東西 ——
-- 三十個人拍同一樣東西，六個國家的差別會自己跑出來。
-- 三格綁節慶（09 中秋、12 聖誕、02 春節），其餘照氣候與光線排。
-- **七月的凸面鏡是刻意收尾：那是唯一一張你會入鏡的照片。**
--
-- 這段 SQL 可以重複執行。它不會新增、修改或刪除 passports、stamps、entries、
-- invite_codes 的任何一列。

-- ---------- 1. Frame 十一格改英文 ----------
update public.activities set title_zh='The Moon',            title_en='THE MOON',      description='It''s Mid-Autumn. Thirty of us in six countries, looking at the exact same moon. Shoot it however it looks from where you are.' where id='09C';
update public.activities set title_zh='A Bus Stop',          title_en='BUS STOP',      description='The one you wait at most. The sign, the shelter, the route map — any of it counts.' where id='10C';
update public.activities set title_zh='A Sunset',            title_en='SUNSET',        description='The month it gets dark earliest. Walk out at five and it''s already happening.' where id='11C';
update public.activities set title_zh='A Christmas Tree',    title_en='CHRISTMAS TREE',description='Street corner, department store, or the sad plastic one in your dorm. All of them count.' where id='12C';
update public.activities set title_zh='A Street Lamp',       title_en='STREET LAMP',   description='Longest nights of the year. Find one that''s on.' where id='01C';
update public.activities set title_zh='A Dinner Table',      title_en='DINNER TABLE',  description='Lunar New Year. Some of us are at a family reunion, some are eating alone abroad. Same prompt, very different photos.' where id='02C';
update public.activities set title_zh='A Bench',             title_en='BENCH',         description='Roadside, campus, park. You don''t have to sit on it.' where id='03C';
update public.activities set title_zh='The Sky',             title_en='THE SKY',       description='Spring. Just look up.' where id='04C';
update public.activities set title_zh='A Street View',       title_en='STREET VIEW',   description='Walk outside and shoot where you live.' where id='05C';
update public.activities set title_zh='A Manhole Cover',     title_en='MANHOLE COVER', description='Look down. You step over it dozens of times a day and have never once looked at it.' where id='06C';
update public.activities set title_zh='A Convex Mirror',     title_en='CONVEX MIRROR', description='The round mirror at a blind corner. You''ll be in it — the last photo of the year is you.' where id='07C';

-- ---------- 2. 月份主題清空 ----------
-- 右上角那個位置從此空著。前端在 theme_zh 為空時整個 .mtheme 不渲染
-- （src/ui.js 的 monthPageHTML），理由不是版面 —— 實測 1280px 三種情況下
-- .mhead 都是 71.27 —— 而是不要在 DOM 裡留一個永遠是空的元素。
update public.months set theme_zh='', theme_en='';

-- ---------- 3. 目的地 ----------
-- 入境章的城市池。這二十四個城市真的都有 BT 的人。
-- **新增是安全的**（已經發出去的章存在 visas 裡，見 2026-08-26-visas.sql），
-- 而**刪除會被資料庫擋下來** —— visas.code 對這張表的 code 有外鍵。
create table if not exists destinations (
  code   text primary key,
  city   text not null,
  active boolean default true
);

alter table destinations enable row level security;
drop policy if exists destinations_read on destinations;
create policy destinations_read on destinations
  for select to authenticated using (true);

-- 預設的 grant 包含 TRUNCATE，而 RLS 管不到 TRUNCATE，所以先 revoke 再 grant。
revoke all on destinations from anon, authenticated;
grant select on destinations to authenticated;

insert into destinations (code, city) values
  ('TPE','TAIPEI'),        ('LAX','LOS ANGELES'),  ('JFK','NEW YORK'),
  ('BNA','NASHVILLE'),     ('MSN','MADISON'),      ('SFO','SAN FRANCISCO'),
  ('SEA','SEATTLE'),       ('ORD','CHICAGO'),      ('BOS','BOSTON'),
  ('BWI','BALTIMORE'),     ('PHL','PHILADELPHIA'), ('SAN','SAN DIEGO'),
  ('ROC','ROCHESTER'),     ('IND','INDIANAPOLIS'), ('CLT','CHARLOTTE'),
  ('SLC','SALT LAKE CITY'),('YVR','VANCOUVER'),    ('YYZ','TORONTO'),
  ('BRU','BRUSSELS'),      ('AMS','AMSTERDAM'),    ('LHR','LONDON'),
  ('NRT','TOKYO'),         ('ICN','SEOUL'),        ('SYD','SYDNEY')
on conflict (code) do update set city = excluded.city;

-- ---------- 4. 確認 ----------
-- 三個數字要是 24 / 0 / 0。2026-08-26 實測相符。
select
  (select count(*) from destinations)                             as 目的地,
  (select count(*) from months where coalesce(theme_zh,'') <> '') as 還有主題的月份,
  (select count(*) from activities where category='frame'
     and description ~ '[\u4e00-\u9fff]')                          as 還有中文的鏡頭格;
