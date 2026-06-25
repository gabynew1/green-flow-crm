import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Leaf,
  Users,
  CalendarCheck,
  TrendingUp,
  FileText,
  MessageSquareHeart,
  LayoutDashboard,
  Star,
  ArrowRight,
  Sprout,
  TreePine,
  Flower2,
  Menu,
  X,
  Mail,
  CloudRain,
  MessageCircle,
  Clock,
  Receipt,
  Smartphone,
  Calculator,
  Check,
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

/* ------------------------------------------------------------------ */
/*  Inline SVG doodles                                                 */
/* ------------------------------------------------------------------ */
const LeafDoodle = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 40 40" className={`inline-block ${className}`} fill="none">
    <path
      d="M10 30 C10 10, 30 5, 35 5 C35 5, 30 20, 15 30 Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="currentColor"
      fillOpacity="0.15"
    />
    <path d="M10 30 C18 22, 28 12, 35 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const FlowerDoodle = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 40 40" className={`inline-block ${className}`} fill="none">
    <circle cx="20" cy="20" r="4" fill="currentColor" fillOpacity="0.3" />
    {[0, 60, 120, 180, 240, 300].map((angle) => (
      <ellipse
        key={angle}
        cx="20"
        cy="10"
        rx="4"
        ry="7"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1"
        transform={`rotate(${angle} 20 20)`}
      />
    ))}
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Feature data                                                       */
/* ------------------------------------------------------------------ */
const featureDefs = [
  { key: "scheduling",  icon: CalendarCheck,    color: "bg-landing-sky text-sky-700",          tilt: "" },
  { key: "estimates",   icon: Calculator,       color: "bg-landing-mint text-emerald-700",     tilt: "" },
  { key: "compliance",  icon: Receipt,          color: "bg-landing-yellow/30 text-amber-700",  tilt: "" },
  { key: "mobile",      icon: Smartphone,       color: "bg-landing-lavender/40 text-violet-600", tilt: "" },
  { key: "crews",       icon: Users,            color: "bg-landing-coral/20 text-rose-600",    tilt: "" },
  { key: "dashboard",   icon: LayoutDashboard,  color: "bg-landing-mint text-emerald-700",     tilt: "" },
];

const problemDefs = [
  { key: "whatsapp",    icon: MessageCircle, color: "bg-landing-coral/20 text-rose-600" },
  { key: "weather",     icon: CloudRain,     color: "bg-landing-sky text-sky-700" },
  { key: "maintenance", icon: Clock,         color: "bg-landing-yellow/30 text-amber-700" },
  { key: "quotes",      icon: FileText,      color: "bg-landing-lavender/40 text-violet-600" },
];

const pricingPerks = ["noCard", "noLimit", "core", "optional"] as const;

const stepDefs = [
  { num: 1, key: "signup", icon: Sprout },
  { num: 2, key: "addCustomer", icon: Users },
  { num: 3, key: "grow", icon: TreePine },
];

