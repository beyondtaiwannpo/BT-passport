// 時區的中文與地名別名（規格 §5-4）。
//
// **為什麼要自己維護一份**：瀏覽器只給得到 IANA 名稱（America/Detroit），
// 而幹部通常不知道自己在哪個 IANA 時區。大城市他還猜得到，
// NASHVILLE、MADISON、CHARLOTTE、SALT LAKE CITY、ROCHESTER 這種完全猜不到。
// 在「不引進套件」之下這是唯一的做法。
//
// **範圍**：destinations 那 24 個城市（那就是 BT 的人真的在的地方）
// 加上台／美／加／歐／澳／日韓的常見地區。不做全世界。
//
// ⚠ **destinations 加了新城市的話，這裡要跟著加。**
// check.sh 有一條在守：那 24 個城市每一個都要搜得到，少一個就紅。
// 那條守門讀的是 supabase/migrations/2026-08-26-destinations.sql ——
// 如果有人直接在後台改 destinations 而沒有留下 migration，守門看不到那個改動，
// 所以 README 的「destinations 可以怎麼動」那一節也寫了這件事。

export const TZ_ALIAS = [
  // ── 台灣 ──
  { tz: "Asia/Taipei", zh: ["台北", "臺北", "台灣", "臺灣", "高雄", "台中", "臺中", "台南", "臺南", "新竹", "桃園", "基隆", "嘉義"], en: ["Taipei", "Taiwan", "Kaohsiung", "Taichung", "Tainan", "Hsinchu", "TPE"] },

  // ── 美國東部 ──
  { tz: "America/New_York", zh: ["紐約", "波士頓", "費城", "巴爾的摩", "夏洛特", "羅徹斯特", "亞特蘭大", "邁阿密", "匹茲堡", "華盛頓", "美東"], en: ["New York", "NYC", "Boston", "Philadelphia", "Philly", "Baltimore", "Charlotte", "Rochester", "Atlanta", "Miami", "Pittsburgh", "Washington DC", "Eastern", "JFK", "BOS", "PHL", "BWI", "CLT", "ROC"] },
  { tz: "America/Detroit", zh: ["底特律", "密西根", "安娜堡"], en: ["Detroit", "Michigan", "Ann Arbor"] },
  { tz: "America/Indiana/Indianapolis", zh: ["印第安納波利斯", "印第安納"], en: ["Indianapolis", "Indiana", "IND"] },

  // ── 美國中部 ──
  { tz: "America/Chicago", zh: ["芝加哥", "納許維爾", "納士維", "麥迪遜", "休士頓", "達拉斯", "明尼阿波利斯", "聖路易", "美中"], en: ["Chicago", "Nashville", "Madison", "Houston", "Dallas", "Minneapolis", "St. Louis", "Central", "ORD", "BNA", "MSN"] },

  // ── 美國山區 ──
  { tz: "America/Denver", zh: ["丹佛", "鹽湖城", "猶他", "科羅拉多"], en: ["Denver", "Salt Lake City", "Utah", "Colorado", "Mountain", "SLC"] },
  { tz: "America/Phoenix", zh: ["鳳凰城", "亞利桑那"], en: ["Phoenix", "Arizona"] },

  // ── 美國西部 ──
  { tz: "America/Los_Angeles", zh: ["洛杉磯", "舊金山", "聖地牙哥", "西雅圖", "加州", "美西"], en: ["Los Angeles", "LA", "San Francisco", "SF", "Bay Area", "San Diego", "Seattle", "California", "Pacific", "LAX", "SFO", "SAN", "SEA"] },
  { tz: "America/Anchorage", zh: ["安克拉治", "阿拉斯加"], en: ["Anchorage", "Alaska"] },
  { tz: "Pacific/Honolulu", zh: ["檀香山", "夏威夷"], en: ["Honolulu", "Hawaii"] },

  // ── 加拿大 ──
  { tz: "America/Toronto", zh: ["多倫多", "渥太華", "蒙特婁"], en: ["Toronto", "Ottawa", "Montreal", "YYZ"] },
  { tz: "America/Vancouver", zh: ["溫哥華"], en: ["Vancouver", "YVR"] },
  { tz: "America/Edmonton", zh: ["卡加利", "艾德蒙頓"], en: ["Calgary", "Edmonton"] },

  // ── 歐洲 ──
  { tz: "Europe/London", zh: ["倫敦", "英國", "愛丁堡"], en: ["London", "UK", "Britain", "Edinburgh", "LHR"] },
  { tz: "Europe/Dublin", zh: ["都柏林", "愛爾蘭"], en: ["Dublin", "Ireland"] },
  { tz: "Europe/Amsterdam", zh: ["阿姆斯特丹", "荷蘭"], en: ["Amsterdam", "Netherlands", "AMS"] },
  { tz: "Europe/Brussels", zh: ["布魯塞爾", "比利時"], en: ["Brussels", "Belgium", "BRU"] },
  { tz: "Europe/Paris", zh: ["巴黎", "法國"], en: ["Paris", "France"] },
  { tz: "Europe/Berlin", zh: ["柏林", "慕尼黑", "德國"], en: ["Berlin", "Munich", "Germany"] },
  { tz: "Europe/Madrid", zh: ["馬德里", "巴塞隆納", "西班牙"], en: ["Madrid", "Barcelona", "Spain"] },
  { tz: "Europe/Rome", zh: ["羅馬", "米蘭", "義大利"], en: ["Rome", "Milan", "Italy"] },
  { tz: "Europe/Zurich", zh: ["蘇黎世", "瑞士"], en: ["Zurich", "Switzerland"] },
  { tz: "Europe/Vienna", zh: ["維也納", "奧地利"], en: ["Vienna", "Austria"] },
  { tz: "Europe/Stockholm", zh: ["斯德哥爾摩", "瑞典"], en: ["Stockholm", "Sweden"] },
  { tz: "Europe/Copenhagen", zh: ["哥本哈根", "丹麥"], en: ["Copenhagen", "Denmark"] },
  { tz: "Europe/Oslo", zh: ["奧斯陸", "挪威"], en: ["Oslo", "Norway"] },
  { tz: "Europe/Lisbon", zh: ["里斯本", "葡萄牙"], en: ["Lisbon", "Portugal"] },
  { tz: "Europe/Prague", zh: ["布拉格", "捷克"], en: ["Prague", "Czech"] },
  { tz: "Europe/Warsaw", zh: ["華沙", "波蘭"], en: ["Warsaw", "Poland"] },

  // ── 亞洲 ──
  { tz: "Asia/Tokyo", zh: ["東京", "大阪", "京都", "日本", "名古屋", "福岡"], en: ["Tokyo", "Osaka", "Kyoto", "Japan", "Nagoya", "Fukuoka", "NRT"] },
  { tz: "Asia/Seoul", zh: ["首爾", "釜山", "韓國"], en: ["Seoul", "Busan", "Korea", "ICN"] },
  { tz: "Asia/Hong_Kong", zh: ["香港"], en: ["Hong Kong", "HK"] },
  { tz: "Asia/Singapore", zh: ["新加坡"], en: ["Singapore"] },
  { tz: "Asia/Shanghai", zh: ["上海", "北京", "深圳", "廣州", "中國"], en: ["Shanghai", "Beijing", "Shenzhen", "Guangzhou", "China"] },

  // ── 澳洲、紐西蘭 ──
  { tz: "Australia/Sydney", zh: ["雪梨", "坎培拉", "墨爾本"], en: ["Sydney", "Canberra", "Melbourne", "SYD"] },
  { tz: "Australia/Brisbane", zh: ["布里斯本", "昆士蘭"], en: ["Brisbane", "Queensland"] },
  { tz: "Australia/Perth", zh: ["伯斯", "柏斯"], en: ["Perth"] },
  { tz: "Pacific/Auckland", zh: ["奧克蘭", "紐西蘭", "威靈頓"], en: ["Auckland", "New Zealand", "Wellington"] },
];

