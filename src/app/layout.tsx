import type { Metadata } from "next";
import ClientSecurityGuards from "@/components/ClientSecurityGuards";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jiff — Strategy Assistant",
  description:
    "A premium RAG assistant for strategy learning over private knowledge bases. Ask complex questions, inspect sources, and trust the evidence.",
  keywords: ["RAG", "strategy", "knowledge base", "AI assistant", "Pinecone"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <ClientSecurityGuards />
        {children}
      </body>
    </html>
  );
}
