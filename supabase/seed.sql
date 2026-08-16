-- BT Passport seed
-- 用法：整份貼進 Supabase SQL Editor 執行，在 schema.sql 之後。可以重複執行。
--
-- 資料逐字取自 activities.json（唯一來源）。
-- 課程組日後要改文案，直接在 Supabase 後台改 activities 表，不要改這個檔案 ——
-- 這個檔案是「第一次灌資料」用的，重跑會把後台改過的文案蓋回來。
--
-- 跟 schema.sql 不一樣：這個檔案的 on conflict ... do update 是真的會更新既有資料列，
-- 不是像 schema.sql 的表結構那樣重跑會被跳過。
-- 但重跑只會「新增」跟「更新」，不會「刪除」——如果某個活動之後從這個檔案拿掉了，
-- 資料庫裡原本那一列不會被清掉。這是刻意的：專案規則是停用而不刪除，
-- 要下架一個活動請把 active 設成 false，不要指望重跑這個檔案會幫你刪掉它。
--
-- 兩個容易看錯的地方：
--   seq 是學年順序（9 月 = 1），不是月份數字。月份頁的排序用它。
--   category 是 gather / prompt / frame，不是原型用的 G / P / F。

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

-- callback_to 是指向 activities 自己的 FK，07B 要指的 09B 在同一批裡面，
-- 所以先全部插入、不帶 callback_to，最後再單獨補 07B 那一列。
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

-- 07B 回望 09B。回望是靠這個欄位驅動的，程式裡不要寫死 '07B' ——
-- 之後想讓別的格子回望，改這裡就好。
update activities set callback_to = '09B' where id = '07B';
