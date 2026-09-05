import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "InnoVibe Chat",
  description: "Internal communication tool for InnoVibe Mobility",
  viewport: "width=device-width, initial-scale=1",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
