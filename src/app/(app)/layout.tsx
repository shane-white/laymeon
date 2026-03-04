import { createClient } from "@/lib/supabase/server";
import { IconSidebar } from "@/components/layout/icon-sidebar";
import { redirect } from "next/navigation";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex h-dvh overflow-hidden">
      <IconSidebar />
      <div className="h-full w-full flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
