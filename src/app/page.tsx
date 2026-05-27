"use client";

import { useEffect, useState } from "react";
import {
  Shield, Zap, Globe, Cpu, Fence, Brain, Layers,
  ArrowRight, Check, Terminal, Network, Lock, Compass,
  Sparkles, ChevronDown, Menu, X,
} from "lucide-react";
import { en, zh, type MarketingContent } from "@/data/marketing";

const ICONS = [Lock, Cpu, Layers, Fence, Globe, Brain] as const;

const FEATURE_GRADIENTS = [
  "from-emerald-500 to-cyan-500",
  "from-purple-500 to-indigo-600",
  "from-teal-400 to-emerald-500",
  "from-amber-500 to-orange-600",
  "from-sky-400 to-blue-600",
  "from-rose-400 to-pink-600",
];

const LAYER_COLORS = [
  "from-rose-500 to-pink-500",
  "from-orange-500 to-amber-500",
  "from-amber-500 to-yellow-500",
  "from-yellow-500 to-lime-500",
  "from-lime-500 to-emerald-500",
  "from-emerald-500 to-teal-500",
  "from-teal-500 to-cyan-500",
];

const CDN_COLORS: Record<string, string> = {
  Cloudflare: "text-orange-400",
  Akamai: "text-sky-400",
  Imperva: "text-purple-400",
  "F5/AWS": "text-teal-400",
};

