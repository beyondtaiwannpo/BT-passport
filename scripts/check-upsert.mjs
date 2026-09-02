// 守門：欄位層級授權的表不准用 .upsert()。由 check.sh 呼叫。
//
// 為什麼是獨立檔案而不是內嵌在 check.sh：內嵌版本經過 bash 與 heredoc 兩層
// 跳脫之後變成語法錯誤，而那個錯誤訊息被當成「違規內容」報了出來 ——
// 守門壞掉跟找到違規長得一模一樣。獨立檔案沒有跳脫問題，也測得到。
//
// 背景：2026-09-02 咬過，而且咬的是所有人第一次進看板都會撞到的那道門
//（知情同意按下去完全沒反應）。PostgREST 的 upsert 會把 payload 的每一欄
// 都放進 ON CONFLICT DO UPDATE 的 SET 清單，包含主鍵；而 availability_meta
// 只發了 grant update (notice_seen_at)，於是整句被拒。
//
// **不是所有 upsert 都有問題**：護照對 stamps / entries / visas 用 upsert 是對的，
// 那幾張表有表層級的 update 授權。有問題的只有欄位層級授權的表。
import fs from "node:fs";

export function columnGrantedTables(files) {
  const out = new Set();
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8").replace(/--[^\n]*/g, "");
    for (const m of src.matchAll(/grant\s+update\s*\([^)]*\)\s+on\s+(?:table\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi))
      out.add(m[1].toLowerCase());
  }
  return out;
}

// 在 from("表") 之後 window 個字元內出現 .upsert( 就算命中。
// 用字串掃描不用 RegExp，表名不必跳脫。
export function findUpserts(src, table, window = 220) {
  const needle = 'from("' + table + '")';
  let i = 0;
  while ((i = src.indexOf(needle, i)) !== -1) {
    if (src.slice(i, i + window).includes(".upsert(")) return true;
    i += needle.length;
  }
  return false;
}

export function scan(sqlFiles, dirs) {
  const tables = columnGrantedTables(sqlFiles);
  if (tables.size === 0) return { broke: "找不到任何欄位層級授權的表" };
  const bad = [];
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter(x => x.endsWith(".js"))) {
      const path = d + "/" + f;
      const src = fs.readFileSync(path, "utf8").replace(/\/\/[^\n]*/g, "");
      for (const t of tables) if (findUpserts(src, t)) bad.push(path + ":" + t);
    }
  }
  return { tables: [...tables].sort(), bad };
}

if (import.meta.url === "file://" + process.argv[1]) {
  const sql = fs.readdirSync("supabase/migrations").map(f => "supabase/migrations/" + f)
    .concat(["supabase/schema.sql"]).filter(f => f.endsWith(".sql"));
  const r = scan(sql, ["availability/src", "app/src", "passport/src", "reset"]);
  if (r.broke) { console.log("GUARD-BROKE " + r.broke); process.exit(0); }
  console.log(r.bad.length ? "BAD " + r.bad.join(" ") : "OK " + r.tables.join(","));
}
