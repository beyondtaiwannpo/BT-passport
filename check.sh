#!/usr/bin/env bash
# BT Passport 靜態檢查。對應 spec §11 的視覺項與金鑰項。
# 用法：./check.sh
#
# 寫新檢查前讀這段（2026-08-25，同一個坑咬過四次）：
# 「必須存在」型的 grep 守門一律要錨定到程式碼的完整形式（行首空白 + 完整的
# 選擇器/呼叫），不要只 grep 一個裸字串。理由：這個 repo 的註解習慣解釋規則
# 本身（例如「修法是 min-width:0 加上 overflow-wrap:anywhere」），註解裡的
# 敘述句會含有跟真正宣告一樣的字面，於是「grep -q 那個字串」會被註解餵飽，
# 就算把宣告本身刪掉，守門依然回報 ok —— 而且是安靜地壞，不會像下面「必須不
# 存在」型的守門那樣因為誤報 FAIL 而當場被發現。2026-08-25 實測過：
# overflow-wrap:anywhere 那條就這樣壞掉，直到專門的破壞測試才抓到。
# 「必須不存在」型的守門（grep 到就 bad）不受這個坑影響：註解污染只會讓它
# 誤報 FAIL，那個方向是安全的，不用特別錨定。
set -u
fail=0
say() { printf '%s\n' "$1"; }
bad() { printf 'FAIL  %s\n' "$1"; fail=1; }
ok()  { printf 'ok    %s\n' "$1"; }

# 2026-08-31（階段 2）：加入 index.html 與 shared/。
# 色票與字體 token 搬到 shared/brand.css 之後，範圍不跟著擴的話，
# 三色與兩字體這兩條規則就等於對「色票實際住的地方」完全不設防——
# 守門會照樣全綠，因為它掃的是一個已經沒有色票的檔案（README 第 10 項）。
FILES="index.html shared passport/index.html passport/src passport/activities.json"

# §11-6 secret key 絕不可入庫。兩支各自獨立回報（不是 elif）——
# 一支沒抓到，不能蓋掉另一支抓到的事。

# sb_secret_ leg：全 repo 掃，不排除任何目錄（含 docs/、.superpowers/、
# check.sh 自己）。真金鑰的字首後面一定接著一長串英數字元；pattern 要求字首後
# 緊接 8 碼以上連續英數，規劃文件用白話文提到這個字首時（例如反引號、刪節號、
# 空格、`\|`）湊不出這個長度，所以不需要也不應該排除任何目錄。
if grep -rIEq --exclude-dir=.git 'sb_secret_[A-Za-z0-9]{8,}' . ; then
  bad "§11-6 repo 裡出現 sb_secret_ 金鑰"
  grep -rInE --exclude-dir=.git 'sb_secret_[A-Za-z0-9]{8,}' .
else
  ok "§11-6 沒有 sb_secret_ 金鑰"
fi

# service_role leg：這個字全 repo 掃一定會撞到 spec/plan 文件討論它的地方——
# 它是一個合法英文詞，規劃文件會直接當名詞寫，前後沒有能拿來過濾字元數的東西。
# 所以縮小到真的會被部署出去的範圍：passport/index.html、src/、passport/activities.json、
# .github/（現在還不存在；用 -d 判斷要不要加進掃描清單，不讓「路徑不存在」
# 這件事把 grep 的錯誤結束碼跟「沒掃到東西」混在一起，害這支檢查誤判成通過）。
# 不掃 docs/、.superpowers/、vendor/（vendor 之後會放 supabase-js，原始碼裡
# service_role 是 API 的一部分）。
service_scope="index.html shared passport/index.html passport/src passport/activities.json"
[ -d .github ] && service_scope="$service_scope .github"
if grep -rIq service_role $service_scope 2>/dev/null; then
  bad "§11-6 repo 裡出現 service_role"
  grep -rIn service_role $service_scope 2>/dev/null
else
  ok "§11-6 沒有 service_role"