export default function HomePage() {
  const [scrolled, setScrolled] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [lang, setLang] = useState<"en" | "zh">("en");

  const content: MarketingContent = lang === "en" ? en : zh;

  useEffect(() => {
    const saved = localStorage.getItem("marketing-lang") as "en" | "zh" | null;
    if (saved) setLang(saved);
  }, []);

  const switchLang = (l: "en" | "zh") => {
    setLang(l);
    localStorage.setItem("marketing-lang", l);
  };

  useEffect(() => {
    const onScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      setScrolled(Math.min(window.scrollY / maxScroll, 1));
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="relative">
      <div
        className="fixed top-0 left-0 h-[2px] bg-gradient-to-r from-emerald-400 via-cyan-400 to-purple-500 z-[100] transition-all duration-150"
        style={{ width: `${scrolled * 100}%` }}
      />

      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#030305]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center">
              <span className="text-black font-bold text-[10px]">T</span>
            </div>
            <span className="font-mono text-sm font-bold text-white tracking-tight">
              TCP<span className="text-emerald-400">/IP</span> Aligner
            </span>
          </div>

          <div className="hidden md:flex items-center gap-8 text-sm font-mono">
            <a href="#features" className="text-gray-400 hover:text-white transition">{content.nav.features}</a>
            <a href="#tech" className="text-gray-400 hover:text-white transition">{content.nav.tech}</a>
            <a href="#pricing" className="text-gray-400 hover:text-white transition">{content.nav.pricing}</a>
            <a href="#faq" className="text-gray-400 hover:text-white transition">{content.nav.faq}</a>
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1">
              <button
                onClick={() => switchLang("zh")}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${lang === "zh" ? "bg-emerald-500/20 text-emerald-400" : "text-gray-500 hover:text-gray-300"}`}
              >
                中文
              </button>
              <span className="text-gray-600 text-[10px]">|</span>
              <button
                onClick={() => switchLang("en")}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${lang === "en" ? "bg-emerald-500/20 text-emerald-400" : "text-gray-500 hover:text-gray-300"}`}
              >
                EN
              </button>
            </div>
            <a
              href={`/${lang}`}
              className="px-5 py-2 bg-white/5 border border-white/10 rounded-lg text-white font-bold hover:bg-white/10 transition text-xs"
            >
              {content.nav.launchApp}
            </a>
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-gray-400"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/5 bg-[#030305]/95 backdrop-blur-xl">
            <div className="px-6 py-4 space-y-4">
              {[content.nav.features, content.nav.tech, content.nav.pricing, content.nav.faq].map((item, i) => {
                const anchors = ["features", "tech", "pricing", "faq"];
                return (
                  <a
                    key={i}
                    href={`#${anchors[i]}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="block text-gray-400 hover:text-white font-mono text-sm transition"
                  >
                    {item}
                  </a>
                );
              })}
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => { switchLang("zh"); setMobileMenuOpen(false); }}
                  className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer ${lang === "zh" ? "bg-emerald-500/20 text-emerald-400" : "text-gray-500 border border-white/10"}`}
                >
                  中文
                </button>
                <button
                  onClick={() => { switchLang("en"); setMobileMenuOpen(false); }}
                  className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer ${lang === "en" ? "bg-emerald-500/20 text-emerald-400" : "text-gray-500 border border-white/10"}`}
                >
                  EN
                </button>
              </div>
              <a
                href={`/${lang}`}
                className="block text-center px-5 py-2 bg-white/5 border border-white/10 rounded-lg text-white font-bold text-sm"
              >
                {content.nav.launchApp}
              </a>
            </div>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.08)_0%,rgba(6,182,212,0.04)_40%,transparent_70%)]" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-[120px]" />

        <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-xs font-mono mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {content.hero.badge}
          </div>

          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[0.95] mb-6">
            <span className="text-white">{content.hero.headline[0]}</span>
            <br />
            <span className={`bg-gradient-to-r ${content.hero.headlineGradient} bg-clip-text text-transparent`}>
              {content.hero.headline[1]}
            </span>
            <br />
            <span className="text-white/50">{content.hero.headline[2]}</span>
          </h1>

          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed mb-10 font-light">
            {content.hero.subtitle[0]} <strong className="text-white">{content.hero.subtitle[1]}</strong>,{" "}
            <strong className="text-white">{content.hero.subtitle[2]}</strong>,{" "}
            <strong className="text-white">{content.hero.subtitle[3]}</strong>,{" "}
            {content.hero.subtitle[4]} <strong className="text-white">{content.hero.subtitle[5]}</strong>{" "}
            {content.hero.subtitle[6]}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={`/${lang}`}
              className="group px-8 py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-bold rounded-xl text-sm tracking-wider hover:shadow-[0_0_40px_rgba(16,185,129,0.3)] transition-all duration-300 flex items-center gap-2"
            >
              {content.hero.cta}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition" />
            </a>
            <a
              href="#features"
              className="px-8 py-4 border border-white/10 text-white rounded-xl text-sm font-mono hover:bg-white/5 transition"
            >
              {content.hero.ctaSecondary}
            </a>
          </div>

          <div className="mt-20 relative overflow-hidden">
            <div className="flex animate-marquee gap-8 whitespace-nowrap">
              {[...content.scrollerItems, ...content.scrollerItems].map((item, i) => (
                <span key={i} className="inline-flex items-center gap-2 text-xs font-mono text-gray-600">
                  <span className="w-1 h-1 rounded-full bg-emerald-400/60" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-8 animate-bounce-slow">
            <ChevronDown className="w-5 h-5 text-gray-600 mx-auto" />
          </div>
        </div>
      </section>

      {/* METRICS */}
      <section className="relative border-t border-white/5 bg-[#050508]">
        <div className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-3 md:grid-cols-6 gap-8">
          {content.metrics.map((m, i) => (
            <div key={i} className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-white font-mono tracking-tight">
                {m.value}<span className="text-sm text-gray-500 font-normal">{m.suffix || ""}</span>
              </div>
              <div className="text-[10px] font-mono text-gray-500 uppercase tracking-wider mt-1">{m.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="relative py-32 border-t border-white/5">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-32 bg-gradient-to-b from-emerald-400/30 to-transparent" />
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <span className="text-[10px] font-mono text-emerald-400 tracking-[0.3em] uppercase">{content.features.section}</span>
            <h2 className="text-3xl md:text-5xl font-bold text-white mt-4 leading-tight">
              {content.features.title[0]}<br />
              <span className={`bg-gradient-to-r ${content.features.titleGradient} bg-clip-text text-transparent`}>{content.features.title[1]}</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/5 rounded-2xl overflow-hidden">
            {content.features.items.map((f, i) => {
              const Icon = ICONS[i];
              return (
                <div key={i} className="bg-[#050508] p-8 hover:bg-[#08080e] transition group relative overflow-hidden">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${FEATURE_GRADIENTS[i]} flex items-center justify-center mb-5`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-3">{f.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CDN */}
      <section className="relative py-24 border-t border-white/5 bg-[#050508]">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <span className="text-[10px] font-mono text-purple-400 tracking-[0.3em] uppercase">{content.cdn.section}</span>
          <h2 className="text-2xl md:text-4xl font-bold text-white mt-4 mb-12">
            {content.cdn.title[0]} <span className={`bg-gradient-to-r ${content.cdn.titleGradient} bg-clip-text text-transparent`}>{content.cdn.title[1]}</span>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {content.cdn.items.map((cdn, i) => (
              <div key={i} className="p-6 rounded-xl border border-white/5 bg-[#030305] hover:border-white/10 transition">
                <div className={`text-2xl font-bold font-mono ${CDN_COLORS[cdn.name] || "text-gray-300"}`}>{cdn.name}</div>
                <div className="text-[10px] text-gray-600 font-mono mt-1">{content.cdn.badge}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TECH */}
      <section id="tech" className="relative py-32 border-t border-white/5 overflow-hidden">
        <div className="absolute top-96 left-0 w-64 h-64 bg-cyan-500/3 rounded-full blur-[100px]" />
        <div className="absolute bottom-96 right-0 w-64 h-64 bg-purple-500/3 rounded-full blur-[100px]" />
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <span className="text-[10px] font-mono text-cyan-400 tracking-[0.3em] uppercase">{content.tech.section}</span>
            <h2 className="text-3xl md:text-5xl font-bold text-white mt-4 leading-tight">
              {content.tech.title[0]}<br />
              <span className={`bg-gradient-to-r ${content.tech.titleGradient} bg-clip-text text-transparent`}>{content.tech.title[1]}</span>
            </h2>
          </div>
          <div className="space-y-6">
            {content.tech.items.map((item, i) => {
              const icons = [Terminal, Shield, Compass];
              const Icon = icons[i];
              return (
                <div key={i} className="group p-8 rounded-2xl border border-white/5 bg-[#050508] hover:bg-[#08080e] hover:border-emerald-500/20 transition-all duration-300 flex items-start gap-6">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition">
                    <Icon className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                    <p className="text-sm text-gray-400 leading-relaxed max-w-2xl">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* LAYERS */}
      <section className="relative py-32 border-t border-white/5 bg-[#050508]">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <span className="text-[10px] font-mono text-amber-400 tracking-[0.3em] uppercase">{content.layers.section}</span>
          <h2 className="text-2xl md:text-4xl font-bold text-white mt-4 mb-16">
            {content.layers.title[0]} <span className={`bg-gradient-to-r ${content.layers.titleGradient} bg-clip-text text-transparent`}>{content.layers.title[1]}</span>
          </h2>
          <div className="grid gap-3 max-w-2xl mx-auto">
            {content.layers.items.map((row, i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-white/5 bg-[#030305] group hover:bg-[#08080e] transition">
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${LAYER_COLORS[i]} flex items-center justify-center text-black font-bold text-xs shrink-0`}>
                  {row.layer}
                </div>
                <div className="text-left flex-1">
                  <div className="text-sm font-bold text-white">{row.name}</div>
                  <div className="text-[10px] text-gray-500 font-mono">{row.detail}</div>
                </div>
                <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-br ${LAYER_COLORS[i]}`} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="relative py-32 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="text-[10px] font-mono text-emerald-400 tracking-[0.3em] uppercase">{content.pricing.section}</span>
            <h2 className="text-3xl md:text-5xl font-bold text-white mt-4">{content.pricing.title}</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {content.pricing.tiers.map((tier, i) => (
              <div
                key={i}
                className={`relative rounded-2xl p-8 border transition-all duration-300 ${
                  i === 1
                    ? "border-emerald-500/30 bg-[#050508] shadow-[0_0_40px_rgba(16,185,129,0.08)]"
                    : "border-white/5 bg-[#050508] hover:border-white/10"
                }`}
              >
                {i === 1 && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black text-[9px] font-bold rounded-full font-mono tracking-wider">
                    {content.pricing.popular}
                  </div>
                )}
                <div className="text-lg font-bold text-white mb-1">{tier.name}</div>
                <div className="text-gray-400 text-sm mb-6">{tier.desc}</div>
                <div className="mb-8">
                  <span className="text-4xl font-bold text-white">{tier.price}</span>
                  {tier.period && <span className="text-gray-500 text-sm font-mono ml-1">{tier.period}</span>}
                </div>
                <ul className="space-y-3 mb-8">
                  {tier.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-3 text-sm text-gray-400">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href={`/${lang}`}
                  className={`block text-center py-3 rounded-xl text-sm font-bold font-mono transition ${
                    i === 1
                      ? "bg-gradient-to-r from-emerald-500 to-cyan-500 text-black hover:shadow-[0_0_30px_rgba(16,185,129,0.2)]"
                      : "bg-white/5 border border-white/10 text-white hover:bg-white/10"
                  }`}
                >
                  {tier.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="relative py-32 border-t border-white/5 bg-[#050508]">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="text-[10px] font-mono text-purple-400 tracking-[0.3em] uppercase">{content.faq.section}</span>
            <h2 className="text-3xl md:text-4xl font-bold text-white mt-4">{content.faq.title}</h2>
          </div>
          <div className="space-y-3">
            {content.faq.items.map((faq, i) => (
              <div key={i} className="border border-white/5 rounded-xl overflow-hidden">
                <button
                  onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-white/[0.02] transition"
                >
                  <span className="text-sm font-mono font-bold text-white">{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition ${activeFaq === i ? "rotate-180" : ""}`} />
                </button>
                {activeFaq === i && (
                  <div className="px-5 pb-5 text-sm text-gray-400 leading-relaxed border-t border-white/5 pt-4">{faq.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-32 border-t border-white/5 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.08)_0%,transparent_70%)]" />
        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 leading-tight">
            {content.cta.title[0]}<br />
            <span className={`bg-gradient-to-r ${content.cta.titleGradient} bg-clip-text text-transparent`}>{content.cta.title[1]}</span>
          </h2>
          <p className="text-gray-400 text-lg mb-10 max-w-xl mx-auto">{content.cta.subtitle}</p>
          <a
            href={`/${lang}`}
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-bold rounded-xl text-sm tracking-wider hover:shadow-[0_0_40px_rgba(16,185,129,0.3)] transition-all duration-300"
          >
            {content.cta.button}
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center">
              <span className="text-black font-bold text-[7px]">T</span>
            </div>
            <span className="font-mono text-xs text-gray-500">{content.footer.tagline}</span>
          </div>
          <div className="font-mono text-[10px] text-gray-700">{content.footer.license}</div>
          <div className="flex items-center gap-4">
            {content.footer.links.map((link, i) => (
              <a key={i} href={link.href} className="text-[10px] font-mono text-gray-600 hover:text-gray-400 transition">{link.label}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
