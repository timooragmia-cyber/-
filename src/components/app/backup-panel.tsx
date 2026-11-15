"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/** Bridge exposed by the desktop shell's preload script (see desktop/src/preload.ts). */
type BackupInfo = { name: string; size: number; date: string };
type Status = { folder: string | null; passwordSet: boolean; lastBackupAt: string | null; lastBackupFile: string | null; lastBackupError: string | null; backups: BackupInfo[] };
type Bridge = {
  status(): Promise<Status>;
  chooseFolder(): Promise<string | null>;
  setPassword(pw: string): Promise<void>;
  backupNow(): Promise<{ ok: boolean; error?: string }>;
  chooseRestoreFile(): Promise<string | null>;
  restore(file: string, pw: string): Promise<{ ok: boolean; error?: string }>;
  openFolder(): Promise<void>;
};
const bridge = () => (globalThis as { taDesktop?: Bridge }).taDesktop;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" }) : "—");

export function BackupPanel() {
  const t = useTranslations("backup");
  const [s, setS] = useState<Status | null>(null);
  const [pw, setPw] = useState({ a: "", b: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [restore, setRestore] = useState<{ file: string; pw: string } | null>(null);

  const refresh = useCallback(async () => {
    const b = bridge();
    if (b) setS(await b.status());
  }, []);
  useEffect(() => {
    let alive = true;
    void bridge()?.status().then((st) => {
      if (alive) setS(st);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!bridge()) return <Card><p className="text-sm text-muted">{t("onlyDesktop")}</p></Card>;
  const b = bridge()!;
  const act = async (fn: () => Promise<{ ok: boolean; error?: string } | void>, okText: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      if (r && !r.ok) setMsg({ ok: false, text: r.error ?? t("failed") });
      else setMsg({ ok: true, text: okText });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  return (
    <div className="space-y-4">
      {msg && <p role="status" className={`rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"}`}>{msg.text}</p>}

      <Card>
        <CardTitle>{t("statusTitle")}</CardTitle>
        <dl className="grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
          <dt className="text-muted">{t("folder")}</dt><dd dir="ltr" className="break-all text-start">{s?.folder ?? t("notSet")}</dd>
          <dt className="text-muted">{t("password")}</dt><dd>{s?.passwordSet ? t("set") : t("notSet")}</dd>
          <dt className="text-muted">{t("last")}</dt><dd className="num">{when(s?.lastBackupAt ?? null)}</dd>
        </dl>
        {s?.lastBackupError && <p className="mt-2 text-sm text-bad">{t("lastError")}: {s.lastBackupError}</p>}
        <p className="mt-3 text-xs text-muted">{t("auto")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" disabled={busy} onClick={() => act(async () => { await b.chooseFolder(); }, t("folderSaved"))} variant="outline">{t("chooseFolder")}</Button>
          <Button type="button" disabled={busy || !s?.folder || !s?.passwordSet} onClick={() => act(() => b.backupNow(), t("done"))}>{busy ? t("working") : t("backupNow")}</Button>
          {s?.folder && <Button type="button" variant="ghost" onClick={() => void b.openFolder()}>{t("openFolder")}</Button>}
        </div>
      </Card>

      <Card>
        <CardTitle>{t("passwordTitle")}</CardTitle>
        <p className="mb-3 text-sm text-muted">{t("passwordHelp")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs">{t("newPassword")}<Input type="password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} autoComplete="new-password" /></label>
          <label className="text-xs">{t("repeatPassword")}<Input type="password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} autoComplete="new-password" /></label>
        </div>
        <Button type="button" className="mt-3" disabled={busy || pw.a.length < 10 || pw.a !== pw.b}
          onClick={() => act(async () => { await b.setPassword(pw.a); setPw({ a: "", b: "" }); }, t("passwordSaved"))}>{t("savePassword")}</Button>
        {pw.a.length > 0 && pw.a.length < 10 && <p className="mt-1 text-xs text-bad">{t("passwordShort")}</p>}
        {pw.b.length > 0 && pw.a !== pw.b && <p className="mt-1 text-xs text-bad">{t("passwordMismatch")}</p>}
      </Card>

      {s && s.backups.length > 0 && (
        <Card>
          <CardTitle>{t("listTitle")}</CardTitle>
          <ul className="space-y-1 text-sm">
            {s.backups.slice(0, 10).map((x) => <li key={x.name} className="flex justify-between gap-2"><span className="num">{when(x.date)}</span><span className="num text-muted">{Math.round(x.size / 1024)} KB</span></li>)}
          </ul>
        </Card>
      )}

      <Card>
        <CardTitle>{t("restoreTitle")}</CardTitle>
        <p className="mb-3 text-sm text-muted">{t("restoreHelp")}</p>
        {!restore ? (
          <Button type="button" variant="outline" disabled={busy} onClick={async () => { const f = await b.chooseRestoreFile(); if (f) setRestore({ file: f, pw: "" }); }}>{t("chooseFile")}</Button>
        ) : (
          <div className="space-y-2">
            <p dir="ltr" className="break-all text-start text-xs">{restore.file}</p>
            <label className="block text-xs">{t("password")}<Input type="password" value={restore.pw} onChange={(e) => setRestore({ ...restore, pw: e.target.value })} /></label>
            <div className="flex gap-2">
              <Button type="button" variant="danger" disabled={busy || !restore.pw}
                onClick={() => { if (window.confirm(t("restoreConfirm"))) void act(() => b.restore(restore.file, restore.pw), t("restarting")); }}>{t("restoreButton")}</Button>
              <Button type="button" variant="ghost" onClick={() => setRestore(null)}>{t("cancel")}</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
