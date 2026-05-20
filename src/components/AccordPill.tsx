"use client";

import { getAccordColor } from "@/lib/accords";

export function AccordPill({
  accord,
  large = false,
  onClick,
  selected,
}: {
  accord: string;
  large?: boolean;
  onClick?: () => void;
  selected?: boolean;
}) {
  const { bg, fg } = getAccordColor(accord);
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center rounded-full border ${large ? "px-3.5 py-1.5 text-sm font-semibold" : "px-2.5 py-1 text-xs font-medium"} ${onClick ? "cursor-pointer transition-transform hover:-translate-y-0.5 hover:scale-[1.01]" : ""} ${selected ? "shadow-[0_8px_24px_rgba(0,0,0,0.12)] ring-2 ring-offset-2" : "shadow-[0_8px_18px_rgba(0,0,0,0.06)]"}`}
      style={{
        backgroundColor: bg,
        color: fg,
        borderColor: fg,
        ...(selected ? { ringColor: fg } : {}),
      }}
    >
      {accord}
    </span>
  );
}
