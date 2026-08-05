import { requireAdmin } from "@/lib/admin";
import { redirect } from "next/navigation";

export default async function CatalogsPage() {
  await requireAdmin();
  redirect("/admin/courses");
}
