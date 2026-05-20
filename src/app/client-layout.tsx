"use client";

import { AppProvider } from "@/lib/context";
import { FavoritesProvider } from "@/lib/favorites-context";
import { Nav } from "@/components/Nav";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <FavoritesProvider>
        <Nav />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-white/70 py-5 text-center text-[11px] uppercase tracking-[0.28em] text-stone-400">
          The Common Nose · built by Ian Vo
        </footer>
      </FavoritesProvider>
    </AppProvider>
  );
}
