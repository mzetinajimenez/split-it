import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Showcase } from "./Showcase";

// Throwaway theme showcase for #4 (tokens + primitives). Never served in production.
export const metadata: Metadata = { title: "UI primitives · split-it", robots: { index: false } };

export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Showcase />;
}
