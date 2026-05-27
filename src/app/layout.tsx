import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TCP Fingerprint Alignment Downloader",
  description:
    "Advanced TCP/IP fingerprint alignment tool for bypassing WAF detection with uTLS JA3/JA4 spoofing and HTTP/2 stream tuning.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#050507] text-[#e0e0e0] font-sans antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
