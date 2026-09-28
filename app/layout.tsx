import "./globals.css";
import type { Metadata, Viewport } from "next";
import PWARegister from "@/components/PWARegister";
export const metadata: Metadata = {
  title: "InnoVibe Office",
  description: "InnoVibe Mobility Internal Office Workspace",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#26648B",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900">
        <PWARegister />
        {children}
      </body>
    </html>
  );
}
