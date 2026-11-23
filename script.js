const $ = id => document.getElementById(id);
const currentEl = $("current"), historyEl = $("history");

/* ---------- Storage helpers (safe if storage is blocked) ---------- */
const load = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

/* ---------- State ---------- */
let input = "";                 // ASCII expression, e.g. "sin(30)+2*pi"
let justEvaluated = false;
let deg = true;                 // degrees vs radians for trig
let ans = 0;                    // last result
let history = load("calc-history", []);

/* ---------- Evaluator (no eval!) ----------
   expr    = term (('+'|'-') term)*
   term    = unary (('*'|'/') unary)*
   unary   = ('-'|'+') unary | power
   power   = postfix ('^' unary)?        (right-associative)
   postfix = primary ('%')*              (x% means x/100)
   primary = NUMBER | pi | e | '(' expr ')' | FUNC '(' expr ')' */
const FUNCS = {
  sin: x => Math.sin(deg ? x * Math.PI / 180 : x),
  cos: x => Math.cos(deg ? x * Math.PI / 180 : x),
  tan: x => Math.tan(deg ? x * Math.PI / 180 : x),
  log: Math.log10, ln: Math.log, sqrt: Math.sqrt
};

function evaluate(str) {
  const tokens = str.match(/\d+\.?\d*(?:e[+-]?\d+)?|\.\d+|[a-z]+|[-+*/^()%]/g) || [];
  let pos = 0;
  const peek = () => tokens[pos], next = () => tokens[pos++];

  function primary() {
    const t = next();
    if (t === undefined) throw new Error("Incomplete expression");
    if (/^[\d.]/.test(t)) return parseFloat(t);
    if (t === "pi") return Math.PI;
    if (t === "e") return Math.E;
    if (t === "(") { const v = parseExpr(); if (next() !== ")") throw new Error("Missing )"); return v; }
    if (FUNCS[t]) {
      if (next() !== "(") throw new Error("Invalid");
      const v = parseExpr();
      if (next() !== ")") throw new Error("Missing )");
      return FUNCS[t](v);
    }
    throw new Error("Invalid expression");
  }
  function postfix() { let v = primary(); while (peek() === "%") { next(); v /= 100; } return v; }
  function power() { const base = postfix(); if (peek() === "^") { next(); return Math.pow(base, unary()); } return base; }
  function unary() {
    if (peek() === "-") { next(); return -unary(); }
    if (peek() === "+") { next(); return unary(); }
    return power();
  }
  function term() {
    let v = unary();
    while (peek() === "*" || peek() === "/") {
      const op = next(), right = unary();
      if (op === "/" && right === 0) throw new Error("Can't divide by 0");
      v = op === "*" ? v * right : v / right;
    }
    return v;
  }
  function parseExpr() {
    let v = term();
    while (peek() === "+" || peek() === "-") { const op = next(), right = term(); v = op === "+" ? v + right : v - right; }
    return v;
  }

  const result = parseExpr();
  if (pos < tokens.length) throw new Error("Invalid expression");
  if (!Number.isFinite(result)) throw new Error("Math error");
  return result;
}

