"use client";

import Link from "next/link";
import Image from "next/image";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";

export function Nav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-white/70 bg-[rgba(251,247,240,0.78)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
          <Image src="/logo.png" alt="The Common Nose" width={44} height={36} className="h-8 w-auto" />
          <div className="hidden sm:block">
            <div className="text-[10px] font-semibold uppercase tracking-[0.35em] text-amber-600">
              Chat-first fragrance
            </div>
            <div className="text-sm font-semibold text-stone-950">The Common Nose</div>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/library"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-700 transition-colors hover:border-stone-400 hover:bg-stone-50"
            aria-label="Library"
          >
            <span className="text-base">⌁</span>
            <span className="hidden sm:inline">Library</span>
          </Link>

          <div className="flex items-center">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="inline-flex h-10 items-center rounded-full border border-transparent px-3 text-sm font-semibold text-stone-600 transition-colors hover:bg-white hover:text-stone-950">
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
