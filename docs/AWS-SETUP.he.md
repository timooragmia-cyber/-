# הקמת השרת ב-AWS — מדריך צעד אחר צעד

המדריך מיועד ליועץ. אין בו צורך בידע טכני מוקדם, מלבד העתקה והדבקה של פקודות.
זמן משוער: כשעה וחצי, כולל המתנה ל-DNS.
עלות משוערת: כ-45–50 דולר בחודש. הפירוט בסעיף "עלויות" בסוף.

> השלבים מסודרים כך שבכל שלב יש נקודת בדיקה. אם משהו לא תואם למה שכתוב, עצור/י ושלח/י
> צילום מסך.

---

## חלק א׳ — חשבון AWS מאובטח (פעם אחת)

1. **פתיחת חשבון** ב-https://aws.amazon.com, עם כתובת דוא״ל משרדית ייעודית (למשל `aws@…`).
2. **אימות דו-שלבי למשתמש הראשי (root):** בפינה הימנית העליונה, שם החשבון ←
   *Security credentials* ← *Assign MFA device*.
   זה החשבון שמחזיק את כל המידע של הלקוחות, ולכן זו חובה.
3. **הפעלת אזור תל אביב:** שם החשבון ← *Account* ← *AWS Regions* ← *Israel (Tel Aviv)
   il-central-1* ← **Enable**. ההפעלה לוקחת כמה דקות.
   ✔ בדיקה: בתפריט האזורים (ליד שם החשבון) מופיע *Israel (Tel Aviv)*. בחר/י בו, ומעכשיו
   עובדים רק בו.
4. **התראת תקציב:** *Billing* ← *Budgets* ← *Create budget* ← *Monthly cost budget*, עם סכום
   של 70 דולר והתראה לדוא״ל. כך כל חריגה מתגלה מוקדם.

## חלק ב׳ — השרת (EC2)

1. **הצפנת דיסקים כברירת מחדל:** *EC2* ← בצד ימין למטה *Settings / EBS encryption* ←
   *Manage* ← **Always encrypt new EBS volumes**.
2. **מפתח SSH:** *EC2* ← *Key Pairs* ← *Create key pair*. שם: `ta-server`, סוג *ED25519*,
   פורמט *.pem*. הקובץ יורד למחשב. שמור/י אותו במנהל הסיסמאות; בלעדיו אין גישה לשרת.
3. **הקמת השרת:** *EC2* ← *Launch instance*:
   - **שם:** `ta-platform`
   - **מערכת:** *Ubuntu Server 24.04 LTS (x86)*
   - **סוג:** `t3.medium` (2 מעבדים, 4GB)
   - **Key pair:** `ta-server`
   - **Network settings** ← *Edit*: לסמן *Allow SSH from: **My IP***, *Allow HTTPS*, *Allow HTTP*
   - **Storage:** `40 GiB`, `gp3`; לוודא ש-*Encrypted* מסומן
   - **Launch instance**
4. **כתובת קבועה:** *Elastic IPs* ← *Allocate* ← *Associate* לשרת `ta-platform`.
   רשום/י את הכתובת, לדוגמה `51.17.xx.xx`.
5. **DNS:** אצל רשם הדומיין שלך, יש להוסיף רשומת **A** עם השם `app` (או השם שבחרת) שמצביעה
   על הכתובת הקבועה.
   ✔ בדיקה (מכל מחשב): `nslookup app.הדומיין-שלך` מחזיר את הכתובת. זה יכול לקחת עד שעה.

> **אבטחה:** פורט 22 (SSH) פתוח רק לכתובת ה-IP של המשרד. אם עובדים מהבית, מוסיפים את הכתובת
> זמנית ב-*Security group* ← *Edit inbound rules*, ומסירים אותה בסוף.

## חלק ג׳ — העלאת הקוד והתקנה (פקודה אחת)

מהמחשב, בטרמינל (ב-Windows: PowerShell):
```bash
ssh -i ta-server.pem ubuntu@51.17.xx.xx
```
בשרת:
```bash
sudo mkdir -p /opt/ta && sudo chown ubuntu /opt/ta
git clone https://github.com/timooragmia-cyber/-.git /opt/ta      # ראו הערה למטה
cd /opt/ta && sudo bash deploy/install.sh
```
הסקריפט ישאל שלוש שאלות: הדומיין, דוא״ל להתראות על התעודה, ודוא״ל הכניסה של היועץ.
אחר כך הוא עושה הכל לבד: עדכוני אבטחה, Docker, חומת אש, סודות, בנייה, מסד נתונים, HTTPS,
משימות מתוזמנות ובדיקה מסכמת.

✔ בסיום מופיעה שורה **`RESULT: OK`**, וכן **הסיסמה הראשונית של היועץ, שמוצגת פעם אחת בלבד**.
את כל הפלט יש לשלוח אליי.

> **הקוד מ-GitHub:** המאגר פרטי. הדרך הפשוטה היא *Deploy key*:
> 1. בשרת: `ssh-keygen -t ed25519 -f ~/.ssh/ta_deploy -N ""` ואז `cat ~/.ssh/ta_deploy.pub`.
> 2. ב-GitHub: *Settings* של המאגר ← *Deploy keys* ← *Add*, מדביקים את המפתח בלי לסמן
>    *write*.
> 3. שכפול:
>    `GIT_SSH_COMMAND="ssh -i ~/.ssh/ta_deploy" git clone git@github.com:timooragmia-cyber/-.git /opt/ta`
>
> **אם GitHub עדיין לא מחובר**, מעלים את קובץ הגיבוי ששלחתי:
> 1. מהמחשב: `scp -i ta-server.pem ta-platform-1.0.0.bundle ubuntu@51.17.xx.xx:/tmp/`
> 2. בשרת: `git clone /tmp/ta-platform-1.0.0.bundle /opt/ta`

