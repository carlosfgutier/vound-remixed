import { CampaignForm } from "@/components/campaign-form/campaign-form";
import { PhaseTracker } from "@/components/phase-tracker/phase-tracker";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "New campaign · vBound",
};

export default function NewCampaignPage() {
  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-border px-8 py-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          New campaign
        </div>
        <h1 className="mt-1 text-sm font-medium text-foreground">
          Tell vBound what you&apos;re sending.
        </h1>
      </header>

      <div className="border-b border-border px-8 py-4">
        <div className="mx-auto w-full max-w-3xl">
          <PhaseTracker current="details" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <p className="text-sm text-muted-foreground">
            Three questions and a list of contacts. We take it from there.
          </p>
          <CampaignForm />
        </div>
      </div>
    </div>
  );
}
