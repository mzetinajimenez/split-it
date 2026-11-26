"use client";

import { useState } from "react";
import {
  Avatar,
  AvatarStack,
  Button,
  CheckGlyph,
  ChevronGlyph,
  Chip,
  EmptyState,
  Field,
  HeaderShell,
  MinusGlyph,
  Money,
  MoneyInput,
  PERSON_BG,
  PlusGlyph,
  ReceiptGlyph,
  SegmentedControl,
  ShareGlyph,
  SplitGlyph,
  Stepper,
  SummaryGlyph,
  TextInput,
  TipGlyph,
  TrashGlyph,
  UsersGlyph,
} from "@/app/components/ui";

const SURFACE_SWATCHES = [
  ["ground", "bg-ground"],
  ["ground-deep", "bg-ground-deep"],
  ["raised", "bg-raised"],
  ["rule", "bg-rule"],
  ["rule-strong", "bg-rule-strong"],
] as const;

const INK_SWATCHES = [
  ["ink", "bg-ink"],
  ["ink-muted", "bg-ink-muted"],
  ["accent", "bg-accent"],
  ["accent-deep", "bg-accent-deep"],
  ["attention", "bg-attention"],
  ["danger", "bg-danger"],
  ["danger-deep", "bg-danger-deep"],
] as const;

