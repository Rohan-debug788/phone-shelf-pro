import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Boxes,
  PackagePlus,
  ArrowLeftRight,
  ShoppingCart,
  Receipt,
  Users,
  FileBarChart,
  Settings,
  LogOut,
  Menu,
  X,
  KeyRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type NavItem = { to: string; label: string; icon: typeof Boxes; adminOnly?: boolean; agentOnly?: boolean };

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/add-stock", label: "Add stock", icon: PackagePlus, adminOnly: true },
  { to: "/transfers", label: "Stock transfer", icon: ArrowLeftRight, adminOnly: true },
  { to: "/sell", label: "Sell", icon: ShoppingCart, agentOnly: true },
  { to: "/sales", label: "Sales registered", icon: Receipt },
  { to: "/users", label: "Users", icon: Users, adminOnly: true },
  { to: "/reports", label: "Reports", icon: FileBarChart, adminOnly: true },
  { to: "/settings", label: "Shop details", icon: Settings, adminOnly: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { data: user } = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const items = NAV.filter((i) => {
    if (i.adminOnly) return user?.isAdmin;
    if (i.agentOnly) return user && !user.isAdmin;
    return true;
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <div>
            <p className="font-display text-lg font-semibold text-sidebar-foreground">Shop Stock</p>
            <p className="text-xs text-sidebar-foreground/60">
              {user?.isAdmin ? "Administrator" : "Sales agent"}
            </p>
          </div>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {items.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="size-4.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-sidebar-border p-3">
          <Link
            to="/change-password"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <KeyRound className="size-4.5" />
            Change password
          </Link>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-4.5" />
            Sign out
          </button>
          <p className="px-3 pt-2 text-xs text-sidebar-foreground/50">{user?.name || user?.email}</p>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-foreground/40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </Button>
          <span className="font-display font-semibold">Shop Stock</span>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-8 lg:py-10">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    in_store: "bg-info/10 text-info",
    with_agent: "bg-warning/15 text-warning-foreground",
    sold: "bg-success/15 text-success",
  };
  const label: Record<string, string> = {
    in_store: "In store",
    with_agent: "With agent",
    sold: "Sold",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        map[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {label[status] ?? status}
    </span>
  );
}
