"use strict";
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
