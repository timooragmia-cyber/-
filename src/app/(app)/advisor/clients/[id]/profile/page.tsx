import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/app/action-form";
import { HouseholdField } from "@/components/app/hidden";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Select } from "@/components/ui/select";
import { formatMoney, type MoneyLocale } from "@/lib/money";
import { requireAdvisor, requireOpenHousehold } from "@/server/auth/dal";
import { db } from "@/server/db";
import { getHouseholdProfile } from "@/server/households";
import * as A from "../actions";

function DeleteRow({ householdId, kind, rowId, label }: { householdId: string; kind: string; rowId: string; label: string }) {
  return (
    <ActionForm action={A.deleteRowAction} submitLabel={label} variant="ghost" className="inline">
      <HouseholdField id={householdId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={rowId} />
    </ActionForm>
  );
}

const EMPLOYMENT = ["SALARIED", "SELF_EMPLOYED", "BOTH", "NOT_EMPLOYED", "RETIRED"] as const;
const INCOME = ["SALARY", "SELF_EMPLOYMENT", "BONUS", "RENTAL", "PENSION", "ALLOWANCE", "OTHER"] as const;

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdvisor();
  const { id } = await params;
  await requireOpenHousehold(id);
  const h = await getHouseholdProfile(user, id);
  if (!h) notFound();
  const logins = await db.user.findMany({ where: { householdId: id }, select: { id: true, email: true, lastLoginAt: true, mustChangePassword: true } });
  const t = await getTranslations();
  const locale = (await getLocale()) as MoneyLocale;
  const activeConsent = h.consents.find((c) => c.type === "DATA_PROCESSING" && !c.revokedAt);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardTitle>{t("household.profile")}</CardTitle>
        <ActionForm action={A.updateProfileAction} submitLabel={t("form.save")} resetOnSuccess={false}>
          <HouseholdField id={id} />
          <Field label={t("newClient.displayName")} htmlFor="displayName"><Input id="displayName" name="displayName" defaultValue={h.displayName} required /></Field>
          <Field label={t("newClient.city")} htmlFor="city"><Input id="city" name="city" defaultValue={h.city ?? ""} /></Field>
          <Field label={t("newClient.preferredLocale")} htmlFor="preferredLocale">
            <Select id="preferredLocale" name="preferredLocale" defaultValue={h.preferredLocale}>
              <option value="he">{t("lang.he")}</option>
              <option value="ar">{t("lang.ar")}</option>
            </Select>
          </Field>
          <Field label={t("household.riskTolerance")} htmlFor="riskTolerance">
            <Select id="riskTolerance" name="riskTolerance" defaultValue={h.riskTolerance ?? ""}>
              <option value="">{t("household.notAssessed")}</option>
              {(["VERY_LOW", "LOW", "MEDIUM", "HIGH"] as const).map((r) => <option key={r} value={r}>{t(`enums.RiskTolerance.${r}`)}</option>)}
            </Select>
          </Field>
        </ActionForm>
      </Card>

      <Card>
        <CardTitle>{t("household.consents")}</CardTitle>
        <ul className="mb-3 space-y-2 text-sm">
          {h.consents.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {t(`consentMethod.${c.method}`)} · <span className="num">{c.grantedAt.toISOString().slice(0, 10)}</span> · v{c.textVersion}{" "}
                {c.revokedAt && <Badge tone="bad">{t("profile.revoked")}</Badge>}
              </span>
              {!c.revokedAt && (
                <ActionForm action={A.revokeConsentAction} submitLabel={t("profile.revoke")} variant="outline" className="inline">
                  <HouseholdField id={id} />
                  <input type="hidden" name="consentId" value={c.id} />
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
        {!activeConsent && (
          <ActionForm action={A.recordConsentAction} submitLabel={t("profile.recordConsent")}>
            <HouseholdField id={id} />
            <Select name="method" aria-label={t("newClient.consent")}>
              {(["SIGNED_FORM", "PORTAL_ACCEPTANCE", "RECORDED_VERBAL"] as const).map((m) => <option key={m} value={m}>{t(`consentMethod.${m}`)}</option>)}
            </Select>
          </ActionForm>
        )}
      </Card>

      <Card>
        <CardTitle>{t("profile.members")}</CardTitle>
        <ul className="mb-4 space-y-1 text-sm">
          {h.members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2">
              <span>
                {m.firstName} {m.lastName} — {t(`enums.MemberRole.${m.memberRole}`)}
                {m.birthYear && <span className="num"> · {m.birthYear}</span>}
                {m.employmentType && <> · {t(`enums.EmploymentType.${m.employmentType}`)}</>}
              </span>
              {m.memberRole !== "PRIMARY" && <DeleteRow householdId={id} kind="member" rowId={m.id} label={t("form.delete")} />}
            </li>
          ))}
        </ul>
        <details>
          <summary className="cursor-pointer text-sm font-medium text-brand">{t("profile.addMember")}</summary>
          <ActionForm action={A.addMemberAction} submitLabel={t("form.add")} className="mt-3">
            <HouseholdField id={id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("profile.firstName")} htmlFor="m-first"><Input id="m-first" name="firstName" required /></Field>
              <Field label={t("profile.lastName")} htmlFor="m-last"><Input id="m-last" name="lastName" required defaultValue={h.members[0]?.lastName} /></Field>
              <Field label={t("profile.role")} htmlFor="m-role">
                <Select id="m-role" name="memberRole">
                  {(["SPOUSE", "DEPENDENT", "OTHER"] as const).map((r) => <option key={r} value={r}>{t(`enums.MemberRole.${r}`)}</option>)}
                </Select>
              </Field>
              <Field label={t("profile.birthYear")} htmlFor="m-year"><Input id="m-year" name="birthYear" inputMode="numeric" dir="ltr" /></Field>
              <Field label={t("household.employment")} htmlFor="m-emp">
                <Select id="m-emp" name="employmentType">
                  <option value="">—</option>
                  {EMPLOYMENT.map((e) => <option key={e} value={e}>{t(`enums.EmploymentType.${e}`)}</option>)}
                </Select>
              </Field>
            </div>
          </ActionForm>
        </details>
      </Card>

      <Card>
        <CardTitle>{t("household.incomeSources")}</CardTitle>
        <ul className="mb-4 space-y-1 text-sm">
          {h.incomeSources.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2">
              <span>{s.label} ({t(`enums.IncomeType.${s.type}`)}, {t(`profile.${s.regularity}`)})</span>
              <span className="flex items-center gap-2">
                <span className="num">{s.netMonthly !== null ? formatMoney(s.netMonthly, locale, { decimals: 0 }) : "—"}</span>
                <DeleteRow householdId={id} kind="income" rowId={s.id} label={t("form.delete")} />
              </span>
            </li>
          ))}
        </ul>
        <details>
          <summary className="cursor-pointer text-sm font-medium text-brand">{t("profile.addIncome")}</summary>
          <ActionForm action={A.addIncomeAction} submitLabel={t("form.add")} className="mt-3">
            <HouseholdField id={id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("profile.label")} htmlFor="i-label"><Input id="i-label" name="label" required /></Field>
              <Field label={t("profile.type")} htmlFor="i-type">
                <Select id="i-type" name="type">{INCOME.map((i) => <option key={i} value={i}>{t(`enums.IncomeType.${i}`)}</option>)}</Select>
              </Field>
              <Field label={t("profile.person")} htmlFor="i-person">
                <Select id="i-person" name="personId">
                  <option value="">—</option>
                  {h.members.map((m) => <option key={m.id} value={m.id}>{m.firstName}</option>)}
                </Select>
              </Field>
              <Field label={t("profile.regularity")} htmlFor="i-reg">
                <Select id="i-reg" name="regularity"><option value="FIXED">{t("profile.FIXED")}</option><option value="IRREGULAR">{t("profile.IRREGULAR")}</option></Select>
              </Field>
              <Field label={t("profile.net")} htmlFor="i-net"><Input id="i-net" name="netMonthly" inputMode="decimal" dir="ltr" required /></Field>
              <Field label={`${t("profile.gross")} ${t("form.optional")}`} htmlFor="i-gross"><Input id="i-gross" name="grossMonthly" inputMode="decimal" dir="ltr" /></Field>
            </div>
          </ActionForm>
        </details>
      </Card>

      <Card>
        <CardTitle>{t("household.goals")}</CardTitle>
        <ul className="mb-4 space-y-1 text-sm">
          {h.goals.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-2">
              <span>{g.title}{g.targetDate && <span className="num text-muted"> · {g.targetDate.toISOString().slice(0, 10)}</span>}</span>
              <span className="flex items-center gap-2"><span className="num">{formatMoney(g.targetAmount, locale, { decimals: 0 })}</span><DeleteRow householdId={id} kind="goal" rowId={g.id} label={t("form.delete")} /></span>
            </li>
          ))}
        </ul>
        <details>
          <summary className="cursor-pointer text-sm font-medium text-brand">{t("profile.addGoal")}</summary>
          <ActionForm action={A.addGoalAction} submitLabel={t("form.add")} className="mt-3">
            <HouseholdField id={id} />
            <Field label={t("profile.goalTitle")} htmlFor="g-title"><Input id="g-title" name="title" required /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("profile.targetAmount")} htmlFor="g-amount"><Input id="g-amount" name="targetAmount" inputMode="decimal" dir="ltr" required /></Field>
              <Field label={t("profile.targetDate")} htmlFor="g-date"><Input id="g-date" name="targetDate" type="date" dir="ltr" /></Field>
            </div>
          </ActionForm>
        </details>
      </Card>

      <Card>
        <CardTitle>{t("profile.clientLogin")}</CardTitle>
        {logins.length === 0 ? (
          <p className="mb-3 text-sm text-muted">{t("profile.noLogins")}</p>
        ) : (
          <ul className="mb-3 space-y-1 text-sm">
            {logins.map((l) => <li key={l.id} className="num" dir="ltr">{l.email}</li>)}
          </ul>
        )}
        <ActionForm action={A.createClientLoginAction} submitLabel={t("profile.createLogin")}>
          <HouseholdField id={id} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("profile.email")} htmlFor="l-email"><Input id="l-email" name="email" type="email" dir="ltr" required /></Field>
            <Field label={t("profile.person")} htmlFor="l-person">
              <Select id="l-person" name="personId">{h.members.filter((m) => m.memberRole !== "DEPENDENT").map((m) => <option key={m.id} value={m.id}>{m.firstName}</option>)}</Select>
            </Field>
            <Field label={t("account.language")} htmlFor="l-locale">
              <Select id="l-locale" name="locale" defaultValue={h.preferredLocale}><option value="he">{t("lang.he")}</option><option value="ar">{t("lang.ar")}</option></Select>
            </Field>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
