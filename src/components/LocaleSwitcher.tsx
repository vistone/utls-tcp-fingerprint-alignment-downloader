"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";

export default function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const switchLocale = (nextLocale: string) => {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length > 0 && (segments[0] === "en" || segments[0] === "zh")) {
      segments[0] = nextLocale;
      router.push("/" + segments.join("/"));
    } else {
      router.push("/" + nextLocale + pathname);
    }
  };

  return (
    <div className="flex items-center gap-1 bg-[#111116] border border-[#2d2d35] rounded px-1.5 py-1 font-mono text-[10px]">
      <button
        onClick={() => switchLocale("zh")}
        className={`px-1.5 py-0.5 rounded font-bold transition cursor-pointer ${
          locale === "zh" ? "bg-emerald-500/20 text-emerald-400" : "text-gray-500 hover:text-gray-300"
        }`}
      >
        中文
      </button>
      <span className="text-gray-600">|</span>
      <button
        onClick={() => switchLocale("en")}
        className={`px-1.5 py-0.5 rounded font-bold transition cursor-pointer ${
          locale === "en" ? "bg-emerald-500/20 text-emerald-400" : "text-gray-500 hover:text-gray-300"
        }`}
      >
        EN
      </button>
    </div>
  );
}
