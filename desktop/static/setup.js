"use strict";
const HEBREW = /[\u0590-\u05FF]/;
let caps = false;
const pwEl = document.getElementById("pw");
const pw2El = document.getElementById("pw2");
function hint() {
  const w = document.getElementById("warn");
  const msgs = [];
  if (HEBREW.test(pwEl.value)) msgs.push("הסיסמה מוקלדת באותיות עבריות. כדאי לבחור סיסמה באנגלית ובמספרים, כדי לא להתבלבל בשפת המקלדת בכניסה.");
  if (caps) msgs.push("Caps Lock דולק.");
  w.textContent = msgs.join(" ");
  w.hidden = msgs.length === 0;
}
for (const el of [pwEl, pw2El]) {
  el.addEventListener("input", hint);
  el.addEventListener("keyup", (e) => { caps = e.getModifierState && e.getModifierState("CapsLock"); hint(); });
}
document.getElementById("show").addEventListener("change", (e) => {
  const t = e.target.checked ? "text" : "password";
  pwEl.type = t;
  pw2El.type = t;
});
document.getElementById("f").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const pw = document.getElementById("pw").value;
  const pw2 = document.getElementById("pw2").value;
  const err = document.getElementById("err");
  err.textContent = "";
  if (pw.length < 10) return void (err.textContent = "הסיסמה קצרה מדי (לפחות 10 תווים).");
  if (pw !== pw2) return void (err.textContent = "הסיסמאות אינן זהות.");
  const btn = document.getElementById("go");
  btn.disabled = true;
  btn.textContent = "מכין את התוכנה…";
  const r = await window.taSetup.complete({ email, password: pw, demo: document.getElementById("demo").checked });
  if (!r || !r.ok) {
    btn.disabled = false;
    btn.textContent = "סיום והתחלה";
    err.textContent = "בדקו את כתובת הדוא\"ל והסיסמה.";
  }
});
