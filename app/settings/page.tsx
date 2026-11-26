import { EmptyState, HeaderShell } from "../components/ui";

// Placeholder body: defaults, backup and clear-data land with #26.
export default function SettingsPage() {
  return (
    <>
      <HeaderShell title="Settings" />
      <main className="px-4 py-6">
        <EmptyState title="Settings" body="Defaults and backup will live here." />
      </main>
    </>
  );
}
