import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

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
const features = [
  {
    icon: Users,
    title: "Customer Management",
    desc: "Keep all your clients, properties & notes in one cozy place.",
    color: "bg-landing-mint text-emerald-700",
    tilt: "",
  },
  {
    icon: CalendarCheck,
    title: "Smart Scheduling",
    desc: "Drag, drop & done — crews always know where to go.",
    color: "bg-landing-sky text-sky-700",
    tilt: "",
  },
  {
    icon: TrendingUp,
    title: "Sales Pipeline",
    desc: "From inspection to signed contract — watch deals bloom.",
    color: "bg-landing-coral/20 text-rose-600",
    tilt: "",
  },
  {
    icon: FileText,
    title: "Invoicing & Offers",
    desc: "Professional quotes in minutes, payments on time.",
    color: "bg-landing-yellow/30 text-amber-700",
    tilt: "",
  },
  {
    icon: MessageSquareHeart,
    title: "Feedback Loop",
    desc: "5-star reviews start with happy homeowners.",
    color: "bg-landing-lavender/40 text-violet-600",
    tilt: "",
  },
  {
    icon: LayoutDashboard,
    title: "Team Dashboard",
    desc: "Real-time view of every crew, every job, every dollar.",
    color: "bg-landing-mint text-emerald-700",
    tilt: "",
  },
];

const steps = [
  { num: 1, icon: Sprout, label: "Sign Up", desc: "Create your free account in 30 seconds." },
  { num: 2, icon: Users, label: "Add Your First Customer", desc: "Import or type — we make it easy." },
  { num: 3, icon: TreePine, label: "Watch It Grow", desc: "Schedule, invoice & delight customers." },
];

