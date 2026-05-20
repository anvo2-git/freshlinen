"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Show, SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { useApp } from "@/lib/context";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/board", label: "Board" },
  { href: "/today", label: "Today" },
  { href: "/explore", label: "Explore" },
  { href: "/rag", label: "RAG" },
  { href: "/guide", label: "Guide" },
  { href: "/build", label: "Build" },
  { href: "/quiz", label: "Quiz" },
  { href: "/info", label: "Info" },
  { href: "/recommendations", label: "Recs" },
  { href: "/favorites", label: "Favorites", auth: true },
];

export function Nav() {
  const pathname = usePathname();
  const { state } = useApp();
  const { userId } = useAuth();
  const seedCount = state.seeds.length;

  return (
    <nav className="sticky top-0 z-50 bg-[#f5f2ff]/95 backdrop-blur-sm border-b border-violet-200">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <Image src="/logo.png" alt="The Common Nose" width={40} height={32} className="h-8 w-auto" />
          <span className="text-xl font-bold text-violet-900">The Common Nose</span>
        </Link>
        <div className="flex items-center gap-1">
          {NAV_ITEMS.filter((item) => !("auth" in item && item.auth) || userId).map(({ href, label }) => {
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-violet-700 text-white"
                    : "text-violet-600 hover:text-violet-900 hover:bg-violet-100"
                }`}
              >
                {label}
                {label === "Recs" && seedCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-violet-500 text-white text-[10px] font-medium">
                    {seedCount}
                  </span>
                )}
              </Link>
            );
          })}
          <div className="ml-2 flex items-center">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="px-3 py-1.5 rounded-md text-sm text-violet-600 hover:text-violet-900 hover:bg-violet-100 transition-colors">
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
