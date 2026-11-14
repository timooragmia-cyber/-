import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/app/action-form";
import { HouseholdField } from "@/components/app/hidden";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Textarea } from "@/components/ui/select";
import { periodOf, addMonths } from "@/lib/domain/period";
import { requireAdvisor } from "@/server/auth/dal";
import { db } from "@/server/db";
import { addNoteAction, addTaskAction, setTaskStatusAction } from "../actions";

export default async function TasksPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdvisor();
  const { id } = await params;
  const t = await getTranslations();
  const [notes, tasks] = await Promise.all([
    db.advisorNote.findMany({ where: { householdId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.actionItem.findMany({ where: { householdId: id }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100 }),
  ]);
  const lastMonth = addMonths(periodOf(new Date()), -1);
  const tone = { OPEN: "warn", IN_PROGRESS: "neutral", DONE: "ok", CANCELLED: "neutral" } as const;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardTitle>{t("tasks.tasks")}</CardTitle>
        {tasks.length === 0 ? <p className="mb-3 text-sm text-muted">{t("tasks.noTasks")}</p> : (
          <ul className="mb-4 space-y-3">
            {tasks.map((a) => (
              <li key={a.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{a.title}</span>
                  <span className="flex items-center gap-1">
                    <Badge tone={tone[a.status]}>{t(`tasks.status.${a.status}`)}</Badge>
                    {a.visibleToClient && <Badge>{t("tasks.visible")}</Badge>}
                  </span>
                </div>
                {a.details && <p className="mt-1 text-muted">{a.details}</p>}
                {a.dueDate && <p className="num text-xs text-muted">{a.dueDate.toISOString().slice(0, 10)}</p>}
                {a.status !== "DONE" && a.status !== "CANCELLED" && (
                  <div className="mt-2 flex gap-2">
                    {(["DONE", "CANCELLED"] as const).map((s) => (
                      <ActionForm key={s} action={setTaskStatusAction} submitLabel={t(`tasks.status.${s}`)} variant="outline">
                        <HouseholdField id={id} /><input type="hidden" name="taskId" value={a.id} /><input type="hidden" name="status" value={s} />
                      </ActionForm>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <details open={tasks.length === 0}>
          <summary className="cursor-pointer text-sm font-medium text-brand">{t("tasks.addTask")}</summary>
          <ActionForm action={addTaskAction} submitLabel={t("form.add")} className="mt-3">
            <HouseholdField id={id} />
            <input type="hidden" name="period" value={lastMonth} />
            <Field label={t("tasks.title")} htmlFor="task-title"><Input id="task-title" name="title" required /></Field>
            <Field label={t("tasks.details")} htmlFor="task-details"><Textarea id="task-details" name="details" rows={2} /></Field>
            <Field label={t("tasks.due")} htmlFor="task-due"><Input id="task-due" name="dueDate" type="date" dir="ltr" /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="visibleToClient" defaultChecked /> {t("tasks.visible")}</label>
          </ActionForm>
        </details>
      </Card>

      <Card>
        <CardTitle>{t("tasks.notes")}</CardTitle>
        <ActionForm action={addNoteAction} submitLabel={t("tasks.addNote")}>
          <HouseholdField id={id} />
          <input type="hidden" name="period" value={lastMonth} />
          <Textarea name="body" rows={3} aria-label={t("tasks.note")} required />
        </ActionForm>
        {notes.length === 0 ? <p className="mt-3 text-sm text-muted">{t("tasks.noNotes")}</p> : (
          <ul className="mt-4 space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="border-s-2 border-accent ps-3 text-sm">
                <p className="whitespace-pre-wrap">{n.body}</p>
                <p className="num text-xs text-muted">{n.createdAt.toISOString().slice(0, 10)}{n.period ? ` · ${n.period}` : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
