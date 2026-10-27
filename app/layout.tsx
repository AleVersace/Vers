import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./interface.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const description =
  "Vers è il tavolo virtuale per le tue campagne di gioco di ruolo, con mappe, scene, token, nebbia di guerra, iniziativa, macro e tiri condivisi.";

const title = "Vers - Il tavolo virtuale per le tue avventure";

export const metadata: Metadata = {
  title: {
    default: title,
    template: "%s - Vers",
  },
  description,
  openGraph: {
    type: "website",
    locale: "it_IT",
    siteName: "Vers",
    title,
    description,
  },
  twitter: {
    card: "summary",
    title,
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
