import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  FileSearch,
  FileText,
  FolderKanban,
  Lock,
  Menu,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppLogo } from '@/components/app/AppLogo';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

// FAQ items definition
const faqs = [
  {
    question: "How does the human-in-the-loop review work?",
    answer: "SSIAR automatically flags extracted data fields that fall below confidence thresholds. Reviewers are guided directly to these fields with exact document visual crops, ensuring rapid, precise verification without scanning entire pages."
  },
  {
    question: "Is data transmission and storage secure?",
    answer: "Yes, security is a core pillar of SSIAR. We support end-to-end TLS encryption, field-level access control, data anonymization, and regular automated compliance audits to protect sensitive operational workflows."
  },
  {
    question: "What document formats are supported?",
    answer: "We support processing high-resolution single-page and multi-page PDFs, scanned images, and structured spreadsheets. Documents can be split and processed in automated queues."
  },
  {
    question: "Can we integrate SSIAR with our existing database?",
    answer: "Absolutely. SSIAR provides a clean developer API and structured export formats (JSON, CSV) suitable for direct ingestion into analytical warehouses, custom tools, or transactional databases."
  }
];

export function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  
  // Interactive Showcase Tab state
  const [showcaseTab, setShowcaseTab] = useState<'dashboard' | 'verification' | 'export'>('dashboard');

  // Monitor scroll for sticky navbar styling
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20 selection:text-primary font-sans antialiased">
      
      {/* Sticky Navigation with Scroll Effect */}
      <header
        className={`sticky top-0 z-50 w-full transition-all duration-300 ${
          scrolled
            ? 'border-b border-border/60 bg-background/80 backdrop-blur-md py-3 shadow-[var(--shadow-sm)]'
            : 'border-b border-transparent bg-transparent py-5'
        }`}
      >
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6">
          <AppLogo />
          
          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#workflow" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Workflow
            </a>
            <a href="#why-us" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Why SSIAR
            </a>
            <a href="#faq" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              FAQ
            </a>
          </nav>

          {/* Action Buttons */}
          <div className="hidden md:flex items-center gap-3">
            <Link to="/login" className={buttonVariants({ variant: 'ghost', size: 'sm' }) + " hover:bg-muted"}>
              Sign in
            </Link>
            <Link to="/app/dashboard" className={buttonVariants({ size: 'sm' }) + " shadow-sm hover:shadow-md transition-all"}>
              Open workspace
            </Link>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-border bg-background px-6 py-6 animate-in fade-in slide-in-from-top-4 duration-200">
            <nav className="flex flex-col gap-4">
              <a
                href="#features"
                onClick={() => setMobileMenuOpen(false)}
                className="text-base font-medium text-muted-foreground hover:text-foreground"
              >
                Features
              </a>
              <a
                href="#workflow"
                onClick={() => setMobileMenuOpen(false)}
                className="text-base font-medium text-muted-foreground hover:text-foreground"
              >
                Workflow
              </a>
              <a
                href="#why-us"
                onClick={() => setMobileMenuOpen(false)}
                className="text-base font-medium text-muted-foreground hover:text-foreground"
              >
                Why SSIAR
              </a>
              <a
                href="#faq"
                onClick={() => setMobileMenuOpen(false)}
                className="text-base font-medium text-muted-foreground hover:text-foreground"
              >
                FAQ
              </a>
              <hr className="border-border my-2" />
              <div className="flex flex-col gap-3">
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className={buttonVariants({ variant: 'outline', size: 'lg' }) + " w-full justify-center"}
                >
                  Sign in
                </Link>
                <Link
                  to="/app/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className={buttonVariants({ size: 'lg' }) + " w-full justify-center"}
                >
                  Open workspace
                </Link>
              </div>
            </nav>
          </div>
        )}
      </header>

      <main>
        {/* Premium Hero Section with Gradient Background */}
        <section className="relative overflow-hidden pt-12 pb-24 md:pt-20 md:pb-32">
          {/* Subtle gradient glowing backgrounds */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] pointer-events-none bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.08),transparent_60%)] dark:bg-[radial-gradient(circle_at_top,rgba(129,140,248,0.06),transparent_60%)]" />
          
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-col items-center text-center space-y-8">
              {/* Decorative Sparkle Badge */}
              <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-muted/40 px-3.5 py-1.5 text-xs font-semibold text-muted-foreground shadow-[var(--shadow-sm)]">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span>Document screening operations platform</span>
              </div>

              {/* Title & Description */}
              <div className="space-y-4 max-w-4xl">
                <h1 className="text-4xl font-extrabold tracking-tight text-balance text-foreground sm:text-6xl md:text-7xl leading-[1.1]">
                  Intelligent intake and verification. <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-indigo-500 dark:to-indigo-400">Zero noise.</span>
                </h1>
                <p className="mx-auto max-w-2xl text-base text-muted-foreground sm:text-xl leading-relaxed">
                  SSIAR provides operations and review teams a premium, high-confidence workspace for ingestion, human-in-the-loop validation, and structured downstream exports.
                </p>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-wrap justify-center items-center gap-4">
                <Link to="/app/dashboard" className={buttonVariants({ size: 'lg' }) + " gap-2 px-6 shadow-md hover:shadow-lg transition-all"}>
                  Launch workspace <ArrowRight className="h-4.5 w-4.5" />
                </Link>
                <Link to="/login" className={buttonVariants({ variant: 'outline', size: 'lg' }) + " px-6 hover:bg-muted"}>
                  Access account
                </Link>
              </div>

              {/* Product Showcase with Browser Mockup (Interactive Tab Controls) */}
              <div className="w-full max-w-5xl pt-10 animate-in fade-in zoom-in-95 duration-500 delay-150">
                <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-lg)] overflow-hidden">
                  
                  {/* Browser Mockup Header */}
                  <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-destructive/60" />
                      <div className="h-3 w-3 rounded-full bg-amber-500/60" />
                      <div className="h-3 w-3 rounded-full bg-success/60" />
                    </div>
                    
                    {/* Interactive Tab Selector Inside Browser Frame */}
                    <div className="flex bg-background/80 border border-border/40 p-0.5 rounded-lg text-xs font-medium">
                      <button
                        onClick={() => setShowcaseTab('dashboard')}
                        className={`px-3 py-1 rounded-md transition-colors ${showcaseTab === 'dashboard' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        Dashboard
                      </button>
                      <button
                        onClick={() => setShowcaseTab('verification')}
                        className={`px-3 py-1 rounded-md transition-colors ${showcaseTab === 'verification' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        Verification Loop
                      </button>
                      <button
                        onClick={() => setShowcaseTab('export')}
                        className={`px-3 py-1 rounded-md transition-colors ${showcaseTab === 'export' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        Export Schema
                      </button>
                    </div>
                    
                    <div className="hidden sm:block text-[11px] text-muted-foreground font-mono">
                      {showcaseTab === 'dashboard' && 'ssiar.internal/app/dashboard'}
                      {showcaseTab === 'verification' && 'ssiar.internal/app/review'}
                      {showcaseTab === 'export' && 'ssiar.internal/app/reporting'}
                    </div>
                  </div>

                  {/* Browser Content Showcase Container */}
                  <div className="p-4 bg-muted/10 min-h-[300px] flex flex-col justify-between">
                    {showcaseTab === 'dashboard' && (
                      <div className="grid gap-4 animate-in fade-in duration-300">
                        {/* Simulated Stats Banner */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                          {[
                            { label: 'Total', value: '438', icon: FileText, color: 'var(--accent-violet)' },
                            { label: 'Verified', value: '312', icon: Check, color: 'var(--accent-cyan)' },
                            { label: 'Processing', value: '18', icon: Clock, color: 'var(--accent-amber)', pulse: true },
                            { label: 'Needs Review', value: '92', icon: AlertTriangle, color: 'var(--accent-emerald)' },
                            { label: 'Failed', value: '16', icon: X, color: 'var(--accent-rose)' },
                          ].map((item) => (
                            <div key={item.label} className="border border-border/60 bg-background rounded-xl p-3.5 shadow-[var(--shadow-sm)] flex flex-col gap-1 text-left">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{item.label}</span>
                                <item.icon size={14} className={item.pulse ? "animate-pulse" : ""} style={{ color: item.color }} />
                              </div>
                              <span className="text-xl font-bold tracking-tight">{item.value}</span>
                            </div>
                          ))}
                        </div>

                        {/* Simulated Table Body */}
                        <div className="border border-border/60 bg-background rounded-xl shadow-[var(--shadow-sm)] overflow-hidden">
                          <div className="border-b border-border/60 bg-muted/20 px-4 py-2.5 flex items-center justify-between text-xs text-muted-foreground font-medium">
                            <span>Document ID</span>
                            <span>Ingestion Timestamp</span>
                            <span>Operational Status</span>
                          </div>
                          <div className="divide-y divide-border/40 text-xs text-left">
                            {[
                              { id: 'DOC-2026-904', time: '10 mins ago', status: 'verified', statusColor: 'text-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10' },
                              { id: 'DOC-2026-903', time: '14 mins ago', status: 'needs_review', statusColor: 'text-[var(--accent-emerald)] bg-[var(--accent-emerald)]/10' },
                              { id: 'DOC-2026-902', time: '22 mins ago', status: 'processing', statusColor: 'text-[var(--accent-amber)] bg-[var(--accent-amber)]/10' },
                            ].map((row) => (
                              <div key={row.id} className="px-4 py-3 flex items-center justify-between">
                                <span className="font-mono font-semibold">{row.id}</span>
                                <span className="text-muted-foreground">{row.time}</span>
                                <span className={`px-2 py-0.5 rounded-full font-medium ${row.statusColor}`}>
                                  {row.status.replace('_', ' ')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {showcaseTab === 'verification' && (
                      <div className="grid md:grid-cols-[1fr_280px] gap-4 text-left animate-in fade-in duration-300">
                        {/* Interactive Verification Preview */}
                        <div className="border border-border/60 bg-background rounded-xl p-4 shadow-[var(--shadow-sm)] space-y-4">
                          <div className="flex justify-between items-center pb-2 border-b border-border/60">
                            <span className="font-bold text-sm">Reviewing: score_card_math.pdf</span>
                            <span className="text-xs text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full font-semibold">Flagged Field</span>
                          </div>
                          
                          {/* Visual Crop simulation */}
                          <div className="border border-dashed border-primary/40 bg-primary/5 rounded-xl h-24 flex flex-col items-center justify-center text-xs text-primary gap-1">
                            <FileSearch size={20} />
                            <span>Visual Document crop segment at coordinates [x: 120, y: 340]</span>
                          </div>

                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                              <span className="text-muted-foreground block mb-1">OCR Extracted Score</span>
                              <input type="text" readOnly value="78 (Low Confidence)" className="border border-border/60 rounded-lg px-3 py-1.5 w-full bg-muted/20 font-semibold" />
                            </div>
                            <div>
                              <span className="text-muted-foreground block mb-1">Corrected Value</span>
                              <input type="text" readOnly value="78" className="border border-amber-500/60 rounded-lg px-3 py-1.5 w-full bg-amber-500/5 font-semibold text-amber-600 focus:outline-none" />
                            </div>
                          </div>
                        </div>

                        {/* Shortcuts panel */}
                        <div className="border border-border/60 bg-background rounded-xl p-4 shadow-[var(--shadow-sm)] flex flex-col justify-between">
                          <div>
                            <span className="font-bold text-xs block mb-3 uppercase tracking-wider text-muted-foreground">Validation Actions</span>
                            <ul className="space-y-2 text-xs">
                              <li className="flex justify-between items-center"><span className="text-muted-foreground">Confirm Value</span> <kbd className="bg-muted px-1.5 py-0.5 rounded border border-border">Ctrl + Enter</kbd></li>
                              <li className="flex justify-between items-center"><span className="text-muted-foreground">Skip Document</span> <kbd className="bg-muted px-1.5 py-0.5 rounded border border-border">S</kbd></li>
                              <li className="flex justify-between items-center"><span className="text-muted-foreground">Reprocess Job</span> <kbd className="bg-muted px-1.5 py-0.5 rounded border border-border">R</kbd></li>
                            </ul>
                          </div>
                          <button className="w-full bg-[var(--accent-violet)] text-white text-xs py-2 rounded-lg font-semibold hover:opacity-90 transition-opacity mt-4">
                            Save Changes
                          </button>
                        </div>
                      </div>
                    )}

                    {showcaseTab === 'export' && (
                      <div className="border border-border/60 bg-background rounded-xl p-4 shadow-[var(--shadow-sm)] text-left space-y-4 animate-in fade-in duration-300">
                        <div className="flex justify-between items-center pb-2 border-b border-border/60">
                          <span className="font-bold text-sm">JSON Data Export Schema</span>
                          <span className="text-xs text-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10 px-2 py-0.5 rounded-full font-semibold">API Standard</span>
                        </div>
                        <pre className="text-[11px] font-mono bg-muted/30 p-3 rounded-lg overflow-x-auto text-muted-foreground leading-relaxed">
{`{
  "document_id": "DOC-2026-904",
  "status": "verified",
  "data_fields": {
    "roll_number": "R-10934",
    "student_class": "Grade A",
    "extracted_score": 78,
    "confidence_rating": 1.0
  },
  "verified_by": "operator_04"
}`}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Core Features Section */}
        <section id="features" className="py-24 border-t border-border/40">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-col items-center text-center space-y-4 mb-16">
              <span className="text-xs font-semibold uppercase tracking-widest text-primary">Core Architecture</span>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Designed for complex document screening
              </h2>
              <p className="max-w-2xl text-muted-foreground">
                Simplify ingestion, fields mapping, manual reviews, and report verification inside a single unified dashboard.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  title: 'Reliable document intake',
                  description: 'Upload large PDF batches, track pipeline state, and review failed jobs with comprehensive logging.',
                  icon: FolderKanban,
                },
                {
                  title: 'Human verification loop',
                  description: 'Review low-confidence fields with page crops, custom tags, and focused keyboard correction controls.',
                  icon: FileSearch,
                },
                {
                  title: 'Analysis-ready exports',
                  description: 'Move from raw forms to structured reporting, statistics, and downstream delivery pipelines.',
                  icon: BarChart3,
                },
              ].map((feature) => {
                const Icon = feature.icon;
                return (
                  <Card key={feature.title} className="group hover:border-primary/50 transition-all duration-300 hover:shadow-md">
                    <CardHeader>
                      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-muted/40 text-primary group-hover:bg-primary/10 transition-colors">
                        <Icon className="h-5 w-5" />
                      </div>
                      <CardTitle className="group-hover:text-primary transition-colors">{feature.title}</CardTitle>
                      <CardDescription className="text-sm leading-relaxed">{feature.description}</CardDescription>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* How It Works Section with Visual Connectors */}
        <section id="workflow" className="py-24 border-t border-border/40 bg-muted/10 overflow-hidden">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-col items-center text-center space-y-4 mb-16">
              <span className="text-xs font-semibold uppercase tracking-widest text-primary">Step-by-step pipeline</span>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                How SSIAR Streamlines Operations
              </h2>
              <p className="max-w-2xl text-muted-foreground">
                Move documents from raw files to structured, verified data outputs in three robust steps.
              </p>
            </div>

            {/* Visual connector lines on desktop, standard layout on mobile */}
            <div className="relative grid md:grid-cols-3 gap-8">
              
              {/* Visual Connector Line (Behind content card nodes) */}
              <div className="hidden md:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/15 via-primary/30 to-primary/15 -translate-y-1/2 z-0" />

              {[
                {
                  step: '01',
                  title: 'Ingestion & OCR',
                  description: 'Drop multi-page PDFs or sheets into the upload zone. SSIAR processes text structures, extracts scores, and organizes entries.'
                },
                {
                  step: '02',
                  title: 'Flagging & Verification',
                  description: 'Low-confidence predictions automatically enter the review queue. Operators verify coordinates and review data tags.'
                },
                {
                  step: '03',
                  title: 'Structured Export',
                  description: 'Deliver validated results directly as standardized reports, analytics statistics, or via JSON/CSV payload.'
                }
              ].map((item) => (
                <div key={item.title} className="relative z-10 bg-background border border-border/80 rounded-2xl p-6.5 shadow-[var(--shadow-sm)] hover:shadow-md transition-all flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-4xl font-extrabold text-primary/10 tracking-tight">{item.step}</span>
                    {/* Visual Connector Node indicator */}
                    <div className="h-6 w-6 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center text-xs font-bold text-primary">
                      ✓
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-foreground">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Why Choose Us Section */}
        <section id="why-us" className="py-24 border-t border-border/40">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <span className="text-xs font-semibold uppercase tracking-widest text-primary">Product Philosophy</span>
                <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  Built for performance, scalability, and security
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Operations teams deserve production-grade tools. We have optimized SSIAR to deliver low latency, absolute data separation, and keyboard-driven efficiency.
                </p>

                <div className="space-y-4">
                  {[
                    { title: 'Keyboard-Driven Layout', desc: 'Jump from document to document using intuitive shortcuts to accelerate manual data entry.', icon: Zap },
                    { title: 'Robust Data Separation', desc: 'Secure database architecture with comprehensive logging and role-based permissions.', icon: Lock },
                    { title: 'Real-time Synchronization', desc: 'Monitor active queue pipelines via Server-Sent Events without manual browser refreshes.', icon: CheckCircle2 }
                  ].map((feat) => (
                    <div key={feat.title} className="flex gap-4">
                      <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-primary border border-border/60">
                        <feat.icon className="h-4.5 w-4.5" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-foreground">{feat.title}</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">{feat.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Decorative side panel: Visual list of verified benefits */}
              <div className="bg-muted/30 border border-border rounded-3xl p-8 space-y-6">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-6 w-6 text-primary" />
                  <span className="font-bold text-foreground">Operational Safeguards</span>
                </div>
                <hr className="border-border/60" />
                <ul className="space-y-3.5">
                  {[
                    'Automatic worker recovery for stuck documents',
                    'Comprehensive error diagnostic logs',
                    'Interactive analytics metrics filters',
                    'Automatic multi-page splitting capabilities'
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4.5 w-4.5 text-primary flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="py-24 border-t border-border/40">
          <div className="mx-auto max-w-4xl px-6">
            <div className="flex flex-col items-center text-center space-y-4 mb-16">
              <span className="text-xs font-semibold uppercase tracking-widest text-primary">Got Questions?</span>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Frequently Asked Questions
              </h2>
            </div>

            <div className="space-y-3">
              {faqs.map((faq, index) => {
                const isOpen = activeFaq === index;
                return (
                  <div key={index} className="border border-border/80 rounded-2xl bg-card overflow-hidden transition-all duration-300">
                    <button
                      onClick={() => setActiveFaq(isOpen ? null : index)}
                      className="w-full px-6 py-5 flex items-center justify-between text-left focus:outline-none"
                    >
                      <span className="text-sm font-bold text-foreground">{faq.question}</span>
                      <ChevronDown className={`h-4.5 w-4.5 text-muted-foreground transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && (
                      <div className="px-6 pb-5 pt-1 text-xs text-muted-foreground leading-relaxed border-t border-border/40 bg-muted/10 animate-in fade-in duration-200">
                        {faq.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Final CTA Section */}
        <section className="py-24 border-t border-border/40 bg-gradient-to-b from-background to-muted/20">
          <div className="mx-auto max-w-5xl px-6">
            <div className="relative rounded-3xl border border-border bg-card p-8 md:p-14 overflow-hidden shadow-[var(--shadow-lg)]">
              {/* background glow */}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(99,102,241,0.06),transparent_45%)]" />
              
              <div className="relative z-10 max-w-2xl space-y-6">
                <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  Ready to upgrade your document operations?
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Get started with SSIAR today. Launch the digital workspace or create a local account to manage screening documents at scale.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Link to="/app/dashboard" className={buttonVariants({ size: 'lg' }) + " gap-2 shadow-md hover:shadow-lg transition-all"}>
                    Launch dashboard <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link to="/login" className={buttonVariants({ variant: 'outline', size: 'lg' }) + " px-6 hover:bg-muted"}>
                    Access account
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer Section */}
      <footer className="border-t border-border/80 bg-background pt-16 pb-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-8 mb-12">
            <div className="col-span-2 space-y-4">
              <AppLogo />
              <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
                SSIAR is a professional-grade Student Score Intake and Review workspace, redefining document intelligence pipelines.
              </p>
              <div className="flex items-center gap-3 text-muted-foreground">
                <a href="https://github.com" className="hover:text-foreground transition-colors" aria-label="GitHub page"><ExternalLink size={16} /></a>
                <a href="https://twitter.com" className="hover:text-foreground transition-colors" aria-label="Twitter profile"><ExternalLink size={16} /></a>
                <a href="https://linkedin.com" className="hover:text-foreground transition-colors" aria-label="LinkedIn profile"><ExternalLink size={16} /></a>
              </div>
            </div>

            {/* Links Columns */}
            {[
              {
                title: 'Product',
                links: [
                  { label: 'Features', href: '#features' },
                  { label: 'Workflow', href: '#workflow' },
                  { label: 'Fidelity Control', href: '#why-us' }
                ]
              },
              {
                title: 'Resources',
                links: [
                  { label: 'Documentation', href: '#faq' },
                  { label: 'Release Notes', href: '#workflow' },
                  { label: 'System Status', href: '#features' }
                ]
              },
              {
                title: 'Company',
                links: [
                  { label: 'About Us', href: '#why-us' },
                  { label: 'Careers', href: '#features' },
                  { label: 'Contact', href: '#faq' }
                ]
              },
              {
                title: 'Legal',
                links: [
                  { label: 'Privacy Policy', href: '#' },
                  { label: 'Terms of Service', href: '#' },
                  { label: 'Security Audits', href: '#' }
                ]
              }
            ].map((col) => (
              <div key={col.title} className="space-y-3">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">{col.title}</h4>
                <ul className="space-y-2">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a href={link.href} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <hr className="border-border/60 my-8" />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <span>© {new Date().getFullYear()} SSIAR. All rights reserved.</span>
            <div className="flex gap-4">
              <a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-foreground transition-colors">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
