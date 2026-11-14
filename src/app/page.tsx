import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/dal";

export default async function Home() {
  const user = await requireUser();
  redirect(user.role === "ADVISOR" ? "/advisor" : "/portal");
}
