"use client";

import { useState } from "react";
import { ScrollText, ShieldAlert, Users } from "lucide-react";
import { AuditLogs } from "@/components/admin/audit-logs";
import { IssueModeration } from "@/components/admin/issue-moderation";
import { UserManagement } from "@/components/admin/user-management";
import { GlassPanel } from "@/components/map/glass-panel";
import { cn } from "@/lib/utils";

type AdminTab = "issues" | "users" | "logs";

const tabs = [
  { id: "issues" as const, label: "Sorun Moderasyonu", icon: ShieldAlert },
  { id: "users" as const, label: "Kullanıcılar", icon: Users },
  { id: "logs" as const, label: "İşlem Kayıtları", icon: ScrollText },
];

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminTab>("issues");

  return (
    <GlassPanel className="!border-white/10 !bg-slate-950/65 p-3 !shadow-2xl sm:p-4">
      <div
        className="grid grid-cols-1 gap-2 sm:grid-cols-3"
        role="tablist"
        aria-label="Yönetim bölümleri"
      >
        {tabs.map(({ id, label, icon: Icon }) => {
          const selected = activeTab === id;

          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`admin-panel-${id}`}
              onClick={() => setActiveTab(id)}
              className={cn(
                "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300",
                selected
                  ? "border-cyan-300/30 bg-cyan-400/15 text-cyan-100"
                  : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      <section
        id={`admin-panel-${activeTab}`}
        role="tabpanel"
        className="pt-4"
      >
        {activeTab === "issues" ? <IssueModeration /> : null}
        {activeTab === "users" ? <UserManagement /> : null}
        {activeTab === "logs" ? <AuditLogs /> : null}
      </section>
    </GlassPanel>
  );
}
