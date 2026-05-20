"use client";

import type { ReactNode } from "react";
import { AccordPill } from "@/components/AccordPill";
import { NotePill } from "@/components/NotePill";
import { extractPerfumeBodyStructure, groupPerfumeNotes, cleanPerfumeSnippet, type PerfumeSectionRow } from "@/lib/perfume-display";

function SectionFrame({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-stone-400">{label}</p>
      {children}
    </div>
  );
}

function NoteGroupRow({ label, notes }: { label: string; notes: string[] }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-400">{label}</p>
      <div className="flex flex-wrap gap-2">
        {notes.map((note, index) => (
          <NotePill key={`${label}-${index}-${note}`} note={note} />
        ))}
      </div>
    </div>
  );
}

function renderNoteSections(sections: PerfumeSectionRow[]) {
  return sections.map((section, sectionIndex) => {
    const grouped = groupPerfumeNotes(section.items);
    return (
      <div key={`${section.label}-${sectionIndex}`} className="space-y-2 rounded-2xl border border-stone-200/70 bg-white/65 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-stone-500">{section.label}</p>
        <div className="space-y-2">
          {grouped.map((group, groupIndex) => (
            <NoteGroupRow
              key={`${section.label}-${group.label}-${sectionIndex}-${groupIndex}`}
              label={group.label}
              notes={group.items}
            />
          ))}
        </div>
      </div>
    );
  });
}

export function PerfumeDetails({
  brand,
  name,
  snippet,
  text,
  accords,
  compact = false,
}: {
  brand: string;
  name: string;
  snippet: string;
  text?: string;
  accords: string[];
  compact?: boolean;
}) {
  const body = text ? extractPerfumeBodyStructure(text, brand, name) : null;
  const overview = body?.overview || cleanPerfumeSnippet(snippet, brand, name) || "";
  const accordList = body?.accords.length ? body.accords : accords;
  const noteSections = body?.noteRows.length ? body.noteRows : [];
  const outerSpacing = compact ? "space-y-3" : "space-y-4";

  return (
    <div className={outerSpacing}>
      {overview ? (
        <SectionFrame label="Overview">
          <p className="text-sm leading-relaxed text-stone-700">{overview}</p>
        </SectionFrame>
      ) : null}

      {accordList.length > 0 ? (
        <SectionFrame label="Accords">
          <div className="flex flex-wrap gap-2">
            {accordList.map((accord, index) => (
              <AccordPill key={`${accord}-${index}`} accord={accord} />
            ))}
          </div>
        </SectionFrame>
      ) : null}

      {noteSections.length > 0 ? (
        <div className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-stone-400">Notes</p>
          <div className="space-y-3">{renderNoteSections(noteSections)}</div>
        </div>
      ) : null}
    </div>
  );
}