const testimonialDefs = [
  { key: "jake", stars: 5, bg: "bg-landing-lavender/30" },
  { key: "maria", stars: 5, bg: "bg-landing-mint" },
  { key: "devon", stars: 5, bg: "bg-landing-sky/30" },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function LandingPage() {
  const navigate = useNavigate();
  const { t } = useTranslation("public");
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [heroEmail, setHeroEmail] = useState("");
  const [startFreeOpen, setStartFreeOpen] = useState(false);
  const [startFreeEmail, setStartFreeEmail] = useState("");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (id: string) => {
    setMobileMenu(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  /**
   * SECURITY: No email_exists check on the landing page.
   * Always route to /auth — the auth page handles the rest.
   */
  const handleGetGrowing = () => {
    const email = heroEmail.trim();
    if (!email) {
      toast.error(t("landing.hero.errorRequired"));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error(t("landing.hero.errorInvalid"));
      return;
    }
    navigate(`/auth?email=${encodeURIComponent(email)}&source=landing`);
  };

  const handleStartFreeSubmit = () => {
    const email = startFreeEmail.trim();
    if (!email) {
      toast.error(t("landing.hero.errorRequired"));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error(t("landing.hero.errorInvalid"));
      return;
    }
    setStartFreeOpen(false);
    navigate(`/auth?email=${encodeURIComponent(email)}&source=landing`);
  };

  const navItems: { id: string; key: "features" | "how" | "pricing" | "testimonials" }[] = [
    { id: "features", key: "features" },
    { id: "how", key: "how" },
    { id: "pricing", key: "pricing" },
    { id: "testimonials", key: "testimonials" },
  ];

  return (
    <div className="min-h-screen bg-background font-sans scroll-smooth overflow-x-hidden">
      {/* ===== NAVBAR ===== */}
      <nav
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled ? "bg-background/95 shadow-sm backdrop-blur" : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <button onClick={() => scrollTo("hero")} className="group flex items-center gap-2 text-xl font-bold text-primary">
            <Leaf className="h-7 w-7 transition-transform group-hover:animate-wiggle icon-hand-drawn text-primary" />
            <span>GreenGrass</span>
          </button>

          <div className="hidden items-center gap-6 md:flex">
            {navItems.map((s) => (
              <button key={s.id} onClick={() => scrollTo(s.id)} className="text-sm font-medium text-foreground/70 hover:text-primary transition-colors">
                {t(`landing.nav.${s.key}`)}
              </button>
            ))}
            <LanguageSwitcher />
            <Button variant="ghost" size="sm" onClick={() => navigate("/auth")}>
              {t("landing.nav.signIn")}
            </Button>
            <Button
              size="sm"
              className="rounded-full bg-landing-coral hover:bg-landing-coral/90 text-white shadow-md"
              onClick={() => setStartFreeOpen(true)}
            >
              {t("landing.nav.startFree")}
            </Button>
          </div>

          <div className="md:hidden flex items-center gap-1">
            <LanguageSwitcher />
            <button className="text-foreground" onClick={() => setMobileMenu(!mobileMenu)}>
              {mobileMenu ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {mobileMenu && (
          <div className="md:hidden bg-background/95 backdrop-blur border-t border-border px-4 pb-4 space-y-2">
            {navItems.map((s) => (
              <button key={s.id} onClick={() => scrollTo(s.id)} className="block w-full text-left py-2 text-sm font-medium text-foreground/70">
                {t(`landing.nav.${s.key}`)}
              </button>
            ))}
            <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => navigate("/auth")}>{t("landing.nav.signIn")}</Button>
            <Button
              size="sm"
              className="w-full rounded-full bg-landing-coral text-white"
              onClick={() => { setMobileMenu(false); setStartFreeOpen(true); }}
            >
              {t("landing.nav.startFree")}
            </Button>
          </div>
        )}
      </nav>

      {/* ===== START FREE DIALOG ===== */}
      <Dialog open={startFreeOpen} onOpenChange={setStartFreeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Sprout className="h-6 w-6 text-primary icon-hand-drawn" />
              {t("landing.startFreeDialog.title")}
            </DialogTitle>
            <DialogDescription>
              {t("landing.startFreeDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleStartFreeSubmit();
            }}
            className="space-y-4 pt-2"
          >
            <div className="space-y-2">
              <Label htmlFor="start-free-email">{t("landing.startFreeDialog.emailLabel")}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="start-free-email"
                  type="email"
                  placeholder={t("landing.startFreeDialog.emailPlaceholder")}
                  value={startFreeEmail}
                  onChange={(e) => setStartFreeEmail(e.target.value)}
                  className="pl-10 h-11"
                  autoFocus
                  required
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full h-11 rounded-full bg-landing-coral hover:bg-landing-coral/90 text-white font-semibold"
              disabled={false}
            >
              {t("landing.startFreeDialog.submit")}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              {t("landing.startFreeDialog.disclaimer")}
            </p>
          </form>
        </DialogContent>
      </Dialog>

      {/* ===== HERO ===== */}
      <section id="hero" className="relative pt-28 pb-20 sm:pt-36 sm:pb-28 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] select-none" aria-hidden>
          <LeafDoodle className="absolute top-16 left-[10%] w-16 h-16 text-primary rotate-12" />
          <FlowerDoodle className="absolute top-32 right-[15%] w-12 h-12 text-landing-coral" />
          <LeafDoodle className="absolute bottom-20 left-[60%] w-10 h-10 text-primary -rotate-45" />
          <FlowerDoodle className="absolute bottom-10 left-[20%] w-14 h-14 text-landing-yellow" />
        </div>

        <div className="pointer-events-none absolute inset-0 select-none" aria-hidden>
          <Leaf className="absolute top-24 right-[25%] w-6 h-6 text-primary/20 animate-float-slow" />
          <Flower2 className="absolute top-40 left-[12%] w-5 h-5 text-landing-coral/20 animate-float-med" />
          <Sprout className="absolute bottom-32 right-[10%] w-5 h-5 text-primary/15 animate-float-slow" />
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 text-center">
          <span className="inline-block mb-4 rounded-full bg-landing-yellow/30 px-4 py-1.5 text-sm font-semibold text-amber-800">
            {t("landing.hero.badge")}
          </span>
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-6xl leading-[1.1]">
            {t("landing.hero.titlePrefix")}{" "}
            <span className="text-primary relative">
              {t("landing.hero.titleHighlight")}
              <svg className="absolute -bottom-2 left-0 w-full h-3 text-landing-coral/50" viewBox="0 0 200 12" preserveAspectRatio="none">
                <path d="M2 8 Q50 2 100 7 T198 5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </span>
            .
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            {t("landing.hero.subtitle")}
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleGetGrowing();
            }}
            className="mx-auto mt-10 flex max-w-md flex-col gap-3 sm:flex-row"
          >
            <Input
              placeholder={t("landing.hero.emailPlaceholder")}
              type="email"
              value={heroEmail}
              onChange={(e) => setHeroEmail(e.target.value)}
              className="h-12 rounded-full border-2 border-border bg-card px-5 text-base shadow-sm focus-visible:ring-primary"
            />
            <Button
              type="submit"
              size="lg"
              className="h-12 rounded-full bg-landing-coral hover:bg-landing-coral/90 text-white font-semibold shadow-lg px-8 whitespace-nowrap"
              disabled={false}
            >
              {t("landing.hero.cta")}
            </Button>
          </form>
        </div>
      </section>

      {/* ===== SOCIAL PROOF ===== */}
      <section className="bg-landing-yellow/20 py-5">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <p className="text-sm font-semibold text-amber-800">
            {t("landing.social.trustedBy")}{" "}
            <span className="relative inline-block font-extrabold text-foreground">
              500+
              <span className="absolute -bottom-0.5 left-0 h-[3px] w-full rounded-full bg-landing-coral/60" />
            </span>{" "}
            {t("landing.social.trustedSuffix")}
          </p>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section id="features" className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-extrabold text-foreground sm:text-4xl">
              {t("landing.features.title")}{" "}
              <span className="text-primary">{t("landing.features.titleHighlight")}</span>
            </h2>
            <p className="mt-3 text-muted-foreground max-w-lg mx-auto">
              {t("landing.features.subtitle")}
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featureDefs.map((f) => {
              const Icon = f.icon;
              return (
                <Card
                  key={f.key}
                  className={`group relative overflow-hidden border-0 p-6 transition-all duration-300 hover:shadow-xl hover:rotate-0 ${f.tilt} cursor-default`}
                >
                  <div className={`mb-4 inline-flex h-14 w-14 items-center justify-center rounded-blob ${f.color}`}>
                    <Icon className="h-7 w-7 icon-hand-drawn" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground">{t(`landing.features.items.${f.key}.title`)}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t(`landing.features.items.${f.key}.desc`)}</p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="how" className="py-20 sm:py-28 bg-secondary/40">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-extrabold text-foreground sm:text-4xl mb-14">
            {t("landing.how.title")} <span className="text-primary">{t("landing.how.titleHighlight")}</span> 🍃
          </h2>

          <div className="grid gap-10 sm:grid-cols-3 relative">
            <div className="hidden sm:block absolute top-10 left-[20%] right-[20%] border-t-2 border-dashed border-primary/30" />

            {stepDefs.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.num} className="relative text-center">
                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 ring-4 ring-background relative z-10">
                    <span className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-landing-coral text-xs font-bold text-white shadow">
                      {s.num}
                    </span>
                    <Icon className="h-9 w-9 icon-hand-drawn text-primary" />
                  </div>
                  <h3 className="font-bold text-foreground text-lg">{t(`landing.how.steps.${s.key}.label`)}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t(`landing.how.steps.${s.key}.desc`)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section id="testimonials" className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-extrabold text-foreground sm:text-4xl mb-14">
            {t("landing.testimonials.title")} <span className="text-primary">{t("landing.testimonials.titleHighlight")}</span> {t("landing.testimonials.titleSuffix")}
          </h2>

          <div className="grid gap-6 sm:grid-cols-3">
            {testimonialDefs.map((item) => (
              <Card key={item.key} className={`border-0 p-6 ${item.bg} transition-transform duration-300 hover:-translate-y-1`}>
                <span className="text-5xl leading-none text-foreground/10 font-serif">"</span>
                <p className="mt-2 text-sm text-foreground/80 italic">{t(`landing.testimonials.items.${item.key}.quote`)}</p>
                <div className="mt-4 flex items-center gap-1">
                  {Array.from({ length: item.stars }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-landing-yellow text-landing-yellow" />
                  ))}
                </div>
                <div className="mt-3">
                  <p className="font-bold text-foreground text-sm">{t(`landing.testimonials.items.${item.key}.name`)}</p>
                  <p className="text-xs text-muted-foreground">{t(`landing.testimonials.items.${item.key}.role`)}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA BANNER ===== */}
      <section className="relative overflow-hidden bg-landing-coral py-16 sm:py-20">
        <div className="pointer-events-none absolute inset-0 opacity-10 select-none" aria-hidden>
          <LeafDoodle className="absolute top-4 left-[8%] w-20 h-20 text-white rotate-45" />
          <FlowerDoodle className="absolute bottom-4 right-[10%] w-16 h-16 text-white -rotate-12" />
          <LeafDoodle className="absolute top-8 right-[40%] w-12 h-12 text-white" />
        </div>

        <div className="relative mx-auto max-w-3xl px-4 text-center text-white">
          <h2 className="text-3xl font-extrabold sm:text-4xl">{t("landing.cta.title")}</h2>
          <p className="mt-3 text-lg text-white/80">{t("landing.cta.subtitle")}</p>
          <Button
            size="lg"
            className="mt-8 h-14 rounded-full bg-white text-landing-coral font-bold text-lg px-10 shadow-xl hover:bg-white/90"
            onClick={() => navigate("/onboard?source=landing")}
          >
            {t("landing.cta.button")} <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="bg-sidebar py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-2 text-sidebar-foreground font-bold text-lg">
              <Leaf className="h-6 w-6 text-sidebar-primary icon-hand-drawn" />
              GreenGrass
            </div>
            <div className="flex gap-6 text-sm text-sidebar-foreground/60">
              <button onClick={() => scrollTo("features")} className="hover:text-sidebar-primary transition-colors">{t("landing.nav.features")}</button>
              <button onClick={() => scrollTo("how")} className="hover:text-sidebar-primary transition-colors">{t("landing.nav.how")}</button>
              <button onClick={() => scrollTo("testimonials")} className="hover:text-sidebar-primary transition-colors">{t("landing.nav.testimonials")}</button>
              <button onClick={() => navigate("/auth")} className="hover:text-sidebar-primary transition-colors">{t("landing.nav.signIn")}</button>
            </div>
          </div>
          <div className="mt-8 border-t border-sidebar-border pt-6 text-center text-xs text-sidebar-foreground/40">
            © {new Date().getFullYear()} GreenGrass CRM. {t("landing.footer.tagline")}
          </div>
        </div>
      </footer>
    </div>
  );
}
