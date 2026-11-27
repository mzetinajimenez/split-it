import { BackupPanel } from "../components/settings/BackupPanel";
import { DefaultsPanel } from "../components/settings/DefaultsPanel";
import { HeaderShell } from "../components/ui";

export default function SettingsPage() {
  return (
    <>
      <HeaderShell title="Settings" />
      <main>
        <DefaultsPanel />
        <BackupPanel />
      </main>
    </>
  );
}
