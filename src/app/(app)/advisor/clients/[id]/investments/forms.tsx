import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/app/action-form";
import { HouseholdField } from "@/components/app/hidden";
import { Input } from "@/components/ui/input";
import { Field, Select } from "@/components/ui/select";
import * as A from "../actions";

const sh = (a: bigint | null | undefined) => (a === null || a === undefined ? "" : `${a / 100n}${a % 100n ? "." + (a % 100n).toString().padStart(2, "0") : ""}`);
const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const ASSETS = ["EQUITY_IL", "EQUITY_FOREIGN", "BONDS_GOV", "BONDS_CORP", "MONEY_MARKET", "CASH", "OTHER"] as const;

type P = { id: string; label: string; city: string | null; usage: "RESIDENCE" | "INVESTMENT"; isOnlyApartment: boolean; purchaseDate: Date; purchasePrice: bigint; purchaseCosts: bigint; improvementCosts: bigint; currentValue: bigint; valueAsOf: Date; monthlyRent: bigint; monthlyExpenses: bigint; mortgageBalance: bigint; monthlyMortgagePayment: bigint };

export async function PropertyForm({ householdId, p, prefix }: { householdId: string; p?: P; prefix: string }) {
  const t = await getTranslations("invest.p");
  const tf = await getTranslations("form");
  const id = (k: string) => `${prefix}-${k}`;
  const money = (k: keyof P, label: string, required = false) => (
    <Field label={label} htmlFor={id(k)}><Input id={id(k)} name={k} dir="ltr" inputMode="decimal" required={required} defaultValue={p ? sh(p[k] as bigint) : ""} /></Field>
  );
  return (
    <ActionForm action={A.savePropertyAction} submitLabel={tf("save")} resetOnSuccess={!p}>
      <HouseholdField id={householdId} />
      {p && <input type="hidden" name="propertyId" value={p.id} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t("label")} htmlFor={id("label")}><Input id={id("label")} name="label" required defaultValue={p?.label} /></Field>
        <Field label={t("city")} htmlFor={id("city")}><Input id={id("city")} name="city" defaultValue={p?.city ?? ""} /></Field>
        <Field label={t("usage")} htmlFor={id("usage")}>
          <Select id={id("usage")} name="usage" defaultValue={p?.usage ?? "INVESTMENT"}><option value="INVESTMENT">{t("INVESTMENT")}</option><option value="RESIDENCE">{t("RESIDENCE")}</option></Select>
        </Field>
        <Field label={t("purchaseDate")} htmlFor={id("pd")}><Input id={id("pd")} name="purchaseDate" type="date" dir="ltr" required defaultValue={ymd(p?.purchaseDate)} /></Field>
        {money("purchasePrice", t("purchasePrice"), true)}
        {money("purchaseCosts", t("purchaseCosts"))}
        {money("improvementCosts", t("improvementCosts"))}
        {money("currentValue", t("currentValue"), true)}
        <Field label={t("valueAsOf")} htmlFor={id("va")}><Input id={id("va")} name="valueAsOf" type="date" dir="ltr" required defaultValue={ymd(p?.valueAsOf ?? new Date())} /></Field>
        {money("monthlyRent", t("monthlyRent"))}
        {money("monthlyExpenses", t("monthlyExpenses"))}
        {money("mortgageBalance", t("mortgageBalance"))}
        {money("monthlyMortgagePayment", t("monthlyMortgagePayment"))}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isOnlyApartment" defaultChecked={p?.isOnlyApartment} /> {t("isOnlyApartment")}</label>
    </ActionForm>
  );
}

export async function AccountForm({ householdId, a, prefix }: { householdId: string; a?: { id: string; name: string; institution: string; targetAllocation: unknown }; prefix: string }) {
  const t = await getTranslations("invest");
  const tf = await getTranslations("form");
  const target = (a?.targetAllocation ?? {}) as Record<string, number>;
  return (
    <ActionForm action={A.savePortfolioAccountAction} submitLabel={tf("save")} resetOnSuccess={!a}>
      <HouseholdField id={householdId} />
      {a && <input type="hidden" name="accountId" value={a.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("a.name")} htmlFor={`${prefix}-n`}><Input id={`${prefix}-n`} name="name" required defaultValue={a?.name} /></Field>
        <Field label={t("a.institution")} htmlFor={`${prefix}-i`}><Input id={`${prefix}-i`} name="institution" required defaultValue={a?.institution} /></Field>
      </div>
      <fieldset className="rounded-md border border-border p-2">
        <legend className="px-1 text-xs">{t("a.target")}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ASSETS.map((c) => (
            <label key={c} className="text-xs">{t(`asset.${c}`)}<Input name={`t_${c}`} dir="ltr" inputMode="decimal" defaultValue={target[c] ? target[c] / 10_000 : ""} /></label>
          ))}
        </div>
      </fieldset>
    </ActionForm>
  );
}

