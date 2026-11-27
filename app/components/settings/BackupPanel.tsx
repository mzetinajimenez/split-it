"use client";

import { useRef, useState } from "react";
import { useBills } from "@/lib/hooks";
import { ConfirmBox } from "../ConfirmBox";
import { toast } from "../Toast";
import { Button } from "../ui";

type Pending = { backup: import("@/lib/backup").Backup; summary: string; count: number };

const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function BackupPanel() {
  const bills = useBills();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    try {
      const { exportBackup } = await import("@/lib/backup");
      const url = URL.createObjectURL(await exportBackup());
      const a = document.createElement("a");
      a.href = url;
      a.download = `split-it-backup-${today()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Backup downloaded");
    } catch {
      toast("Couldn't export the backup", true);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { parseBackup, summarizeBackup } = await import("@/lib/backup");
      const backup = parseBackup(await file.text());
      const s = summarizeBackup(backup);
      setPending({ backup, summary: s.text, count: s.billCount });
    } catch (e) {
      toast(e instanceof Error && e.name === "BackupError" ? e.message : "Couldn't read that file", true);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const doImport = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const { importBackup } = await import("@/lib/backup");
      await importBackup(pending.backup);
      setPending(null);
      toast(`Restored ${pending.summary}`);
    } catch {
      toast("Couldn't import the backup", true);
    } finally {
      setBusy(false);
    }
  };

  const doClear = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { clearAllData } = await import("@/lib/repo");
      await clearAllData();
      setConfirmClear(false);
      toast("All data cleared");
    } catch {
      toast("Couldn't clear the data", true);
    } finally {
      setBusy(false);
    }
  };

  const current = bills?.length ?? 0;
  const plural = (n: number) => `${n} ${n === 1 ? "bill" : "bills"}`;

  return (
    <section aria-labelledby="backup-h" className="flex flex-col gap-4 border-t border-rule px-4 py-5">
      <div>
        <h2 id="backup-h" className="font-display text-lg text-ink">
          Backup
        </h2>
        <p className="text-sm text-ink-muted">
          Your bills live only in this browser. Export a file to move them to another device or keep a copy.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="secondary" onClick={() => void doExport()}>
          Export backup
        </Button>
        <Button variant="secondary" onClick={() => fileRef.current?.click()}>
          Import backup
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          aria-label="Backup file"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>
      {pending ? (
        <ConfirmBox
          message={`Replace your ${plural(current)} with ${pending.count} from this file? (${pending.summary})`}
          confirmLabel="Replace"
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => void doImport()}
        />
      ) : null}
      <div className="flex flex-col gap-2 border-t border-rule pt-4">
        <h3 className="text-sm font-medium text-ink">Clear all data</h3>
        <p className="text-sm text-ink-muted">Deletes every bill and resets your defaults. This can’t be undone.</p>
        {confirmClear ? (
          <ConfirmBox
            message="Delete all bills and reset settings on this device?"
            confirmLabel="Clear everything"
            busy={busy}
            onCancel={() => setConfirmClear(false)}
            onConfirm={() => void doClear()}
          />
        ) : (
          <Button variant="secondary" className="self-start" onClick={() => setConfirmClear(true)}>
            Clear all data
          </Button>
        )}
      </div>
    </section>
  );
}
