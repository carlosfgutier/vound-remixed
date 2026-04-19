import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";

export const metadata = {
  title: "vBound",
};

export default function DashboardHome() {
  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-8 py-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Overview
          </div>
          <h1 className="mt-1 text-sm font-medium text-foreground">
            Campaigns
          </h1>
        </div>
        <Link
          href="/campaigns/new"
          className="inline-flex items-center gap-2 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition hover:bg-foreground/90"
        >
          <Plus className="h-3.5 w-3.5" />
          New campaign
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center px-8 py-12">
        <div className="flex max-w-md flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface">
            <Sparkles className="h-5 w-5 text-accent" />
          </div>
          <h2 className="mt-5 text-lg font-semibold tracking-tight text-foreground">
            No campaigns yet
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Turn a list of contacts into a personalized, enriched outbound
            sequence. Tell vBound what you&apos;re sending, who you&apos;re
            sending to, and what success looks like.
          </p>
          <Link
            href="/campaigns/new"
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-xs font-medium text-background transition hover:bg-foreground/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Start your first campaign
          </Link>
        </div>
      </div>
    </div>
  );
}
