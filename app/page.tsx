import { EmptyState, HeaderShell } from "./components/ui";

// Placeholder body: the Bills history list lands with #15.
export default function Home() {
  return (
    <>
      <HeaderShell title="split-it" />
      <main className="px-4 py-6">
        <EmptyState title="Bills" body="Your bills will show up here." />
      </main>
    </>
  );
}
