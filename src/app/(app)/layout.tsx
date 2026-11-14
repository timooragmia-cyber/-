import { AppShell } from "@/components/app/app-shell";
import { requireUser } from "@/server/auth/dal";

// Authenticated area: always dynamic, never statically cached.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