fi

# §11-14 只有三色。抓所有 #hex，扣掉三個允許值。
# ESTAMP-PALETTE 區塊是這條規則**唯一**的例外（使用者 2026-08-26）——
# 排除它再掃，不是把十個季節色加進允許值。加進允許值等於讓那十色在任何地方
# 都合法，那就是使用者明確拒絕的「放寬」。$FILES 現在是
# "passport/index.html src passport/activities.json"：passport/index.html 要先剝掉色盤區塊，
# 其餘檔案（src、passport/activities.json）不受影響、照舊整份掃。
strayA=$(sed '/ESTAMP-PALETTE-BEGIN/,/ESTAMP-PALETTE-END/d' passport/index.html \
         | grep -ohI '#[0-9A-Fa-f]\{3,8\}\b')
strayB=$(grep -rhIo '#[0-9A-Fa-f]\{3,8\}\b' index.html shared passport/src passport/activities.json 2>/dev/null)
stray=$(printf '%s\n%s\n' "$strayA" "$strayB" \
        | tr 'a-f' 'A-F' | sort -u | grep -v '^$' \
        | grep -v '^#FFC46C$' | grep -v '^#EDE5D8$' | grep -v '^#102A86$')
if [ -n "$stray" ]; then
  bad "§11-14 出現不允許的色碼："
  printf '%s\n' "$stray"
else
  ok "§11-14 只有三個色碼（ESTAMP-PALETTE 區塊是唯一例外，另外守在下面）"
fi

# .estamp 的季節色盤是三色規則的**唯一例外**（使用者 2026-08-26）。
# 清單寫死在這裡，不用萬用字元 —— 例外要一次只開一個洞，不是開一扇門。
# 新增或修改任何一色都必須同時改這一行，那是刻意的摩擦。
ESTAMP_PALETTE="#C77A2E #A85C3A #7E4A48 #4A3F5C #2E3D6B #2A5C6E #2F6B5E #3D7A54 #5E8248 #8A7A3C"

# 哨兵各自只准出現一次。多一個或少一個都會讓下面兩條抽錯範圍，
# 而抽錯範圍的守門比沒有守門更糟（README 第 10 項）。
# 這裡的 grep -c 數的是「行數」，跟一行一個哨兵的事實一致；不是 firstError
# 那種「兩處可能擠在同一行」的情境，不受 README 第 12 項那個 grep -c 陷阱影響——
# 旁邊特別註明，免得下一個人以為這裡也踩到了。
b=$(grep -c 'ESTAMP-PALETTE-BEGIN' passport/index.html)
e=$(grep -c 'ESTAMP-PALETTE-END' passport/index.html)
if [ "$b" = "1" ] && [ "$e" = "1" ]; then
  ok "ESTAMP-PALETTE 的哨兵各一個"
else
  bad "ESTAMP-PALETTE 的哨兵不是各一個（${b} / ${e}）"
fi

# 方向一：區塊裡的色碼必須**剛好等於**清單。多一個少一個都 FAIL。
# 這一條讓「偷偷加第十二色」不可能，而不只是「不鼓勵」——集合相等，不是包含。
inside=$(sed -n '/ESTAMP-PALETTE-BEGIN/,/ESTAMP-PALETTE-END/p' passport/index.html \
         | grep -ohI '#[0-9A-Fa-f]\{6\}' | tr 'a-f' 'A-F' | sort -u)
want=$(printf '%s\n' $ESTAMP_PALETTE | tr 'a-f' 'A-F' | sort -u)
if [ "$inside" = "$want" ]; then
  ok "ESTAMP-PALETTE 區塊裡的色碼剛好等於寫死的清單"
else
  bad "色盤區塊裡的色碼跟 check.sh 寫死的清單對不上"
fi