**מיד אחרי ההתקנה:**
1. להעתיק את הקובץ `/opt/ta/.env` למנהל הסיסמאות של המשרד: `sudo cat /opt/ta/.env`.
   **בלי הקובץ הזה אי אפשר לשחזר את המידע המוצפן, גם לא מגיבוי.**
2. להיכנס ל-`https://app.הדומיין-שלך`, לרשום אפליקציית אימות, ו**להדפיס את קודי השחזור
   ולשמור אותם בכספת**.
3. להחליף את הסיסמה הראשונית (*החשבון שלי* ← *שינוי סיסמה*).

## חלק ד׳ — גיבויים (S3 בתל אביב)

1. **מפתח הצפנה במחשב שלך, לא בשרת.** מתקינים את `age` (ב-Windows: `winget install
   FiloSottile.age`; ב-Mac: `brew install age`), ואז:
   ```bash
   age-keygen -o ta-backup.age.key
   ```
   - מהפלט מעתיקים את השורה `Public key: age1…`.
   - את הקובץ `ta-backup.age.key` שומרים במנהל הסיסמאות **וגם** בעותק מודפס בכספת.
     בלעדיו אי אפשר לפתוח את הגיבויים.
2. **Bucket:** *S3* ← *Create bucket*:
   - **שם:** ייחודי, לדוגמה `ta-backups-2026-xxxx`
   - **אזור:** *il-central-1*
   - **Block all public access:** מסומן
   - **Bucket Versioning:** *Enable*
   - **Object Lock:** *Enable*. אחרי היצירה: *Properties* ← *Object Lock* ← *Default
     retention*: *Governance*, 30 ימים.
3. **מחיקה אוטומטית:** *Management* ← *Create lifecycle rule*.
   - הערכים נמצאים בקובץ `deploy/aws/s3-lifecycle.json`: תחילית `ta-platform/`, מחיקה אחרי
     35 יום, וגרסאות ישנות אחרי יום אחד.
   - כך גיבוי של לקוח שנמחק נעלם תוך כ-36 ימים.
4. **משתמש לגיבוי בלבד:** *IAM* ← *Users* ← *Create user* `ta-backup`, בלי גישה לקונסולה.
   - *Add permissions* ← *Create inline policy* ← *JSON*: מדביקים את התוכן של
     `deploy/aws/backup-iam-policy.json`, אחרי שמחליפים את `REPLACE_WITH_BUCKET_NAME` בשם
     ה-bucket.
   - **אין לו הרשאת מחיקה.** גם מי שגונב את המפתח לא יכול למחוק גיבויים.
   - *Security credentials* ← *Create access key* ← *Application running outside AWS*.
5. **בשרת:**
   ```bash
   cd /opt/ta && sudo nano backup.env
   ```
   ממלאים את השדות:
   - `AGE_RECIPIENT`: המפתח הציבורי `age1…`
   - `S3_BUCKET`: שם ה-bucket
   - `AWS_DEFAULT_REGION`: `il-central-1`
   - `AWS_ACCESS_KEY_ID` ו-`AWS_SECRET_ACCESS_KEY`: המפתח שנוצר לגיבוי

   שומרים ב-`Ctrl+O`, Enter, ואז `Ctrl+X`. לסיום, גיבוי ראשון ובדיקה:
   ```bash
   sudo docker compose build backup && sudo docker compose run --rm backup /usr/local/bin/backup.sh
   sudo bash deploy/verify.sh
   ```
   ✔ ב-S3 מופיעה תיקייה `ta-platform/<תאריך>/` עם שלושה קבצים, ו-verify מציג
   `backups configured`.
6. **תרגיל שחזור חודשי:** לפי `docs/DEPLOYMENT.md` §5.4. רושמים את התאריך ביומן האבטחה של
   המשרד.

## חלק ה׳ — אחרי ההקמה

- **שירות ניטור חיצוני:** UptimeRobot או דומה, בדיקה כל 5 דקות של
  `https://app.הדומיין-שלך/api/health`, עם התראה ב-SMS או בדוא״ל.
- **עדכון גרסה:** `docs/DEPLOYMENT.md` §6. גיבוי קודם, ואז build, migrate ו-up.
- **לפני הלקוח האמיתי הראשון:** לעבור עם עורך דין על `docs/PRIVACY.md`, ועל
  `docs/UNVERIFIED.md` בעצמך.

## עלויות (הערכה, נובמבר 2026 — יש לאמת במחשבון של AWS)

| רכיב | הערכה לחודש |
|---|---|
| השרת, `t3.medium` לפי שעה, תל אביב | כ-35 דולר |
| דיסק 40GB `gp3` | כ-4 דולר |
| כתובת IP קבועה (Elastic IP) | כ-4 דולר |
| גיבויים ב-S3, 35 יום | פחות מ-2 דולר בהתחלה |
| **סה״כ** | **כ-45–50 דולר** |

אפשר לחסוך כ-30–40% עם *Savings Plan* לשנה, אחרי חודש של עבודה יציבה.
