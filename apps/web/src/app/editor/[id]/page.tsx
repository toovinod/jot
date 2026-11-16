"use client";
import { use } from "react";
import { Private } from "@/components/shell";
import { EditorLoader } from "@/components/editor/editor-loader";
export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Private>
      <EditorLoader key={id} id={id} />
    </Private>
  );
}