# 方向二：這些色碼**不准出現在區塊外面**。季節色是入境章專用的，
# 不是「解禁了十色可以到處用」。
outside=$(sed '/ESTAMP-PALETTE-BEGIN/,/ESTAMP-PALETTE-END/d' passport/index.html; cat index.html shared/* passport/src/*.js passport/activities.json 2>/dev/null)
outsidebad=0
for c in $ESTAMP_PALETTE; do
  if printf '%s' "$outside" | grep -qiF "$c"; then
    bad "季節色 $c 出現在色盤區塊之外"
    outsidebad=1
  fi
done
[ "$outsidebad" = "0" ] && ok "季節色沒有出現在色盤區塊之外"

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

# §11-14 不允許 rgb()/hsl()（三色只能用 hex 或上面那三種 rgba 底色定義；
# rgb( 這個 pattern 天生不會誤吃 rgba( ——"rgb" 後面緊接的是 "a" 不是 "("，
# 所以不用另外排除）。
strayfunc=$(grep -rhIoE 'rgb\([^)]*\)|hsl\([^)]*\)' $FILES 2>/dev/null | sort -u)
if [ -n "$strayfunc" ]; then
  bad "§11-14 出現不允許的 rgb()/hsl()："
  printf '%s\n' "$strayfunc"
else
  ok "§11-14 沒有 rgb()/hsl()"
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

# §10-1 分類代碼。排除 SVG 濾鏡的 xChannelSelector="R" / yChannelSelector="G"
# ——這是原型就有、蓋章要用的墨水紋理效果，不是分類代碼。只濾掉
# ChannelSelector="X" 這個精確片段，不是整行都不看，避免真的分類代碼殘留
# 剛好跟這段 SVG 擠在同一行時被一起蓋過去。
catcodes=$(grep -rnIE '"[GPF]"' $FILES 2>/dev/null | grep -v 'ChannelSelector="[PGF]"')
if [ -n "$catcodes" ]; then
  bad "§10-1 還有原型的 G/P/F 分類代碼："
  printf '%s\n' "$catcodes"
else
  ok "§10-1 分類代碼已統一"
fi

# §10-2 33 格
if grep -rIq '36 格' $FILES 2>/dev/null; then
  bad "§10-2 還有『36 格』的文案"
else
  ok "§10-2 沒有 36 格"
fi

# §10-3 進度牆 11 欄。容忍 repeat(12,1fr) 與 repeat(12, 1fr) 這類空白差異。
if grep -rIqE 'repeat\(\s*12\s*,' $FILES 2>/dev/null; then
  bad "§10-3 .track 還是 12 欄"
else
  ok "§10-3 .track 不是 12 欄"
fi

# §11-20 不得出現個人聯絡方式：檢查除了組織信箱以外的 email
mails=$(grep -rhIo --exclude-dir=vendor '[A-Za-z0-9._%+-]*@[A-Za-z0-9.-]*\.[A-Za-z]\{2,\}' $FILES 2>/dev/null \
        | sort -u | grep -v '^beyondtaiwan2020@gmail.com$' | grep -v 'example.com$')
if [ -n "$mails" ]; then
  bad "§11-20 出現非組織信箱："
  printf '%s\n' "$mails"
else
  ok "§11-20 只有組織信箱"
fi

# 按鈕 reset 必須是零特異性。裸寫 #bt-root button 的特異性 (1,0,1) 會蓋掉所有
# 用 class 描述外觀的規則，全站按鈕的邊框與底色會靜靜地全部消失 ——
# 不會報錯，只是東西不見了，而 .dots 只剩 aria-current 的 outline 撐著一顆圓點。
# 這個站從原型到 2026-08-22 都是這個狀態。見 spec 2026-08-22 §1。
if grep -qE '^\s*:where\(#bt-root button\)\{' passport/index.html; then
  ok "按鈕 reset 是零特異性（:where）"
else
  bad "passport/index.html 的按鈕 reset 不是 :where(#bt-root button)，全站 class 規則會被蓋掉（spec 2026-08-22 §1）"
fi

# 月份頁的時刻放大只能掛在 .mtheme.clock b 上。直接改 .mtheme b 的話，
# 資料頁右上角的「BEYOND TAIWAN / Passport · 2026」會跟著變 34px 把版面撐爆 ——
# 而那是一個沒有任何東西會報錯的視覺回歸。2026-08-22 實測過：把選擇器改回
# .mtheme b 之後，check.sh 與全部單元測試都還是綠的，所以需要這兩條。
# 單元測試碰不到這件事：它是 CSS 級聯，要真的瀏覽器才量得出 computed style。
if grep -qE '^\s*\.mtheme\.clock b\{' passport/index.html; then
  ok "時刻放大掛在 .mtheme.clock b 上"
else
  bad "passport/index.html 找不到 .mtheme.clock b，時刻放大可能被改到 .mtheme b（spec 2026-08-22 §5.2）"
fi

# 基底規則不可以帶放大值。抓的是「.mtheme b{...}」這一行裡出現 34px。
if grep -E '^\s*\.mtheme b\{' passport/index.html | grep -q '34px'; then
  bad "passport/index.html 的 .mtheme b 帶了 34px，資料頁右上角會被撐爆（spec 2026-08-22 §5.2）"
else
  ok ".mtheme b 沒有被塞進放大值"
fi

# 說明頁三張卡的標題要固定兩行高，否則使用者刻意寫成同樣開頭的第一句會錯開。
# 這件事單元測試碰不到（是版面高度，要真瀏覽器才量得到），只能在這裡守著寫法。
if grep -qE '^\s*\.slots\.guide \.slot \.ttl\{' passport/index.html; then
  ok "說明頁標題固定兩行高（.slots.guide .slot .ttl）"
else
  bad "passport/index.html 找不到 .slots.guide .slot .ttl，說明頁三張卡的第一句會錯開（spec 2026-08-22 §4.2）"
fi

# 底紋的 SVG 不可以用 %23 編碼的色碼。%23102A86 能正常載入，但 §11-14 的 hex 掃描
# 看不到它 —— 等於整段底紋悄悄脫離三色檢查的守備範圍。改用 rgba(16,42,134,α) 就沒這問題
# （未編碼的 # 不能用：它會被當成 data URI 的 fragment，圖直接不載入，2026-08-23 實測）。
if grep -q '%23' passport/index.html; then
  bad "passport/index.html 出現 %23 編碼的色碼，三色檢查看不到它（改用 rgba(16,42,134,α)）"
  grep -n '%23' passport/index.html
else
  ok "沒有 %23 編碼的色碼，三色檢查涵蓋得到底紋"
fi

# 「清除這本護照」必須維持降級的外觀。它會刪掉一整年的章、心得與照片且不可復原，
# 跟旁邊三顆可逆的操作長得一樣重的話，遲早有人手滑按到。
# 這不是視覺偏好是安全設計 —— 視覺偏好可以被下一個人推翻，安全設計不行，所以釘住它。
if grep -qE '^\s*<button class="btn sm quiet" data-act="reset">' passport/src/ui.js; then
  ok "清除護照的按鈕維持降級外觀（.btn.quiet）"
else
  bad "passport/src/ui.js 的「清除這本護照」不是 class=\"btn sm quiet\"，它會跟可逆操作等重"
fi

if grep -qE '^\s*\.btn\.quiet\{' passport/index.html; then
  ok ".btn.quiet 的樣式定義還在"
else
  bad "passport/index.html 找不到 .btn.quiet 的樣式，那顆按鈕會退回一般外觀"
fi

# fetchAll 裡的查詢數 = firstError 清單的長度。一個都不准被排除在外。
#
# 2026-08-27 之前這條守的是「ms 不准在清單裡」。里程碑移除之後那個 ms 不存在了，
# 於是那條守門**永遠通過** —— 它是 README 第 12 項那條「**移除一個字串，
# 會把所有斷言它不存在的測試變成空的**」的實例，只是發生在守門這一側。
# **看到這條註解的人請回去讀 README 第 12 項**，那裡有另外四個形狀不同、
# 病因一樣的例子。
# 換成數量比對之後才有真實的對象：新增查詢卻忘了加進 firstError，會被抓到。
#
# 用 node 不用 grep：要數的東西有結構（哪些查詢算在 fetchAll 範圍內、
# firstError([...]) 裡有幾個逗號分隔的識別字），grep 表達不出這種範圍與結構。
# 先剝掉整行註解（`^\s*//`）再找 fetchAll 的函式邊界，理由跟既有 firstError
# 那條同一個做法：這個 repo 的註解會解釋規則本身，字面遲早會撞在一起。
# 只數 fetchAll 函式**內**的 `supabase.from(`——loadAll 以外還有別處在用它
# （saveProfile、clearAll……），這些不算數，混進來會讓比對失去意義。
firstErrorGuard=$(node -e '
  const fs = require("fs");
  const raw = fs.readFileSync("passport/src/data.js", "utf8");
  const src = raw.split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");

  const fm = src.match(/function fetchAll\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  if (!fm) { console.log("找不到 fetchAll 函式"); process.exit(1); }
  const q = (fm[1].match(/supabase\.from\(/g) || []).length;

  const fe = src.match(/firstError\(\[[^\]]*\]\)/g) || [];
  if (fe.length !== 2) {
    console.log(`firstError([...]) 沒有出現剛好兩次（出現 ${fe.length} 次）`);
    process.exit(1);
  }
  if (fe[0] !== fe[1]) {
    console.log(`firstError 兩處寫法不一致：\n  ${fe[0]}\n  ${fe[1]}`);
    process.exit(1);
  }
  const inner = fe[0].match(/\[([^\]]*)\]/)[1];
  const l = inner.split(",").map(s => s.trim()).filter(Boolean).length;
  if (q !== l) {
    console.log(`fetchAll 有 ${q} 個查詢，firstError 只收了 ${l} 個`);
    process.exit(1);
  }
  console.log(`fetchAll 有 ${q} 個查詢，firstError 收了 ${l} 個，一致`);
' 2>&1)
if [ $? -eq 0 ]; then
  ok "$firstErrorGuard"
else
  bad "passport/src/data.js 的 firstError 出了問題：$firstErrorGuard"
fi

# boot() 必須整包裝填，不可以退回手寫逐欄指派。手寫的話 loadAll 每多回傳一個東西
# 就要記得加一行，而那件事已經漏過 —— milestones 從上線起就沒被裝進 S，
# 里程碑 UI 在正式站上是死的，而 (S.milestones || []) 的防呆讓它安靜地不渲染，
# 所以沒有人發現（2026-08-25）。單元測試碰不到：main.js 一條測試都沒有。
if grep -qE '^\s*Object\.assign\(S, all\);' passport/src/main.js; then
  ok "boot() 整包裝填 loadAll 的結果"
else
  bad "passport/src/main.js 的 boot() 不是 Object.assign(S, all)，新欄位會靜靜地不進 S"
fi

# 長英文字串與網址會把 grid 的 1fr 撐開，三格寬度重新分配（實測 158/633/129，
# 正常是 282 三等分）。修法是 .slot 的 min-width:0 加上內容的 overflow-wrap:anywhere。
#
# 2026-08-25 實測推翻了「兩個缺一不可」這個原本的說法：單獨的 overflow-wrap:anywhere
# 就足以讓三欄維持 282/282/282（它會被計入 min-content 尺寸計算，不同於舊式的
# word-break:break-word）；只留 min-width:0 的話欄寬也不會壞，但文字不斷行、
# 溢出格子邊界約 308px——換一種形狀的視覺 bug，不是「缺一不可」。
# 兩個都留是防禦深度：overflow-wrap 只斷得了文字，min-width:0 擋的是斷不了的東西
# （比格子寬的圖、<pre>、white-space:nowrap 的元素），兩者擋的是不同的東西，
# 只是在「長英文字串」這個案例上剛好重疊，所以兩個條件都要成立才 ok。
#
# 這條本身在 2026-08-25 審查中被抓到一個 Critical：overflow-wrap:anywhere 這個
# 字面在上面的註解裡出現了三次，而原本的 grep 沒有錨定行首——註解把守門餵飽，
# 就算把 369 行 .slot .note,.slot .hint{overflow-wrap:anywhere} 那條宣告整行
# 刪掉，check.sh 依然印 ok。現在錨定到宣告的完整形式（行首空白 + 選擇器 +
# {overflow-wrap:anywhere}），敘述句裡的字面無論怎麼寫都不會命中。
#
# 單元測試碰不到這件事（是版面寬度，要真瀏覽器才量得到），而且它不會有橫向捲軸、
# 不像跑版，只像「某一格怪怪的」，人工也不容易發現。
if grep -qE '^\s*min-width:0;' passport/index.html && grep -qE '^\s*\.slot \.note,\.slot \.hint\{overflow-wrap:anywhere\}' passport/index.html; then
  ok "長字串不會撐開格子（min-width:0 防斷不了的內容、overflow-wrap:anywhere 防長字串）"
else
  bad "passport/index.html 少了 min-width:0 或 .slot .note,.slot .hint{overflow-wrap:anywhere} 這條宣告本身——兩個都沒有時長英文字串會撐寬格子；只少 overflow-wrap（min-width:0 還在）不會撐寬，是文字溢出格子邊界"
fi

# 章的數量整個 passport/src/ui.js 只准數一次，就是 stampCount 裡那次。
# barHTML 的「N / 33」、idPageHTML 的 FULL 疊印、里程碑的達成判斷，全部吃它的結果。
# 這條守的是架構不是行為，測試碰不到：兩邊各自用同一條公式算一次的話，
# 算出來永遠一樣，任何比對結果的測試都會是綠的（2026-08-25 實測，42 個測試全綠）。
# 真正會出事的是有人只改了其中一處的定義 —— 那時候畫面上兩個數字會不一致，
# 而沒有任何東西會報錯。
# 用 grep -o | wc -l 數出現次數，不用 grep -c —— grep -c 數的是「符合的行數」，
# 把兩次出現寫在同一行（例如加一個 sneaky 變數重複算一次，塞進同一行）會讓
# grep -c 回 1，這條檢查就會誤判成「只有一處」而放行，對它要擋的東西沒有效果
# （2026-08-25 審查實測過）。tr -d ' ' 是因為 macOS 的 wc -l 會補前導空白，
# 不去掉的話字串比對永遠對不上。
n=$(grep -o 'Object\.keys(S\.stamps)\.length' passport/src/ui.js | wc -l | tr -d ' ')
if [ "$n" = "1" ]; then
  ok "章的數量只在 stampCount 裡數一次"
else
  bad "passport/src/ui.js 有 $n 處在數 S.stamps，應該只有 stampCount 那一處"
  grep -n 'Object\.keys(S\.stamps)\.length' passport/src/ui.js
fi

# spec §10.1（2026-08-26 第二輪）：入境章的判準整個換掉，現在**可以**壓到
# .slot 裡的內容——章蓋在可點的格子上面，pointer-events:none 從裝飾性的保險
# 變成**載重的**：少了它，蓋滿的月份會有兩格點不開，而且不會有任何東西報錯
# （按下去的是章不是底下的按鈕，畫面看起來完全正常）。
# 這是「必須存在」型，錨定到 .estamp 選擇器本身再看它底下那一行完整宣告
# （見 README 第 10 項）——不能只 grep 裸字串 pointer-events:none，
# .overprint 那條規則字面上也長得幾乎一樣（同樣 top/right/z-index/pointer-events），
# 沒錨定的話拿掉 .estamp 的 pointer-events:none 之後這條照樣會看到 .overprint
# 那一行然後誤判成 ok。用 `.estamp{` 單獨成行去對，媒體查詢裡那個
# `.estamp{top:26px;...}`（同一行寫完，選擇器後面不是換行）不會被這個 pattern 選中，
# 所以只會抓到桌機那個主要宣告——加守門時已經刪掉這行宣告本身跑過一次，確認真的 FAIL。
if grep -A1 '^\s*\.estamp{$' passport/index.html | tail -1 | grep -qE '^\s*position:absolute;top:[0-9]+px;right:[0-9]+px;z-index:2;pointer-events:none;'; then
  ok ".estamp 的 pointer-events:none 還在"
else
  bad ".estamp 少了 pointer-events:none，蓋滿的月份會有格子點不開"
fi

# 單元測試。node 不在的話**算失敗不算通過** —— 「沒跑到」跟「跑過而且過了」
# 在一支檢查腳本裡長得一模一樣，那正是最容易騙過自己的地方。
#
# **參數要寫成 test/*.test.mjs，不要寫成 test/。** 實測（node 24.17.0）：
# `node --test test/` 不會遞迴進目錄，它把目錄本身當成一支測試檔去執行，
# 然後 MODULE_NOT_FOUND —— 而那個失敗長得像「測試沒過」，不像「指令寫錯」。
if command -v node >/dev/null 2>&1; then
  if node --test test/*.test.mjs >/dev/null 2>&1; then
    ok "單元測試通過（node --test test/*.test.mjs）"
  else
    bad "單元測試沒過。跑 node --test test/*.test.mjs 看細節"
  fi
else
  bad "找不到 node，單元測試沒有跑到（這不是通過）"
fi

# prefers-reduced-motion 的涵蓋率。**這是無障礙需求不是視覺偏好**，所以由機器守門，
# 不只寫在 CSS 裡（使用者 2026-08-25 的裁定）。
# 2026-08-18 那次 .overprint.land 漏在 reduce 之外，是人工逐條比對才抓到的 ——
# 它只在集滿 33 格那一刻出現，平常測不到。這支讓那件事不可能再發生。
if command -v node >/dev/null 2>&1; then
  motion=$(node check-motion.mjs 2>&1)
  if [ $? -eq 0 ]; then
    ok "reduced-motion 涵蓋所有動畫（${motion}）"
  else
    bad "有動畫沒有被 prefers-reduced-motion 關掉："
    printf '%s\n' "$motion"
  fi
else
  bad "找不到 node，reduced-motion 檢查沒有跑到（這不是通過）"
fi

# check.sh 自己的陷阱：**變數名後面緊接非 ASCII 字元**（這個檔案裡就是全形括號）。
# bash 3.2（macOS 系統 bash）在 UTF-8 locale 下會把後面那個字的延續位元組併進
# 變數名，於是 `echo "（$e）"` 變成引用一個不存在的變數，在 set -u 之下
# 直接中止整支腳本。2026-08-26 一天內踩到兩次：`（$motion）` 與 `（$b / $e）`。
# **兩次都只在守門真的 FAIL 的那條路徑上才會爆**，正常全綠時完全看不出來 ——
# 所以它躲得過每一次「跑一下 check.sh 看有沒有過」。修法是加大括號：${e}。
#
# 用 node 不用 grep：BSD 與 GNU 的 grep 對非 ASCII 字元類的支援不一致，
# 而 JS 的 /[^\x00-\x7F]/ 定義明確。控制端第一版用 grep 寫，pattern 還寫成
# 「變數後面接**左**括號」—— 真正的 bug 是右括號，那條守門對合成的違規行
# 完全抓不到。這一條是「必須不存在」型（README 第 10 項的安全方向）。
#
# 掃描前會剝掉 shell 的整行註解（`^\s*#`）：這一整段註解為了說明問題，
# 免不了要寫出違規的字面，不剝的話這條守門會抓到自己然後永遠 FAIL。
# **JS 那段裡面也不要寫違規字面** —— `//` 開頭的行不在剝除範圍內
# （剝的是 shell 註解），控制端 2026-08-26 就這樣讓它抓到自己一次。
if node -e '
  // 先剝掉 shell 的整行註解，理由見上面那段（註解不會執行）。
  const s = require("fs").readFileSync("check.sh", "utf8")
    .split("\n").filter(l => !/^\s*#/.test(l)).join("\n");
  const m = s.match(/\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7F]/g);
  if (m) { console.log([...new Set(m)].join("  ")); process.exit(1); }
' 2>/dev/null; then
  ok "check.sh 沒有變數名緊接非 ASCII 字元"
else
  bad "check.sh 裡有變數名緊接非 ASCII 字元，FAIL 路徑上會 unbound variable："
  node -e '
    const s = require("fs").readFileSync("check.sh", "utf8");
    s.split("\n").forEach((l, i) => {
      if (/^\s*#/.test(l)) return;
      if (/\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7F]/.test(l)) console.log(`  ${i+1}: ${l.trim()}`);
    });
  '
fi

# 佔位文案不可以進到已經定稿的部署範圍
#
# 2026-08-22 出過事，記在 docs/superpowers/specs/2026-08-22-guide-page-and-slot-order-design.md：
# 說明頁三段文案留著佔位字，之後又做了三輪都沒再推，正式站對三十個幹部顯示那四個字。
# 沒有任何東西會提醒你 —— 它不會報錯、畫面也不會壞，只是內容是假的。
#
# 這是「必須不存在」型的守門，照本檔檔頭那段說明，這一型不受註解污染影響
# （註解裡出現只會讓它誤報 FAIL，那個方向是安全的），所以不需要錨定完整形式。
#
# 範圍現在只有 passport/。根目錄的 index.html 在 2026-08-31（階段 1）是刻意的骨架，
# 本文全部是佔位字，文案由使用者提供、還沒給。
# **階段 7 那一頁的文案定稿之後，把 index.html 加進下面這行的範圍。**
placeholder_scope="passport/index.html passport/src passport/activities.json"
if grep -rIq '【待補文案】' ${placeholder_scope} 2>/dev/null; then
  bad "部署範圍裡還有佔位文案，會直接顯示給使用者（2026-08-22 出過事）"
  grep -rIn '【待補文案】' ${placeholder_scope}
else
  ok "passport/ 裡沒有佔位文案"
fi

# CNAME 不可掉，而且內容要對
#
# 2026-08-31 之前這條只檢查「檔案存在」。那守不住它真正要守的東西：
# CNAME 的**內容**就是 GitHub Pages 的自訂網域設定，內容錯了站台一樣會掉，
# 而檔案還在、守門照樣綠。這一輪正好要改它的內容（passport.beyondtaiwannpo.com
# → beyondtaiwannpo.com），所以一起補上。
#
# 比對整個檔案而不是 grep 一個子字串，有兩個理由：
#   1. grep 子字串的話，'passport.beyondtaiwannpo.com' 裡面也含有
#      'beyondtaiwannpo.com'，寫錯成舊網域照樣會過。
#   2. CNAME 沒有註解，整檔比對不會踩到檔頭講的那個「註解餵飽守門」的坑。
# 這是「必須存在」型的守門，所以錨定到完整形式 —— 就是整個檔案的內容。
EXPECTED_CNAME="beyondtaiwannpo.com"
if [ ! -f CNAME ]; then
  bad "CNAME 不見了，自訂網域會掉（spec §8）"
else
  actual_cname=$(tr -d ' \t\r\n' < CNAME)
  if [ "$actual_cname" = "$EXPECTED_CNAME" ]; then
    ok "CNAME 存在且內容是 $EXPECTED_CNAME"
  else
    bad "CNAME 內容不對：預期 ${EXPECTED_CNAME}，實際 ${actual_cname}（spec §8-1）"
  fi
fi

[ $fail -eq 0 ] && say "" && say "全部通過。" || { say ""; say "有項目未通過。"; }
exit $fail
