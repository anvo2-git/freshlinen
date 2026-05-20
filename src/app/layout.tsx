import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ClientLayout } from "./client-layout";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Common Nose",
  description:
    "A chat-first perfume assistant that teaches taste, returns three ranked matches, and keeps your favorites in one library.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${plusJakarta.variable}`}>
      <body className="min-h-full flex flex-col font-sans bg-transparent">
        <ClerkProvider>
          <ClientLayout>{children}</ClientLayout>
        </ClerkProvider>
      </body>
    </html>
  );
}