// 搜尋。回傳 [{tz, label}]，最多 max 筆。
//
// 比對**不分大小寫、也不看空白**：使用者打 "annarbor"、"Ann Arbor"、"ANN ARBOR"
// 都要找得到。中文沒有大小寫，但同樣去掉空白。
// **不做模糊比對**（編輯距離之類）：那會讓「東京」搜出「京都」，
// 而使用者選錯時區的後果是他整週的時間都畫在錯的地方，卻看不出來。
const norm = s => String(s || "").toLowerCase().replace(/\s+/g, "");

export function searchTz(q, max = 8) {
  const k = norm(q);
  if (!k) return [];
  const hit = [];
  for (const e of TZ_ALIAS) {
    const names = [...e.zh, ...e.en];
    const m = names.find(n => norm(n).includes(k)) || (norm(e.tz).includes(k) ? e.tz : null);
    if (m) hit.push({ tz: e.tz, label: e.zh[0] + " / " + e.en[0], matched: m });
    if (hit.length >= max) break;
  }
  return hit;
}

// 一個 IANA 名稱要怎麼顯示給人看。查不到就原樣顯示 ——
// **不要顯示成空白或「未知」**，那個名稱本身仍然是有效的時區。
export function labelOf(tz) {
  const e = TZ_ALIAS.find(x => x.tz === tz);
  return e ? e.zh[0] + " / " + e.en[0] : tz;
}
