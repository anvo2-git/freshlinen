"use client";

import Link from "next/link";
import Image from "next/image";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";

export function Nav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-white/70 bg-[linear-gradient(90deg,rgba(255,245,230,0.84),rgba(255,255,255,0.72),rgba(240,233,255,0.76))] backdrop-blur-2xl">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <Link href="/" className="flex items-center gap-3 transition-transform hover:-translate-y-0.5">
          <span className="grid h-11 w-11 place-items-center rounded-[1.2rem] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(248,212,120,0.62),rgba(239,68,68,0.22))] shadow-[0_18px_35px_rgba(120,70,20,0.12)]">
            <Image src="/logo.png" alt="Fresh Linen" width={36} height={30} className="h-7 w-auto" />
          </span>
          <div className="hidden sm:block">
            <div className="text-[9px] font-bold uppercase tracking-[0.42em] text-amber-700">
              Chat-first fragrance salon
            </div>
            <div className="display-font text-2xl leading-none text-stone-950">Fresh Linen</div>
          </div>
        </Link>

        <div className="flex items-center gap-2 md:gap-3">
          <div className="hidden items-center rounded-full border border-amber-200 bg-[linear-gradient(135deg,rgba(255,251,240,0.98),rgba(255,225,179,0.62),rgba(255,255,255,0.9))] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.26em] text-stone-600 shadow-[0_10px_28px_rgba(77,51,26,0.08)] sm:flex">
            Perfume counter mode
          </div>

          <Link
            href="/library"
            className="inline-flex h-11 items-center gap-2 rounded-full border border-amber-200 bg-[linear-gradient(135deg,rgba(255,248,234,0.98),rgba(255,221,154,0.74),rgba(255,255,255,0.92))] px-4 text-sm font-semibold text-stone-800 shadow-[0_12px_28px_rgba(77,51,26,0.12)] transition-transform hover:-translate-y-0.5"
            aria-label="Library"
          >
            <span className="text-base text-amber-700">⌁</span>
            <span className="hidden sm:inline">Library</span>
          </Link>

          <div className="flex items-center">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="inline-flex h-11 items-center rounded-full border border-stone-900 bg-[linear-gradient(135deg,rgba(17,24,39,1),rgba(88,28,135,1),rgba(180,83,9,1))] px-4 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(0,0,0,0.18)] transition-transform hover:-translate-y-0.5 hover:brightness-110">
                  Sign in
                </button>
              </SignInButton>
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </div>
        </div>
      </div>
    </nav>
  );
}
