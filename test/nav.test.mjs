// 站台頂欄（shared/nav.js）的契約。
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { FEATURES, featuresFor, navHTML } from "../shared/nav.js";
import { menuHTML } from "../app/src/ui.js";

const count = (h, re) => (h.match(re) || []).length;

test("FEATURES 每一筆都有 key / label / href / roles / title / desc", () => {
  assert.ok(FEATURES.length >= 2);
  for (const f of FEATURES)
    for (const k of ["key", "label", "href", "roles", "title", "desc"])
      assert.ok(f[k] != null && String(f[k]).length, `${f.key || "?"} 少了 ${k}`);
});

// href 是根目錄相對路徑，而且那個資料夾真的存在。
// 寫錯路徑不會報錯，只會多一個點了 404 的入口。
test("FEATURES 的 href 都指到存在的資料夾", () => {
  for (const f of FEATURES) {
    assert.match(f.href, /^\/[a-z-]+\/$/, `${f.key} 的 href 不是 /xxx/ 的形狀：${f.href}`);
    assert.ok(existsSync("." + f.href + "index.html"), `${f.href} 沒有 index.html`);
  }
});

test("★ 幹部看到兩個功能項，當前的那一項有標記", () => {
  const h = navHTML({ current: "availability", role: "cadre", name: "王平" });
  assert.equal(count(h, /<a href="\/[a-z-]+\/"/g), 2);
  assert.match(h, /href="\/availability\/" aria-current="page"/, "當前項沒有 aria-current");
  assert.ok(!/href="\/passport\/" aria-current/.test(h), "不是當前的項被標了");
});

// ★ 學員：列照樣畫，只是功能項是空的。不整條藏起來——他知道自己在這個站裡，
// 只是還沒有功能；之後開放給學員的功能只要在 roles 加 "student"，列就自動長出來。
test("★ 學員的頂欄：零個功能項，但 logo、名字、登出都在", () => {
  const h = navHTML({ current: null, role: "student", name: "小明" });
  assert.equal(count(h, /<a href="\/[a-z-]+\/"/g), 0, "學員看到了他進不去的功能");
  assert.ok(h.includes('href="/app/"'), "沒有回入口的 logo 連結");
  assert.ok(h.includes("小明"), "沒有名字");
  assert.ok(h.includes('data-act="signout"'), "沒有登出");
  assert.ok(h.includes('<nav class="btnav"'), "整條列不見了——空的列比消失誠實");
});

test("role 是 null（profiles 查不到）時也不會爆，當成沒有功能", () => {
  assert.doesNotThrow(() => navHTML({ current: null, role: null, name: "" }));
  assert.equal(count(navHTML({ current: null, role: null, name: "" }), /<a href="\/[a-z-]+\/"/g), 0);
});

test("名字會跳脫，而且窄螢幕用的第一個字也跳脫", () => {
  const h = navHTML({ current: "passport", role: "cadre", name: '<b>x</b>' });
  assert.ok(!h.includes("<b>x</b>"), "名字被原樣塞進 HTML");
  assert.ok(h.includes("&lt;b&gt;x&lt;/b&gt;"), "名字沒有被顯示");
  assert.ok(h.includes('<span class="short">&lt;</span>'), "第一個字沒有跳脫");
});

test("沒有名字時不畫名字那一格，但登出還在", () => {
  const h = navHTML({ current: "passport", role: "cadre", name: "" });
  assert.ok(!h.includes("btnav-who"));
  assert.ok(h.includes('data-act="signout"'));
});

// ★ 唯一來源：/app/ 的選單卡片跟頂欄用同一份清單。
// 兩份清單的話漏加的那一頁不會壞、只會少一個入口，而那種缺陷沒有人會回報。
test("★ /app/ 選單的每一張卡都對應 FEATURES 的一筆，數量一致", () => {
  const h = menuHTML("王平");
  const cadre = featuresFor("cadre");
  assert.equal(count(h, /class="mitem"/g), cadre.length, "卡片數跟 FEATURES 不一致");
  for (const f of cadre) {
    assert.ok(h.includes(`href="${f.href}"`), `選單少了 ${f.key} 的入口`);
    assert.ok(h.includes(f.title), `選單少了 ${f.key} 的標題`);
  }
});

test("app/src/ui.js 不准自己寫死功能的 href", () => {
  const src = readFileSync("app/src/ui.js", "utf8").replace(/<!--[\s\S]*?-->|\/\/[^\n]*/g, "");
  assert.ok(!/href="\.\.\/(passport|availability)\/"/.test(src), "選單裡有寫死的 ../passport/ 或 ../availability/");
  assert.ok(!/href="\/(passport|availability)\/"/.test(src), "選單裡有寫死的 /passport/ 或 /availability/");
});

// shared/ 的依賴方向只能往下。反過來的話護照壞掉會讓每一頁的頂欄一起壞。
test("shared/ 不 import 任何功能資料夾", () => {
  for (const f of ["shared/nav.js", "shared/auth.js", "shared/supabase.js"]) {
    const src = readFileSync(f, "utf8");
    assert.ok(!/^\s*import .*\/(passport|availability|app)\//m.test(src), `${f} import 了功能資料夾`);
  }
});
