// prefers-reduced-motion 的涵蓋率檢查。由 check.sh 呼叫。
//
// 為什麼要有這支：2026-08-18 做 §11-17 驗收時發現 .overprint.land 漏在
// reduce 區塊之外——它只在集滿 33 格那一刻出現，平常根本測不到，
// 是人工用 CSSOM 逐條比對才抓到的。這支讓那件事不可能再發生。
//
// **這是無障礙需求不是視覺偏好**（使用者 2026-08-25 的裁定），所以由機器守門。
//
// 判準兩種：
//   animation  —— 一律要在 reduce 區塊裡被關掉
//   transition —— 只有動到 transform 或位置類屬性時才要求；
//                 顏色與透明度的過渡不是前庭刺激來源
import fs from "node:fs";

const html = fs.readFileSync("passport/index.html", "utf8");
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1]
  .replace(/\/\*[\s\S]*?\*\//g, "");   // 先剝註解，否則註解裡的文字會被當成選擇器

const rules = block => [...block.matchAll(/([^{}]+)\{([^}]*)\}/g)];
const selectorsOf = sel => sel.split(",").map(s => s.trim()).filter(Boolean);

const declared = new Set(), transitions = [];
let declaredRules = 0;   // 條數，不是選擇器數——一條規則可以有逗號分隔的多個選擇器
for (const [, sel, body] of rules(css)) {
  const s = sel.trim();
  if (s.startsWith("@") || s.includes("%") || s === "from" || s === "to") continue;
  const a = body.match(/(?<![-\w])animation\s*:\s*([^;]+)/);
  if (a && a[1].trim() !== "none") {
    selectorsOf(s).forEach(x => declared.add(x));
    declaredRules++;
  }
  const t = body.match(/(?<![-\w])transition\s*:\s*([^;]+)/);
  if (t) transitions.push([s, t[1].trim()]);
}

const rmMatch = css.match(/@media\s*\(prefers-reduced-motion\s*:\s*reduce\)\s*\{([\s\S]*?)\n\s{0,4}\}/);
const rm = rmMatch ? rmMatch[1] : "";
const disabled = new Set();
for (const [, sel, body] of rules(rm)) {
  if (/animation\s*:\s*none/.test(body)) selectorsOf(sel).forEach(x => disabled.add(x));
}

const MOTION = ["transform", "top", "left", "right", "bottom", "width", "height", "inset", "margin"];
const missing = [...declared].filter(s => !disabled.has(s));
const risky = transitions.filter(([, v]) =>
  v.split(",").map(p => p.trim().split(/\s/)[0]).some(p => MOTION.some(k => p.startsWith(k))));

// ---- 控制端追加的對帳（2026-08-25 的裁定：這是無障礙需求，機器守門要能證明
// 自己沒有盲點）----
//
// 上面的 rules() 走法有一個它自己看不見的盲點：`s.startsWith("@")` 會把整個
// @media 選擇器跳過，而 [^{}]+\{[^}]*\} 這個正則不認得巢狀大括號，於是
// @media 區塊「第一條」子規則的內容會被當成 @media 選擇器自己的 body 一起吞掉、
// 一起被跳過——寫在那個位置的 animation 宣告，守門對它是瞎的。
//
// 這裡自己再數一次：把註解（css 已經剝過一次）、@keyframes 區塊、reduce 區塊
// （含 @media 那一行本身，不只內容）都剝掉之後，剩下的 CSS 裡還有幾個
// `animation:` 宣告（排除 animation:none）？這個數字要跟上面走規則時真正算進
// declaredRules 的條數相等，對不上就代表有宣告落在解析不到的地方。
let reconcileCss = css.replace(
  /@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g,
  ""
);
if (rmMatch) reconcileCss = reconcileCss.replace(rmMatch[0], "");

const totalAnimationDecls = (
  reconcileCss.match(/(?<![-\w])animation\s*:\s*(?!none\b)[^;}]+/g) || []
).length;

if (totalAnimationDecls !== declaredRules) {
  const diff = totalAnimationDecls - declaredRules;
  console.log(`有 ${diff} 個 animation 宣告落在這支腳本解析不到的地方（例如 @media 內）—— 守門對它們是瞎的`);
  process.exit(1);
}

if (missing.length === 0 && risky.length === 0) {
  console.log(`animation ${declared.size} 個全部被 reduce 關掉；transition ${transitions.length} 個都沒動到位置或形狀`);
  process.exit(0);
}
for (const s of missing) console.log(`  漏掉的 animation：${s}`);
for (const [s, v] of risky) console.log(`  會動位置/形狀的 transition：${s} { ${v} }`);
process.exit(1);
