"use client";

import { useId } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { CAMPAIGN_GOALS, MAX_RANKED_GOALS } from "@/lib/campaign-goals";
import type { RankedGoal } from "@/lib/schema/campaign-input";
import { cn } from "@/lib/utils";

type Props = {
  value: RankedGoal[];
  onChange: (next: RankedGoal[]) => void;
  error?: string;
};

export function GoalsField({ value, onChange, error }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const selectedIds = new Set(value.map((g) => g.id));
  const canAddMore = value.length < MAX_RANKED_GOALS;

  const addGoal = (id: RankedGoal["id"]) => {
    if (selectedIds.has(id) || !canAddMore) return;
    onChange([...value, { id }]);
  };

  const removeGoal = (id: RankedGoal["id"]) => {
    onChange(value.filter((g) => g.id !== id));
  };

  const updateCustomLabel = (id: RankedGoal["id"], customLabel: string) => {
    onChange(value.map((g) => (g.id === id ? { ...g, customLabel } : g)));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = value.findIndex((g) => g.id === active.id);
    const newIndex = value.findIndex((g) => g.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onChange(arrayMove(value, oldIndex, newIndex));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <Label>
          Campaign goals · ranked
          <span className="ml-2 normal-case tracking-normal text-muted-foreground/60">
            pick up to {MAX_RANKED_GOALS}
          </span>
        </Label>
        <span className="font-mono text-[10px] text-muted-foreground">
          {value.length}/{MAX_RANKED_GOALS}
        </span>
      </div>

      {/* Ranked list */}
      {value.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={value.map((g) => g.id)}
            strategy={verticalListSortingStrategy}
          >
            <ol className="space-y-1.5">
              {value.map((goal, i) => (
                <RankedRow
                  key={goal.id}
                  rank={i + 1}
                  goal={goal}
                  onRemove={() => removeGoal(goal.id)}
                  onCustomLabelChange={(v) => updateCustomLabel(goal.id, v)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      {/* Available options */}
      <div className="space-y-2">
        <div className="label-mono">
          {value.length === 0 ? "Choose your goals" : "Add another"}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CAMPAIGN_GOALS.map((g) => {
            const selected = selectedIds.has(g.id);
            const disabled = selected || !canAddMore;
            return (
              <button
                key={g.id}
                type="button"
                disabled={disabled}
                onClick={() => addGoal(g.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition",
                  selected
                    ? "border-accent/30 bg-accent/5 text-muted-foreground/60 line-through"
                    : disabled
                      ? "cursor-not-allowed border-border bg-surface/40 text-muted-foreground/40"
                      : "border-border bg-surface/40 text-foreground hover:border-accent/40 hover:bg-accent/10",
                )}
              >
                <Plus className="h-3 w-3" />
                {g.label}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <p className="font-mono text-[10px] text-destructive">{error}</p>
      )}
    </div>
  );
}

function RankedRow({
  rank,
  goal,
  onRemove,
  onCustomLabelChange,
}: {
  rank: number;
  goal: RankedGoal;
  onRemove: () => void;
  onCustomLabelChange: (v: string) => void;
}) {
  const inputId = useId();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: goal.id });
  const label = CAMPAIGN_GOALS.find((g) => g.id === goal.id)?.label ?? goal.id;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-md border bg-surface/60 px-2 py-2",
        isDragging
          ? "border-accent/60 shadow-[var(--glow-accent)]"
          : "border-border hover:border-border-strong",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex h-6 w-6 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface font-mono text-[11px] text-accent">
        {rank}
      </span>
      <div className="flex-1 text-sm text-foreground">
        {goal.id === "other" ? (
          <input
            id={inputId}
            value={goal.customLabel ?? ""}
            onChange={(e) => onCustomLabelChange(e.target.value)}
            placeholder="Describe your custom goal…"
            className="w-full rounded-sm bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            autoFocus={!goal.customLabel}
          />
        ) : (
          label
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
        aria-label={`Remove ${label}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
