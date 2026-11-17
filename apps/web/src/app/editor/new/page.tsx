"use client";
import { Private } from "@/components/shell";
import { NewPage } from "@/components/editor/new-page";
export default function NewEditorPage() {
  return (
    <Private>
      <NewPage />
    </Private>
  );
}
