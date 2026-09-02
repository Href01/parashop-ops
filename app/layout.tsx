import type { Metadata } from "next";
import "./globals.css";
import "./modern-design-system.css";
import "./crypto-terminal.css";
// EN DERNIER, ET C'EST LE POINT : ce fichier redéfinit les jetons que les trois
// feuilles ci-dessus se contentent de lire. Importé avant elles, il serait
// écrasé et la refonte n'aurait aucun effet visible.
import "./design-tokens.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Shine Cosmetics - BOS",
  description: "Internal Business Operating System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
