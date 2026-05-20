"use client";

import { getNoteTone } from "@/lib/note-style";

export function NotePill({ note, large = false }: { note: string; large?: boolean }) {
  const tone = getNoteTone(note);
  return (
    <span
      className={`inline-flex items-center rounded-full border ${large ? "px-3.5 py-1.5 text-sm font-semibold" : "px-2.5 py-1 text-xs font-medium"} shadow-[0_8px_18px_rgba(0,0,0,0.05)]`}
      style={{
        backgroundColor: tone.bg,
        color: tone.fg,
        borderColor: tone.border,
      }}
    >
      {note}
    </span>
  );
}
