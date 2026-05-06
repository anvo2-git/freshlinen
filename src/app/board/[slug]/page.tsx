import Link from "next/link";
import { notFound } from "next/navigation";

import { findTask, findTaskCandidates, loadBoard, slugifyTask } from "@/lib/agent-board";

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

export default async function BoardTaskPage({
  params,
}: {
  params: { slug: string } | Promise<{ slug: string }>;
}) {
  const resolvedParams = await Promise.resolve(params);
  const slug = resolvedParams?.slug;

  if (!slug) {
    notFound();
  }

  const board = await loadBoard();
  const found = findTask(board, slug);

  if (!found) {
    const candidates = findTaskCandidates(board, slug);

    if (candidates.length === 0) {
      notFound();
    }

    const [fallback] = candidates;
    return (
      <div className="max-w-4xl mx-auto px-4 py-10 md:py-14">
        <div className="mb-6">
          <Link href="/board" className="text-sm font-medium text-violet-600 hover:underline">
            Back to board
          </Link>
        </div>

        <div className="rounded-3xl border border-amber-200 bg-amber-50/80 p-6 md:p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-600">Close match</p>
          <h1 className="mt-2 text-3xl md:text-4xl font-black text-amber-950">{fallback.item.task}</h1>
          <p className="mt-3 text-sm text-amber-800">
            The requested task slug did not match exactly. Showing the closest board entry instead.
          </p>
          <p className="mt-4 text-sm text-amber-700">
            Canonical slug: <span className="font-mono">{slugifyTask(fallback.item.task)}</span>
          </p>
          <div className="mt-6 rounded-2xl border border-amber-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-600">Notes</p>
            <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-slate-700">{fallback.item.notes}</p>
          </div>
        </div>
      </div>
    );
  }

  const { section, item } = found;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 md:py-14">
      <div className="mb-6">
        <Link href="/board" className="text-sm font-medium text-violet-600 hover:underline">
          Back to board
        </Link>
      </div>

      <div className="rounded-3xl border border-violet-200 bg-white/90 p-6 md:p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-500">Task Detail</p>
            <h1 className="mt-2 text-3xl md:text-4xl font-black text-violet-950">{item.task}</h1>
            <p className="mt-3 text-sm text-violet-500">
              Section: <span className="font-medium text-violet-700">{section}</span>
            </p>
          </div>
          <StatusPill status={item.status} />
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-500">Owner</p>
            <p className="mt-2 text-base font-medium text-violet-900">{item.owner}</p>
          </div>
          <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-500">Branch</p>
            <p className="mt-2 text-base font-mono text-violet-900">{item.branch || "None"}</p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-violet-100 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-500">Notes</p>
          <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-slate-700">{item.notes}</p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-violet-100 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-500">Commit</p>
            <p className="mt-3 font-mono text-sm text-slate-700">{item.commit || "Not set yet"}</p>
          </div>
          <div className="rounded-2xl border border-violet-100 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-500">Lifecycle</p>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              Agents claim work when they start, mark it ready when it is ready to push, and move it to done after it lands.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