export async function HoldingForm({ householdId, accountId }: { householdId: string; accountId: string }) {
  const t = await getTranslations("invest");
  const tf = await getTranslations("form");
  return (
    <ActionForm action={A.addHoldingAction} submitLabel={tf("add")} className="flex flex-wrap items-end gap-2 space-y-0">
      <HouseholdField id={householdId} />
      <input type="hidden" name="accountId" value={accountId} />
      <Input name="name" aria-label={t("t.holding")} placeholder={t("t.holding")} required className="w-48" />
      <Input name="symbol" aria-label="symbol" placeholder="#" dir="ltr" className="w-24" />
      <Select name="assetClass" aria-label="asset class" className="w-auto">{ASSETS.map((c) => <option key={c} value={c}>{t(`asset.${c}`)}</option>)}</Select>
    </ActionForm>
  );
}

export async function TxnForm({ householdId, accountId, holdings }: { householdId: string; accountId: string; holdings: { id: string; name: string }[] }) {
  const t = await getTranslations("invest.t");
  const tf = await getTranslations("form");
  return (
    <ActionForm action={A.addPortfolioTxnAction} submitLabel={tf("add")}>
      <HouseholdField id={householdId} />
      <input type="hidden" name="accountId" value={accountId} />
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <label className="text-xs">{t("date")}<Input name="date" type="date" dir="ltr" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
        <label className="text-xs">{t("type")}<Select name="type">{(["DEPOSIT", "WITHDRAWAL", "BUY", "SELL", "DIVIDEND", "INTEREST", "FEE", "TAX"] as const).map((x) => <option key={x} value={x}>{t(x)}</option>)}</Select></label>
        <label className="text-xs">{t("holding")}<Select name="holdingId"><option value="">—</option>{holdings.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Select></label>
        <label className="text-xs">{t("units")}<Input name="units" dir="ltr" inputMode="decimal" /></label>
        <label className="text-xs">{t("amount")}<Input name="amount" dir="ltr" inputMode="decimal" required /></label>
        <label className="text-xs">{t("feeKind")}<Select name="feeKind"><option value="">—</option>{(["MANAGEMENT", "TRADING", "CUSTODY", "OTHER"] as const).map((x) => <option key={x} value={x}>{t(x)}</option>)}</Select></label>
      </div>
    </ActionForm>
  );
}

export async function ValuationForm({ householdId, accountId, holdings }: { householdId: string; accountId: string; holdings: { id: string; name: string }[] }) {
  const t = await getTranslations("invest");
  const tf = await getTranslations("form");
  return (
    <ActionForm action={A.addValuationsAction} submitLabel={tf("save")}>
      <HouseholdField id={householdId} />
      <input type="hidden" name="accountId" value={accountId} />
      <label className="text-xs">{t("t.asOf")}<Input name="asOf" type="date" dir="ltr" required defaultValue={new Date().toISOString().slice(0, 10)} className="w-44" /></label>
      <div className="grid gap-2 sm:grid-cols-2">
        {holdings.map((h) => <label key={h.id} className="text-xs">{h.name}<Input name={`val_${h.id}`} dir="ltr" inputMode="decimal" /></label>)}
      </div>
    </ActionForm>
  );
}

export async function DepositForm({ householdId }: { householdId: string }) {
  const t = await getTranslations("invest.d");
  const tf = await getTranslations("form");
  return (
    <ActionForm action={A.saveDepositAction} submitLabel={tf("add")}>
      <HouseholdField id={householdId} />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs">{t("kind")}<Select name="kind"><option value="BANK_DEPOSIT">{t("BANK_DEPOSIT")}</option><option value="MONEY_MARKET_FUND">{t("MONEY_MARKET_FUND")}</option></Select></label>
        <label className="text-xs">{t("institution")}<Input name="institution" required /></label>
        <label className="text-xs">{t("label")}<Input name="label" required /></label>
        <label className="text-xs">{t("balance")}<Input name="balance" dir="ltr" inputMode="decimal" required /></label>
        <label className="text-xs">{t("balanceAsOf")}<Input name="balanceAsOf" type="date" dir="ltr" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
        <label className="text-xs">{t("annualRate")}<Input name="annualRate" dir="ltr" inputMode="decimal" required /></label>
        <label className="text-xs">{t("fee")}<Input name="fee" dir="ltr" inputMode="decimal" /></label>
        <label className="text-xs">{t("maturityDate")}<Input name="maturityDate" type="date" dir="ltr" /></label>
      </div>
    </ActionForm>
  );
}

export async function DeleteButton({ householdId, kind, id, label, confirm }: { householdId: string; kind: string; id: string; label: string; confirm: string }) {
  return (
    <ActionForm action={A.deleteInvestAction} submitLabel={label} variant="ghost" confirm={confirm} className="inline">
      <HouseholdField id={householdId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
    </ActionForm>
  );
}
