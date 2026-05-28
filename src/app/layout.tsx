import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {

export const metadata: Metadata = {
  title: "TCP Fingerprint Alignment Downloader | WAF Bypass Engine",
  description:
    "Next-generation TCP/IP fingerprint alignment platform. Bypass Cloudflare, Akamai, Imperva & F5 WAF with uTLS JA3/JA4 spoofing, TCP/IP SYN tuning, and HTTP/2 stream manipulation.",
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
