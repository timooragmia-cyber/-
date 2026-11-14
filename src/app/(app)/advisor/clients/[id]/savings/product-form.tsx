import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/app/action-form";
import { HouseholdField } from "@/components/app/hidden";
import { Input } from "@/components/ui/input";
import { Field, Select } from "@/components/ui/select";
import { PRODUCT_TYPES } from "@/server/savings/report-parsers";
import { saveProductAction } from "../actions";

type P = {
  id: string;
  personId: string | null;
  productType: string;
  provider: string;
  track: string | null;
  policyLast4: string | null;
  balance: bigint;
  balanceAsOf: Date;
  employeeDeposit: bigint;
  employerDeposit: bigint;
  severanceDeposit: bigint;
  feeDepositsPpm: number;
  feeAccumulationPpm: number;
  startDate: Date | null;
  isActive: boolean;
};

const sh = (a: bigint) => `${a / 100n}${a % 100n ? "." + (a % 100n).toString().padStart(2, "0") : ""}`;
const pct = (ppm: number) => (ppm / 10_000).toString();
const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export async function ProductForm({ householdId, members, product, idPrefix }: { householdId: string; members: { id: string; firstName: string }[]; product?: P; idPrefix: string }) {
  const t = await getTranslations();
  const id = (k: string) => `${idPrefix}-${k}`;
  return (
    <ActionForm action={saveProductAction} submitLabel={t("form.save")} resetOnSuccess={!product}>
      <HouseholdField id={householdId} />
      {product && <input type="hidden" name="productId" value={product.id} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t("savings.person")} htmlFor={id("person")}>
          <Select id={id("person")} name="personId" defaultValue={product?.personId ?? members[0]?.id ?? ""}>
            <option value="">—</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.firstName}</option>)}
          </Select>
        </Field>
        <Field label={t("savings.type")} htmlFor={id("type")}>
          <Select id={id("type")} name="productType" defaultValue={product?.productType ?? "PENSION_COMPREHENSIVE"}>
            {PRODUCT_TYPES.map((p) => <option key={p} value={p}>{t(`productType.${p}`)}</option>)}
          </Select>
        </Field>
        <Field label={t("savings.provider")} htmlFor={id("provider")}><Input id={id("provider")} name="provider" defaultValue={product?.provider} required /></Field>
        <Field label={t("savings.track")} htmlFor={id("track")}><Input id={id("track")} name="track" defaultValue={product?.track ?? ""} /></Field>
        <Field label={t("savings.balance")} htmlFor={id("balance")}><Input id={id("balance")} name="balance" dir="ltr" inputMode="decimal" defaultValue={product ? sh(product.balance) : ""} required /></Field>
        <Field label={t("savings.balanceAsOf")} htmlFor={id("asof")}><Input id={id("asof")} name="balanceAsOf" type="date" dir="ltr" defaultValue={ymd(product?.balanceAsOf ?? new Date())} required /></Field>
        <Field label={t("savings.employee")} htmlFor={id("emp")}><Input id={id("emp")} name="employeeDeposit" dir="ltr" inputMode="decimal" defaultValue={product ? sh(product.employeeDeposit) : ""} /></Field>
        <Field label={t("savings.employer")} htmlFor={id("er")}><Input id={id("er")} name="employerDeposit" dir="ltr" inputMode="decimal" defaultValue={product ? sh(product.employerDeposit) : ""} /></Field>
        <Field label={t("savings.severance")} htmlFor={id("sev")}><Input id={id("sev")} name="severanceDeposit" dir="ltr" inputMode="decimal" defaultValue={product ? sh(product.severanceDeposit) : ""} /></Field>
        <Field label={t("savings.feeDeposits")} htmlFor={id("fd")}><Input id={id("fd")} name="feeDeposits" dir="ltr" inputMode="decimal" defaultValue={product ? pct(product.feeDepositsPpm) : ""} /></Field>
        <Field label={t("savings.feeAccumulation")} htmlFor={id("fa")}><Input id={id("fa")} name="feeAccumulation" dir="ltr" inputMode="decimal" defaultValue={product ? pct(product.feeAccumulationPpm) : ""} /></Field>
        <Field label={t("savings.policyLast4")} htmlFor={id("last4")}><Input id={id("last4")} name="policyLast4" dir="ltr" inputMode="numeric" maxLength={4} defaultValue={product?.policyLast4 ?? ""} /></Field>
        <Field label={t("savings.startDate")} htmlFor={id("start")}><Input id={id("start")} name="startDate" type="date" dir="ltr" defaultValue={ymd(product?.startDate ?? null)} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={product?.isActive ?? true} /> {t("savings.active")}</label>
    </ActionForm>
  );
}
