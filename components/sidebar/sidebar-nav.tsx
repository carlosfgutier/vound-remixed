"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type CampaignListItem = {
  id: string;
  name: string;
  status:
    | "draft"
    | "defining"
    | "enriching"
    | "ready"
    | "live"
    | "paused"
    | "completed";
};

export function SidebarNav({ campaigns }: { campaigns: CampaignListItem[] }) {
  const pathname = usePathname();
  const isNew = pathname === "/campaigns/new";
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return campaigns;
    const q = query.toLowerCase();
    return campaigns.filter((c) => c.name.toLowerCase().includes(q));
  }, [campaigns, query]);

  return (
    <aside className="flex h-screen w-[260px] shrink-0 flex-col border-r border-border bg-background">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-semibold tracking-tight text-foreground">
            vBound
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            v0.1
          </span>
        </div>
      </div>

      <div className="px-3 pb-2">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search campaigns…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={cn(
              "h-9 w-full rounded-md border border-border bg-surface/40 pl-9 pr-3 text-sm",
              "text-foreground placeholder:text-muted-foreground",
              "focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40",
            )}
            disabled={campaigns.length === 0}
          />
        </label>
      </div>

      <div className="px-3 pb-3">
        <Link
          href="/campaigns/new"
          className={cn(
            "flex items-center justify-between rounded-md border border-dashed px-3 py-2 text-sm transition",
            isNew
              ? "border-accent/60 bg-accent/10 text-foreground"
              : "border-border text-muted-foreground hover:border-border-strong hover:bg-surface hover:text-foreground",
          )}
        >
          <span className="inline-flex items-center gap-2">
            <Plus className="h-3.5 w-3.5" />
            New campaign
          </span>
          <kbd className="rounded-sm border border-border bg-surface px-1 py-[1px] font-mono text-[10px] text-muted-foreground">
            ⌘N
          </kbd>
        </Link>
      </div>

      <div className="flex items-baseline justify-between px-4 pb-2 pt-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          Campaigns
        </span>
        {campaigns.length > 0 && (
          <span className="font-mono text-[10px] text-muted-foreground">
            · {campaigns.length}
          </span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2">
        {campaigns.length === 0 ? (
          <div className="mx-2 mt-2 rounded-md border border-dashed border-border/60 px-3 py-6 text-center">
            <div className="text-[11px] text-muted-foreground/80">
              No campaigns yet
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground/60">
              They&apos;ll appear here as you create them.
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mx-2 mt-2 px-3 py-6 text-center">
            <div className="text-[11px] text-muted-foreground/80">
              No matches for &ldquo;{query}&rdquo;
            </div>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((c) => (
              <CampaignRow
                key={c.id}
                item={c}
                active={pathname.startsWith(`/campaigns/${c.id}`)}
              />
            ))}
          </ul>
        )}
      </nav>
    </aside>
  );
}

const STATUS_DOT: Record<CampaignListItem["status"], string> = {
  draft: "bg-muted-foreground/60",
  defining: "bg-accent",
  enriching: "bg-warning",
  ready: "bg-success",
  live: "bg-success",
  paused: "bg-muted-foreground/40",
  completed: "bg-accent",
};

const STATUS_LABEL: Record<CampaignListItem["status"], string> = {
  draft: "Draft",
  defining: "Defining",
  enriching: "Enriching",
  ready: "Ready",
  live: "Live",
  paused: "Paused",
  completed: "Completed",
};

function CampaignRow({
  item,
  active,
}: {
  item: CampaignListItem;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={`/campaigns/${item.id}`}
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-2 text-sm transition",
          active
            ? "bg-surface text-foreground"
            : "text-foreground hover:bg-surface/60",
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            STATUS_DOT[item.status],
          )}
          aria-hidden
        />
        <span className="flex-1 truncate">{item.name}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {STATUS_LABEL[item.status]}
        </span>
      </Link>
    </li>
  );
}