const testimonials = [
  {
    name: "Jake M.",
    role: "Owner, FreshCut Lawns",
    quote: "GreenGrass replaced three apps for us. Our crew loves how simple scheduling is!",
    stars: 5,
    bg: "bg-landing-lavender/30",
  },
  {
    name: "Maria S.",
    role: "Ops Manager, EverGreen Pro",
    quote: "We doubled our client base in 6 months. The pipeline view is *chef's kiss*.",
    stars: 5,
    bg: "bg-landing-mint",
  },
  {
    name: "Devon R.",
    role: "Solo Landscaper",
    quote: "Finally, a CRM that doesn't feel like homework. It's actually fun to use!",
    stars: 5,
    bg: "bg-landing-sky/30",
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [heroEmail, setHeroEmail] = useState("");
  const [heroLoading, setHeroLoading] = useState(false);
  const [startFreeOpen, setStartFreeOpen] = useState(false);
  const [startFreeEmail, setStartFreeEmail] = useState("");
  const [startFreeLoading, setStartFreeLoading] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (id: string) => {
    setMobileMenu(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const handleGetGrowing = async () => {
    const email = heroEmail.trim();
    if (!email) {
      toast.error("Please enter your email address");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }
    setHeroLoading(true);
    try {
      const { data: exists } = await supabase.rpc("email_exists", { _email: email });
      if (exists) {
        navigate(`/auth?email=${encodeURIComponent(email)}&tab=signin`);
      } else {
        navigate(`/onboard?email=${encodeURIComponent(email)}&source=landing`);
      }
    } finally {
      setHeroLoading(false);
    }
  };

  const handleStartFreeSubmit = async () => {
    const email = startFreeEmail.trim();
    if (!email) {
      toast.error("Please enter your email address");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }
    setStartFreeLoading(true);
    try {
      const { data: exists } = await supabase.rpc("email_exists", { _email: email });
      setStartFreeOpen(false);
      if (exists) {
        navigate(`/auth?email=${encodeURIComponent(email)}&tab=signin`);
      } else {
        navigate(`/onboard?email=${encodeURIComponent(email)}&source=landing`);
      }
    } finally {
      setStartFreeLoading(false);
    }
  };

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
            {["features", "how", "testimonials"].map((s) => (
              <button key={s} onClick={() => scrollTo(s)} className="text-sm font-medium capitalize text-foreground/70 hover:text-primary transition-colors">
                {s === "how" ? "How It Works" : s}
              </button>
            ))}
            <Button variant="ghost" size="sm" onClick={() => navigate("/auth")}>
              Sign In
            </Button>
            <Button
              size="sm"
              className="rounded-full bg-landing-coral hover:bg-landing-coral/90 text-white shadow-md"
              onClick={() => setStartFreeOpen(true)}
            >
              Start Free
            </Button>
          </div>

          <button className="md:hidden text-foreground" onClick={() => setMobileMenu(!mobileMenu)}>
            {mobileMenu ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {mobileMenu && (
          <div className="md:hidden bg-background/95 backdrop-blur border-t border-border px-4 pb-4 space-y-2">
            {["features", "how", "testimonials"].map((s) => (
              <button key={s} onClick={() => scrollTo(s)} className="block w-full text-left py-2 text-sm font-medium capitalize text-foreground/70">
                {s === "how" ? "How It Works" : s}
              </button>
            ))}
            <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => navigate("/auth")}>Sign In</Button>
            <Button
              size="sm"
              className="w-full rounded-full bg-landing-coral text-white"
              onClick={() => { setMobileMenu(false); setStartFreeOpen(true); }}
            >
              Start Free
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
              Start Growing Your Business
            </DialogTitle>
            <DialogDescription>
              Enter your email to create your free provider account.
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
              <Label htmlFor="start-free-email">Work Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="start-free-email"
                  type="email"
                  placeholder="you@yourbusiness.com"
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
              disabled={startFreeLoading}
            >
              {startFreeLoading ? "Checking…" : "Get Started Free 🌱"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              No credit card required • Free forever for solo operators
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
            🌱 Free to get started
          </span>
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-6xl leading-[1.1]">
            Your Lawn Care Business,{" "}
            <span className="text-primary relative">
              Blooming
              <svg className="absolute -bottom-2 left-0 w-full h-3 text-landing-coral/50" viewBox="0 0 200 12" preserveAspectRatio="none">
                <path d="M2 8 Q50 2 100 7 T198 5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </span>
            .
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            The CRM that grows with you — schedule jobs, delight customers, get paid. All in one sunny place.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleGetGrowing();
            }}
            className="mx-auto mt-10 flex max-w-md flex-col gap-3 sm:flex-row"
          >
            <Input
              placeholder="Enter your email"
              type="email"
              value={heroEmail}
              onChange={(e) => setHeroEmail(e.target.value)}
              className="h-12 rounded-full border-2 border-border bg-card px-5 text-base shadow-sm focus-visible:ring-primary"
            />
            <Button
              type="submit"
              size="lg"
              className="h-12 rounded-full bg-landing-coral hover:bg-landing-coral/90 text-white font-semibold shadow-lg px-8 whitespace-nowrap"
              disabled={heroLoading}
            >
              {heroLoading ? "Checking…" : "Get Growing 🌱"}
            </Button>
          </form>
        </div>
      </section>

      {/* ===== SOCIAL PROOF ===== */}
      <section className="bg-landing-yellow/20 py-5">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <p className="text-sm font-semibold text-amber-800">
            Trusted by{" "}
            <span className="relative inline-block font-extrabold text-foreground">
              500+
              <span className="absolute -bottom-0.5 left-0 h-[3px] w-full rounded-full bg-landing-coral/60" />
            </span>{" "}
            lawn care pros across the country 🏡
          </p>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section id="features" className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-extrabold text-foreground sm:text-4xl">
              Everything you need to{" "}
              <span className="text-primary">grow</span>
            </h2>
            <p className="mt-3 text-muted-foreground max-w-lg mx-auto">
              From first call to five-star review — GreenGrass handles the heavy lifting.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <Card
                  key={f.title}
                  className={`group relative overflow-hidden border-0 p-6 transition-all duration-300 hover:shadow-xl hover:rotate-0 ${f.tilt} cursor-default`}
                >
                  <div className={`mb-4 inline-flex h-14 w-14 items-center justify-center rounded-blob ${f.color}`}>
                    <Icon className="h-7 w-7 icon-hand-drawn" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
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
            Getting started is a <span className="text-primary">breeze</span> 🍃
          </h2>

          <div className="grid gap-10 sm:grid-cols-3 relative">
            <div className="hidden sm:block absolute top-10 left-[20%] right-[20%] border-t-2 border-dashed border-primary/30" />

            {steps.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.num} className="relative text-center">
                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 ring-4 ring-background relative z-10">
                    <span className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-landing-coral text-xs font-bold text-white shadow">
                      {s.num}
                    </span>
                    <Icon className="h-9 w-9 icon-hand-drawn text-primary" />
                  </div>
                  <h3 className="font-bold text-foreground text-lg">{s.label}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
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
            Lawn pros <span className="text-primary">love</span> us 💚
          </h2>

          <div className="grid gap-6 sm:grid-cols-3">
            {testimonials.map((t) => (
              <Card key={t.name} className={`border-0 p-6 ${t.bg} transition-transform duration-300 hover:-translate-y-1`}>
                <span className="text-5xl leading-none text-foreground/10 font-serif">"</span>
                <p className="mt-2 text-sm text-foreground/80 italic">{t.quote}</p>
                <div className="mt-4 flex items-center gap-1">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-landing-yellow text-landing-yellow" />
                  ))}
                </div>
                <div className="mt-3">
                  <p className="font-bold text-foreground text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
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
          <h2 className="text-3xl font-extrabold sm:text-4xl">Ready to ditch the clipboard?</h2>
          <p className="mt-3 text-lg text-white/80">
            Join hundreds of lawn care pros who traded spreadsheets for sunshine.
          </p>
          <Button
            size="lg"
            className="mt-8 h-14 rounded-full bg-white text-landing-coral font-bold text-lg px-10 shadow-xl hover:bg-white/90"
            onClick={() => navigate("/onboard?source=landing")}
          >
            Start Free — No Credit Card <ArrowRight className="ml-2 h-5 w-5" />
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
              <button onClick={() => scrollTo("features")} className="hover:text-sidebar-primary transition-colors">Features</button>
              <button onClick={() => scrollTo("how")} className="hover:text-sidebar-primary transition-colors">How It Works</button>
              <button onClick={() => scrollTo("testimonials")} className="hover:text-sidebar-primary transition-colors">Testimonials</button>
              <button onClick={() => navigate("/auth")} className="hover:text-sidebar-primary transition-colors">Sign In</button>
            </div>
          </div>
          <div className="mt-8 border-t border-sidebar-border pt-6 text-center text-xs text-sidebar-foreground/40">
            © {new Date().getFullYear()} GreenGrass CRM. Grow smarter, mow better. 🌿
          </div>
        </div>
      </footer>
    </div>
  );
}
