import { getLocale, getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/app/action-form";
import { HouseholdField } from "@/components/app/hidden";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/select";
import { formatMoney, formatPpmPercent, type MoneyLocale } from "@/lib/money";
import type { accountsAnalysis } from "@/server/accounts";
import { accountDetailsAction, recordBalanceAction } from "../actions";

type Row = Awaited<ReturnType<typeof accountsAnalysis>>[number];
const sh = (a: bigint | null) => (a === null ? "" : `${a / 100n}${a % 100n ? "." + (a < 0n ? -a % 100n : a % 100n).toString().padStart(2, "0") : ""}`);

export async function AccountDetails({ householdId, row }: { householdId: string; row: Row }) {
  const t = await getTranslations();
  const locale = (await getLocale()) as MoneyLocale;
  const { account: a, latest, costs } = row;
  const money = (v: bigint) => formatMoney(v, locale);
  const p = `acc-${a.id}`;
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{a.nickname}</h3>
        {latest ? (
          <p className={`num text-lg font-bold ${latest.balance < 0n ? "text-bad" : ""}`}>
            {money(latest.balance)} <span className="text-xs font-normal text-muted">{t("acct.asOf")} {latest.asOf.toISOString().slice(0, 10)}</span>
          </p>
        ) : (
          <p className="text-sm text-muted">{t("acct.noBalance")}</p>
        )}
      </div>
      {a.kind === "BANK_ACCOUNT" && a.overdraftLimit && latest && latest.balance < 0n && (
        <p className="text-xs text-bad">{t("acct.usedOverdraft")}: <span className="num">{formatPpmPercent(Number((-latest.balance * 1_000_000n) / a.overdraftLimit), locale, 0)}</span></p>
      )}
      {a.kind === "BANK_ACCOUNT" && (
        <div className="mt-2 text-sm">
          <h4 className="text-xs font-semibold text-muted">{t("acct.costs")}</h4>
          {costs.length === 0 ? <p className="text-xs text-muted">{t("acct.noCosts")}</p> : (
            <ul className="text-xs">
              {costs.map((c) => (
                <li key={c.month} className="flex justify-between gap-2"><span className="num">{c.month}</span><span>{t("acct.interest")} <span className="num">{money(c.interest)}</span> · {t("acct.fees")} <span className="num">{money(c.fees)}</span></span></li>
              ))}
            </ul>
          )}
        </div>
      )}
      <details className="mt-2">
        <summary className="cursor-pointer text-sm text-brand">{t("acct.recordBalance")}</summary>
        <ActionForm action={recordBalanceAction} submitLabel={t("form.save")} className="mt-2 flex flex-wrap items-end gap-2 space-y-0">
          <HouseholdField id={householdId} />
          <input type="hidden" name="accountId" value={a.id} />
          <Field label={t("acct.balance")} htmlFor={`${p}-bal`}><Input id={`${p}-bal`} name="balance" dir="ltr" inputMode="decimal" className="w-36" required /></Field>
          <Field label={t("acct.asOf")} htmlFor={`${p}-asof`}><Input id={`${p}-asof`} name="asOf" type="date" dir="ltr" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
        </ActionForm>
      </details>
      <details className="mt-1">
        <summary className="cursor-pointer text-sm text-brand">{t("acct.details")}</summary>
        <ActionForm action={accountDetailsAction} submitLabel={t("form.save")} resetOnSuccess={false} className="mt-2">
          <HouseholdField id={householdId} />
          <input type="hidden" name="accountId" value={a.id} />
          <div className="grid gap-2 sm:grid-cols-3">
            {a.kind === "BANK_ACCOUNT" ? (
              <>
                <Field label={t("acct.overdraftLimit")} htmlFor={`${p}-od`}><Input id={`${p}-od`} name="overdraftLimit" dir="ltr" inputMode="decimal" defaultValue={sh(a.overdraftLimit)} /></Field>
                <Field label={t("acct.overdraftRate")} htmlFor={`${p}-odr`}><Input id={`${p}-odr`} name="overdraftRate" dir="ltr" inputMode="decimal" defaultValue={a.overdraftRatePpm !== null ? a.overdraftRatePpm / 10_000 : ""} /></Field>
                <Field label={t("acct.monthlyFee")} htmlFor={`${p}-fee`}><Input id={`${p}-fee`} name="monthlyFee" dir="ltr" inputMode="decimal" defaultValue={sh(a.monthlyFee)} /></Field>
              </>
            ) : a.kind === "CREDIT_CARD" ? (
              <>
                <Field label={t("acct.creditLimit")} htmlFor={`${p}-cl`}><Input id={`${p}-cl`} name="creditLimit" dir="ltr" inputMode="decimal" defaultValue={sh(a.creditLimit)} /></Field>
                <Field label={t("acct.billingDay")} htmlFor={`${p}-bd`}><Input id={`${p}-bd`} name="billingDay" dir="ltr" inputMode="numeric" defaultValue={a.billingDay ?? ""} /></Field>
                <Field label={t("acct.annualCardFee")} htmlFor={`${p}-acf`}><Input id={`${p}-acf`} name="annualCardFee" dir="ltr" inputMode="decimal" defaultValue={sh(a.annualCardFee)} /></Field>
              </>
            ) : null}
          </div>
        </ActionForm>
      </details>
    </div>
  );
}
