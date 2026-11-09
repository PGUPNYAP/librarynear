import Link from "next/link";
import { Suspense } from "react";
import { Building2, LogOut, Zap } from "lucide-react";
import { FlashBanner } from "@/components/flash-banner";
import { logout } from "@/app/admin/actions";

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div>
            <h1 className="text-lg font-bold text-black">Sales Workspace</h1>
            <p className="text-xs text-muted-foreground">Assigned library cleanup and verification</p>
          </div>
          <nav className="flex items-center gap-4 text-sm font-medium">
            <Link href="/sales/libraries" className="flex items-center gap-2 text-black hover:text-primary">
              <Building2 className="h-4 w-4" />
              My libraries
            </Link>
            <Link href="/sales/quick-fill" className="flex items-center gap-2 text-black hover:text-primary">
              <Zap className="h-4 w-4" />
              Quick fill
            </Link>
            <form action={logout}>
              <button className="flex items-center gap-2 text-rose-600 hover:underline">
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <Suspense fallback={null}>
        <FlashBanner />
      </Suspense>
      <main>{children}</main>
    </div>
  );
}
