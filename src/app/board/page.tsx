import Link from "next/link";

import { loadBoard, slugifyTask, type BoardItem } from "@/lib/agent-board";

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "Active" || status === "In Progress"
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : status === "On Deck"
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : status === "Backlog"
          ? "bg-slate-100 text-slate-700 border-slate-200"
          : "bg-violet-100 text-violet-800 border-violet-200";

  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}>{status}</span>;
}

function SectionCard({
  title,
  items,
}: {
  title: string;
  items: BoardItem[];
}) {
  return (
    <section className="rounded-2xl border border-violet-200 bg-white/90 shadow-sm overflow-hidden">
      <div className="border-b border-violet-100 px-5 py-4">
        <h2 className="text-lg font-bold text-violet-900">{title}</h2>
        <p className="text-sm text-violet-500">{items.length} items</p>
      </div>
      <div className="divide-y divide-violet-100">
        {items.map((item) => (
          <div key={`${item.task}-${item.owner}`} className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-violet-900">
                  <Link className="hover:underline" href={`/board/${slugifyTask(item.task)}`}>
                    {item.task}
                  </Link>
                </h3>
                <p className="mt-1 text-sm text-violet-500">
                  Owner: <span className="font-medium text-violet-700">{item.owner}</span>
                  {item.branch ? (
                    <>
                      {" "}
                      · <span className="font-mono text-violet-400">{item.branch}</span>
                    </>
                  ) : null}
                </p>
              </div>
              <StatusPill status={item.status} />
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{item.notes}</p>
            {item.commit ? (
              <p className="mt-2 text-xs text-slate-400">
                Commit: <span className="font-mono">{item.commit}</span>
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function BoardPage() {
  const board = await loadBoard();

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(circle_at_top_left,_rgba(140,102,255,0.18),_transparent_45%),radial-gradient(circle_at_top_right,_rgba(34,197,94,0.12),_transparent_40%),linear-gradient(180deg,_rgba(245,242,255,0.9),_rgba(245,242,255,0.35))]" />
      <div className="max-w-6xl mx-auto px-4 py-10 md:py-14">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-500">Parallel work</p>
            <h1 className="mt-2 text-4xl md:text-5xl font-black text-violet-950">{board.title}</h1>
            <p className="mt-3 max-w-2xl text-base md:text-lg text-violet-700">{board.subtitle}</p>
            {board.updated_at ? (
              <p className="mt-3 text-xs text-violet-400">
                Updated at <span className="font-mono">{board.updated_at}</span>
              </p>
            ) : null}
          </div>
          <div className="rounded-full border border-violet-200 bg-white px-4 py-2 text-sm font-medium text-violet-700 shadow-sm">
            Live board backed by <span className="font-mono text-violet-900">/Users/anvo/.codex/memories/freshlinen-agent-board.json</span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-8">
          {board.worktrees.map((worktree) => (
            <div key={worktree.branch} className="rounded-2xl border border-violet-200 bg-white/90 p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-violet-900">{worktree.agent}</h2>
                <StatusPill status={worktree.status} />
              </div>
              <p className="mt-3 text-sm text-violet-500">Branch</p>
              <p className="font-mono text-sm text-violet-800">{worktree.branch}</p>
              <p className="mt-3 text-sm text-violet-500">Worktree</p>
              <p className="break-all text-sm text-violet-800">{worktree.worktree}</p>
            </div>
          ))}
        </div>

        <div className="mt-2 text-sm text-violet-500">
          Agents update the shared board through <span className="font-mono text-violet-700">scripts/agent-board.py</span> with `claim`, `ready`, and `done`. The web page is read-only.
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard title="Active Tasks" items={board.active} />
          <SectionCard title="Backlog" items={board.backlog} />
        </div>

        <div className="mt-6">
          <SectionCard title="Done" items={board.done} />
        </div>
      </div>
    </div>
  );
}
