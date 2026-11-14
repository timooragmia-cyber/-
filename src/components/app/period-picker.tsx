import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

/** GET form month picker (works without JS). */
export function PeriodPicker({ periods, current, label, submitLabel, extra }: { periods: string[]; current: string; label: string; submitLabel: string; extra?: React.ReactNode }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      <label className="text-sm">
        <span className="mb-1 block font-medium">{label}</span>
        <Select name="period" defaultValue={current} className="num w-40">
          {periods.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
      </label>
      {extra}
      <Button type="submit" variant="outline">{submitLabel}</Button>
    </form>
  );
}