/* ---------- Display ---------- */
const pretty = s => s.replace(/\*/g, "×").replace(/\//g, "÷").replace(/-/g, "−")
                     .replace(/sqrt\(/g, "√(").replace(/pi/g, "π");
const autoClose = s => s + ")".repeat(Math.max(0, (s.match(/\(/g) || []).length - (s.match(/\)/g) || []).length));

function render() {
  const text = input ? pretty(input) : "0";
  currentEl.textContent = text;
  currentEl.classList.toggle("long", text.length > 11);
}
function setStatus(text, isError = false) {
  historyEl.textContent = text;
  historyEl.classList.toggle("error", isError);
}

/* ---------- History panel ---------- */
function renderHistory() {
  const list = $("histList");
  list.innerHTML = "";
  if (!history.length) { list.innerHTML = '<div class="empty">No calculations yet</div>'; return; }
  history.forEach(h => {
    const b = document.createElement("button");
    b.className = "item";
    b.innerHTML = "<small></small><span></span>";
    b.firstChild.textContent = h.expr + " =";
    b.lastChild.textContent = h.result;
    b.addEventListener("click", () => { input = h.result; justEvaluated = true; setStatus(h.expr + " ="); render(); });
    list.appendChild(b);
  });
}

/* ---------- Key handling ---------- */
const startFresh = () => { if (justEvaluated) { input = ""; setStatus(""); justEvaluated = false; } };
const needsMul = () => /[\d.)ie%]$/.test(input);   // insert × before a function, "(" or constant

function press(key) {
  if (/^\d$/.test(key) || key === ".") {
    startFresh();
    if (/[)ie%]$/.test(input)) input += "*";
    const lastNum = input.split(/[^0-9.]/).pop();
    if (key === "." && lastNum.includes(".")) return;   // no "1.2.3"
    input += key;
  } else if ("+-*/^".includes(key) && key.length === 1) {
    justEvaluated = false;
    if (key === "-" && /[*/^(]$/.test(input)) { input += key; }   // allow 5*-3 and (-2)
    else {
      if (!input && key !== "-") return;
      if (/[+\-*/^]$/.test(input)) input = input.slice(0, -1);    // replace previous operator
      input += key;
    }
  } else if (key === "sq") {
    if (/[\d)ie%]$/.test(input)) { input += "^2"; justEvaluated = false; }
  } else if (key === "%") {
    if (/[\d)]$/.test(input)) { input += "%"; justEvaluated = false; }
  } else if (key === ")") {
    const open = (input.match(/\(/g) || []).length - (input.match(/\)/g) || []).length;
    if (open > 0 && /[\d)ie%]$/.test(input)) input += ")";
  } else if (["(", "sin(", "cos(", "tan(", "ln(", "log(", "sqrt(", "pi", "e"].includes(key)) {
    startFresh();
    if (needsMul()) input += "*";
    input += key;
  } else if (key === "ans") {
    startFresh();
    if (needsMul()) input += "*";
    input += ans < 0 ? `(${ans})` : String(ans);
  } else if (key === "Backspace") {
    input = input.replace(/(?:sin\(|cos\(|tan\(|log\(|ln\(|sqrt\(|pi|.)$/, "");
    justEvaluated = false;
  } else if (key === "C") {
    input = ""; justEvaluated = false; setStatus("");
  } else if (key === "deg") {
    deg = !deg;
    $("mode").textContent = deg ? "Degrees" : "Radians";
    document.querySelector('[data-key="deg"]').textContent = deg ? "Deg" : "Rad";
  } else if (key === "hist") {
    $("panel").hidden = !$("panel").hidden;
  } else if (key === "=" || key === "Enter") {
    if (!input) return;
    try {
      const closed = autoClose(input);
      const out = String(parseFloat(evaluate(closed).toPrecision(12)));  // hides 0.1+0.2 noise
      history.unshift({ expr: pretty(closed), result: out });
      history = history.slice(0, 30);
      save("calc-history", history);
      renderHistory();
      setStatus(pretty(closed) + " =");
      ans = parseFloat(out); input = out; justEvaluated = true;
    } catch (err) {
      setStatus(err.message, true);   // keep the expression so the user can fix it
    }
  }
  render();
}

/* ---------- Events ---------- */
$("keys").addEventListener("click", e => { const b = e.target.closest("button"); if (b) press(b.dataset.key); });

document.addEventListener("keydown", e => {
  const k = e.key;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^[0-9.+\-*/^()%]$/.test(k) || k === "Backspace" || k === "Enter" || k === "=") {
    e.preventDefault(); press(k);
  } else if (k === "Escape") press("C");
});

$("clearHist").addEventListener("click", () => { history = []; save("calc-history", history); renderHistory(); });

/* ---------- Theme ---------- */
const root = document.documentElement;
const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
root.dataset.theme = load("calc-theme", prefersLight ? "light" : "dark");
$("theme").addEventListener("click", () => {
  root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
  save("calc-theme", root.dataset.theme);
});

renderHistory();
render();
