import { AppShell } from "@/components/app/app-shell";
import { requireUser } from "@/server/auth/dal";

// Authenticated area: always dynamic, never statically cached.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Pages enforce their own checks; the layout only needs a logged-in user for the shell.
  const user = await requireUser({ allowPasswordChangePending: true });
  return <AppShell user={user}>{children}</AppShell>;
}
