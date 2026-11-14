export function HouseholdField({ id }: { id: string }) {
  return <input type="hidden" name="householdId" value={id} />;
}