const PEOPLE = [
  { id: "a", initials: "AN", colorIndex: 0, name: "Ana" },
  { id: "b", initials: "BE", colorIndex: 1, name: "Ben" },
  { id: "c", initials: "CH", colorIndex: 2, name: "Chi" },
  { id: "d", initials: "DO", colorIndex: 3, name: "Dov" },
  { id: "e", initials: "EM", colorIndex: 4, name: "Emi" },
  { id: "f", initials: "FA", colorIndex: 5, name: "Fay" },
  { id: "g", initials: "GU", colorIndex: 6, name: "Gus" },
  { id: "h", initials: "HA", colorIndex: 7, name: "Hal" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-rule px-4 py-5">
      <h2 className="mb-3 font-mono text-xs font-medium tracking-widest text-ink-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

export function Showcase() {
  const [filter, setFilter] = useState<"all" | "unclaimed" | "mine">("all");
  const [tip, setTip] = useState(20);
  const [shares, setShares] = useState(1);
  const [basis, setBasis] = useState<"amount" | "percent">("amount");

  return (
    <div className="mx-auto max-w-3xl bg-ground pb-16">
      <HeaderShell
        title="Friday at Lupe's"
        subtitle="Tonight · 6 people"
        back={<Button variant="ghost" aria-label="Back" icon={<ChevronGlyph direction="left" />} />}
        actions={<Button variant="ghost" aria-label="Share" icon={<ShareGlyph />} />}
      />

      <Section title="Surfaces">
        <div className="grid grid-cols-5 gap-2">
          {SURFACE_SWATCHES.map(([name, bg]) => (
            <div key={name} className="flex flex-col gap-1">
              <div className={`h-14 rounded-sm border border-rule-strong ${bg}`} />
              <span className="font-mono text-[0.6875rem] text-ink-muted">{name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Ink, accent, attention, danger">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {INK_SWATCHES.map(([name, bg]) => (
            <div key={name} className="flex flex-col gap-1">
              <div className={`h-14 rounded-sm ${bg}`} />
              <span className="font-mono text-[0.6875rem] text-ink-muted">{name}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-1 text-sm">
          <p className="text-ink">Ink on ground — body text, item names.</p>
          <p className="text-ink-muted">Ink-muted — dates, hints, quantities.</p>
          <p className="text-accent">Accent — yes, primary, active.</p>
          <p className="text-attention">Attention — 3 items unclaimed (a to-do, not an error).</p>
          <p className="text-danger">Danger — destructive and errors only.</p>
        </div>
      </Section>

      <Section title="Person colours (on-person initials)">
        <div className="flex flex-wrap gap-3">
          {PEOPLE.map((p) => (
            <div key={p.id} className="flex flex-col items-center gap-1">
              <Avatar initials={p.initials} colorIndex={p.colorIndex} size="lg" label={p.name} />
              <span className="font-mono text-[0.6875rem] text-ink-muted">person-{p.colorIndex}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-4">
          <Avatar initials="AN" colorIndex={0} size="sm" />
          <Avatar initials="AN" colorIndex={0} size="md" />
          <Avatar initials="AN" colorIndex={0} size="lg" />
          <AvatarStack people={PEOPLE.slice(0, 2)} label="Ana and Ben" />
          <AvatarStack people={PEOPLE} max={4} size="md" label="8 people" />
        </div>
        <p className="sr-only">{PERSON_BG.length} colours</p>
      </Section>

      <Section title="Type">
        <p className="font-display text-2xl font-bold">split-it</p>
        <p className="font-display text-lg font-bold">Who had the nachos?</p>
        <p className="font-body text-base">IBM Plex Sans for running text and controls.</p>
        <p className="font-mono text-base tabular">
          <Money cents={14280} currency="USD" /> · <Money cents={-500} currency="USD" /> ·{" "}
          <Money cents={2856} currency="USD" signed /> · <Money cents={1235} currency="JPY" />
        </p>
      </Section>

      <Section title="Receipt rows (hairlines, not cards)">
        <ul className="border-y border-rule bg-raised">
          {[
            { name: "Nachos grande", qty: 1, cents: 1250, who: PEOPLE.slice(0, 2) },
            { name: "Margarita", qty: 3, cents: 3600, who: PEOPLE.slice(0, 5) },
            { name: "Elote", qty: 2, cents: 900, who: [] },
          ].map((item) => (
            <li key={item.name} className="flex min-h-14 items-center gap-3 border-b border-rule pl-4 last:border-b-0">
              {item.who.length === 0 ? (
                <span aria-label="Unclaimed" className="size-2 shrink-0 rounded-full bg-attention" />
              ) : (
                <span className="size-2 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-base text-ink">
                  <span className="font-mono text-ink-muted tabular">{item.qty} ×</span> {item.name}
                </p>
                {item.who.length === 0 ? (
                  <p className="text-sm text-attention">Unclaimed</p>
                ) : item.who.length === 2 ? (
                  <p className="text-sm text-ink-muted">½ each</p>
                ) : null}
              </div>
              <AvatarStack people={item.who} max={3} />
              <Money cents={item.cents} currency="USD" className="text-base" />
              <Button variant="ghost" aria-label={`Split ${item.name}`} icon={<ChevronGlyph />} />
            </li>
          ))}
        </ul>
        <div className="mt-4 rule-perforated pt-3 flex justify-between font-mono text-base tabular">
          <span>Total</span>
          <Money cents={5750} currency="USD" className="font-semibold" />
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={<PlusGlyph />}>
            New bill
          </Button>
          <Button variant="secondary">Paste receipt</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger" icon={<TrashGlyph />}>
            Delete bill
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </div>
        <Button variant="primary" size="lg" className="mt-3 w-full" icon={<CheckGlyph />}>
          Add 6 items
        </Button>
      </Section>

      <Section title="Chips · segmented · stepper">
        <div className="flex flex-wrap gap-2">
          {([15, 18, 20, 22] as const).map((p) => (
            <Chip key={p} pressed={tip === p} onPressedChange={() => setTip(p)}>
              {p}%
            </Chip>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <SegmentedControl
            label="Filter items"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "unclaimed", label: "Unclaimed" },
              { value: "mine", label: "Mine" },
            ]}
          />
          <Stepper label="Ana's shares" value={shares} onChange={setShares} min={0} max={9} />
        </div>
      </Section>

      <Section title="Fields">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bill name" hint="Shown in your history.">
            {({ id, describedBy }) => (
              <TextInput id={id} aria-describedby={describedBy} defaultValue="Friday at Lupe's" />
            )}
          </Field>
          <Field label="Tax">
            {({ id }) => (
              <div className="flex gap-2">
                <div className="flex-1">
                  <MoneyInput id={id} prefix="$" defaultValue="8.25" />
                </div>
                <SegmentedControl
                  label="Tax as"
                  value={basis}
                  onChange={setBasis}
                  options={[
                    { value: "amount", label: "$" },
                    { value: "percent", label: "%" },
                  ]}
                />
              </div>
            )}
          </Field>
          <Field label="Printed total" error="Items add up to $96.50 — receipt says $98.50">
            {({ id, describedBy, invalid }) => (
              <MoneyInput id={id} prefix="$" aria-describedby={describedBy} invalid={invalid} defaultValue="98.50" />
            )}
          </Field>
        </div>
      </Section>

      <Section title="Glyphs">
        <div className="flex flex-wrap gap-4 text-ink">
          <PlusGlyph />
          <MinusGlyph />
          <ChevronGlyph />
          <CheckGlyph />
          <TrashGlyph />
          <ShareGlyph />
          <ReceiptGlyph />
          <UsersGlyph />
          <SplitGlyph />
          <TipGlyph />
          <SummaryGlyph />
        </div>
      </Section>

      <EmptyState
        icon={<ReceiptGlyph />}
        title="Split your first bill"
        body="Type or paste the receipt, add the people, and everyone taps what they had."
        action={
          <Button variant="primary" icon={<PlusGlyph />}>
            New bill
          </Button>
        }
      />
    </div>
  );
}
