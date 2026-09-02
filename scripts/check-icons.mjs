// 守門：每一個對外頁面都要引用 shared/ 的圖示與 manifest，而且路徑要真的存在。
// 由 check.sh 呼叫。獨立檔案而不是內嵌，理由見 check-upsert.mjs 檔頭。
//
// 2026-09-02：圖示與 manifest 從 passport/ 搬到 shared/，manifest 的 start_url
// 指 /app/ —— 幹部釘到主畫面的是登入後看得到全部功能的那一頁，不是護照。
// 搬之前 /app/ 與 /availability/ 根本沒有圖示，而 /privacy/ 與 /reset/ 是指去
// passport/ 借的。那種借法沒有壞掉，所以不會有人發現它該修。
import fs from "node:fs";

export const PAGES = ["index.html", "app/index.html", "availability/index.html",
                      "passport/index.html", "privacy/index.html", "reset/index.html"];
export const NEEDED = ["favicon-32.png", "apple-touch-icon.png", "site.webmanifest"];

export function scan() {
  const bad = [];
  for (const page of PAGES) {
    if (!fs.existsSync(page)) { bad.push(page + ":頁面不存在"); continue; }
    const src = fs.readFileSync(page, "utf8").replace(/<!--[\s\S]*?-->/g, "");  // 註解不算
    const dir = page.includes("/") ? page.slice(0, page.lastIndexOf("/")) : ".";
    for (const need of NEEDED) {
      const m = src.match(new RegExp('href="([^"]*' + need.replace(".", "\\.") + ')"'));
      if (!m) { bad.push(page + ":沒有引用 " + need); continue; }
      if (!m[1].includes("shared/")) { bad.push(page + ":" + need + " 不是指向 shared/（" + m[1] + "）"); continue; }
      // 路徑要真的指到存在的檔案。
      const rel = m[1].replace(/^\.\//, "").replace(/^\.\.\//, "");
      const target = m[1].startsWith("../") ? rel : (dir === "." ? rel : dir + "/" + rel);
      if (!fs.existsSync(target)) bad.push(page + ":" + m[1] + " 指到不存在的檔案");
    }
  }
  // manifest 本身
  const mf = "shared/site.webmanifest";
  if (!fs.existsSync(mf)) return { bad: bad.concat("shared/site.webmanifest 不存在") };
  let j;
  try { j = JSON.parse(fs.readFileSync(mf, "utf8")); }
  catch (e) { return { broke: "manifest 不是合法的 JSON：" + e.message }; }
  if (j.start_url !== "/app/") bad.push("manifest 的 start_url 是 " + j.start_url + "，應該是 /app/");
  if (j.scope !== "/") bad.push("manifest 的 scope 是 " + j.scope + "，應該是 /");
  for (const ic of j.icons || [])
    if (!fs.existsSync(ic.src.replace(/^\//, ""))) bad.push("manifest 的 " + ic.src + " 不存在");
  return { bad };
}

if (import.meta.url === "file://" + process.argv[1]) {
  const r = scan();
  if (r.broke) { console.log("GUARD-BROKE " + r.broke); process.exit(0); }
  console.log(r.bad.length ? "BAD " + r.bad.join(" / ") : "OK " + PAGES.length + " 個頁面");
}
