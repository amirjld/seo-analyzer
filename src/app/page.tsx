"use client";

import type { CSSProperties, FormEvent } from "react";
import { useMemo, useState } from "react";
import type { SeoAnalysis, SeoCheck } from "@/lib/seo-analyzer";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileSearch,
  Gauge,
  Globe2,
  Image,
  Link2,
  Loader2,
  ScanSearch,
  Search,
  Share2,
  ShieldCheck,
  TrendingUp,
  Zap,
  XCircle,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";

const categoryLabels: Record<SeoCheck["category"], string> = {
  content: "Content",
  technical: "Technical",
  links: "Links",
  media: "Media",
  social: "Social",
};

const categoryIcons = {
  content: FileSearch,
  technical: ShieldCheck,
  links: Link2,
  media: Image,
  social: Share2,
};

const scanHighlights = [
  "Metadata",
  "Indexability",
  "Content depth",
  "Social previews",
];

const previewRows = [
  { label: "Title tag", value: "Optimized", status: "pass" },
  { label: "Canonical", value: "Detected", status: "pass" },
  { label: "Meta description", value: "Too short", status: "warn" },
  { label: "Image alt text", value: "6 missing", status: "fail" },
] as const;

const statusClasses = {
  pass: "text-success",
  warn: "text-warning",
  fail: "text-error",
} as const;

const priorityClasses = {
  high: "badge-error",
  medium: "badge-warning",
  low: "badge-info",
} as const;

export default function Home() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<SeoAnalysis | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload = (await response.json()) as
        | SeoAnalysis
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload ? payload.error : "Analysis failed.",
        );
      }

      setResult(payload as SeoAnalysis);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The URL could not be analyzed.",
      );
    } finally {
      setLoading(false);
    }
  }

  const groupedChecks = useMemo(() => {
    if (!result) return null;

    return result.checks.reduce(
      (groups, check) => {
        groups[check.category].push(check);
        return groups;
      },
      {
        content: [],
        technical: [],
        links: [],
        media: [],
        social: [],
      } as Record<SeoCheck["category"], SeoCheck[]>,
    );
  }, [result]);

  return (
    <main className="mx-auto flex min-h-screen w-[min(1180px,calc(100%-1.5rem))] flex-col gap-6 px-0 py-5 sm:w-[min(1180px,calc(100%-2rem))] sm:py-8">
      <header className="navbar rounded-lg">
        <div className="flex-1">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src="/ranklens-logo.svg"
              alt=""
              className="h-11 w-11 shrink-0 drop-shadow-xl"
            />
            <div className="grid min-w-0 gap-0.5">
              <strong className="truncate text-xl font-black tracking-normal text-base-content">
                RankLens
              </strong>
              <span className="truncate text-xs font-extrabold uppercase tracking-normal text-base-content/55">
                SEO Analyzer
              </span>
            </div>
          </div>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
        <div className="card rounded-lg">
          <div className="card-body gap-6 p-6 sm:p-10">
            <div className="space-y-4">
              <div className="badge badge-primary badge-outline h-9 gap-2 rounded-lg px-3 font-black uppercase">
                <ScanSearch size={16} aria-hidden="true" />
                Precision on-page SEO audit
              </div>
              <div className="max-w-3xl space-y-5">
                <h1 className="text-4xl font-black leading-[1.03] tracking-normal text-base-content sm:text-5xl xl:text-6xl">
                  See what is holding any page back in search.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-base-content/65 sm:text-lg">
                  Run a live scan, get a clear SEO score, and move straight to
                  the recommendations with the highest impact.
                </p>
              </div>
            </div>

            <form
              className="flex w-full max-w-3xl flex-col gap-3 rounded-lg 5 sm:flex-row"
              onSubmit={analyze}
            >
              <label className="input input-lg input-bordered flex min-h-14 flex-1 items-center gap-2 rounded-lg bg-base-200/60">
                <Search
                  className="shrink-0 text-base-content/45"
                  size={18}
                  aria-hidden="true"
                />
                <input
                  id="url"
                  name="url"
                  type="url"
                  inputMode="url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  required
                  className="min-w-0"
                />
              </label>
              <button
                className="btn btn-primary btn-lg min-h-14 rounded-lg font-black sm:min-w-36"
                type="submit"
                disabled={loading}
              >
                {loading ? (
                  <Loader2
                    className="animate-spin"
                    size={18}
                    aria-hidden="true"
                  />
                ) : (
                  <ArrowRight size={18} aria-hidden="true" />
                )}
                <span>{loading ? "Analyzing" : "Analyze"}</span>
              </button>
            </form>

            <div className="flex flex-wrap gap-2" aria-label="Audit coverage">
              {scanHighlights.map((item) => (
                <span
                  className="badge badge-lg h-auto min-h-9 gap-2 rounded-lg border-base-300 bg-base-200 px-3 py-2 text-sm font-bold text-base-content/75"
                  key={item}
                >
                  <CheckCircle2
                    className="shrink-0 text-success"
                    size={15}
                    aria-hidden="true"
                  />
                  {item}
                </span>
              ))}
            </div>

            {error ? (
              <div className="alert alert-error rounded-lg" role="alert">
                <AlertTriangle size={18} aria-hidden="true" />
                <span className="font-bold">{error}</span>
              </div>
            ) : null}
          </div>
        </div>

        <aside
          className="card overflow-hidden rounded-lg "
          aria-label="Sample SEO report preview"
        >
          <div className="card-body relative gap-5 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="grid gap-1">
                <span className="text-xs font-black uppercase ">
                  Live report
                </span>
                <strong className="text-lg">Technical SEO</strong>
              </div>
              <span className="badge badge-primary badge-outline h-8 gap-1.5 rounded-lg px-3 font-black">
                <Zap size={14} aria-hidden="true" />
                Instant
              </span>
            </div>


            <div className="flex flex-col gap-5 sm:flex-row sm:items-center lg:flex-col lg:items-start xl:flex-row xl:items-center">
              <div
                className="radial-progress shrink-0 text-primary"
                style={{ "--value": 92, "--size": "7rem" } as CSSProperties}
                role="progressbar"
                aria-valuenow={92}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span className="text-3xl font-black ">
                  92
                </span>
              </div>
              <div className="min-w-0 space-y-2">
                <p className="text-xs font-black uppercase text-neutral-content/50">
                  Search health
                </p>
                <h2 className="max-w-sm text-2xl font-black leading-tight tracking-normal">
                  Strong foundation, a few high-value fixes.
                </h2>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <PreviewMetric icon={Gauge} label="Load" value="1.1s" />
              <PreviewMetric icon={BarChart3} label="Checks" value="22" />
              <PreviewMetric icon={TrendingUp} label="Impact" value="High" />
            </div>

            <div className="grid gap-2">
              {previewRows.map((row) => (
                <div
                  className="flex min-h-11 min-w-0 items-center gap-3 rounded-lg border border-white/10 bg-white/[0.07] px-3"
                  key={row.label}
                >
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      row.status === "pass"
                        ? "bg-success"
                        : row.status === "warn"
                          ? "bg-warning"
                          : "bg-error"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold ">
                    {row.label}
                  </span>
                  <strong className="shrink-0 text-sm">{row.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>

      {result ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.2fr_repeat(3,1fr)]">
            <ScoreCard label="Overall" value={result.scores.overall} primary />
            <ScoreCard label="Content" value={result.scores.content} />
            <ScoreCard label="Technical" value={result.scores.technical} />
            <ScoreCard label="Social" value={result.scores.social} />
          </section>

          <section className="stats stats-vertical rounded-lg border border-base-300/80 bg-base-100 shadow-xl shadow-slate-950/5 xl:stats-horizontal">
            <Metric
              icon={ExternalLink}
              label="Final URL"
              value={result.finalUrl}
              wide
            />
            <Metric
              icon={Clock3}
              label="Response"
              value={`${result.responseMs} ms`}
            />
            <Metric
              label="Words"
              value={result.page.wordCount.toLocaleString()}
            />
            <Metric label="Images" value={`${result.page.imageCount}`} />
            <Metric
              label="Missing alt"
              value={`${result.page.imagesMissingAlt}`}
            />
          </section>

          <section className="grid gap-5 lg:grid-cols-[minmax(0,1.06fr)_minmax(320px,0.94fr)]">
            <article className="card rounded-lg border border-base-300/80 bg-base-100 shadow-xl shadow-slate-950/5">
              <div className="card-body p-5">
                <SectionHeading
                  title="Recommendations"
                  meta={`${result.recommendations.length} actions`}
                />
                <div className="grid gap-3">
                  {result.recommendations.map((item) => (
                    <div
                      className="grid gap-3 border-t border-base-300 pt-4 first:border-t-0 first:pt-0 sm:grid-cols-[auto_1fr]"
                      key={item.title}
                    >
                      <span
                        className={`badge ${priorityClasses[item.priority]} badge-sm h-6 rounded-lg font-black uppercase`}
                      >
                        {item.priority}
                      </span>
                      <div className="min-w-0">
                        <h3 className="mb-1 text-base font-black tracking-normal">
                          {item.title}
                        </h3>
                        <p className="text-sm leading-6 text-base-content/65">
                          {item.detail}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </article>

            <article className="card rounded-lg border border-base-300/80 bg-base-100 shadow-xl shadow-slate-950/5">
              <div className="card-body p-5">
                <SectionHeading title="Page signals" meta="Extracted" />
                <dl className="grid">
                  <Fact label="Title" value={result.page.title || "Missing"} />
                  <Fact
                    label="Description"
                    value={result.page.description || "Missing"}
                  />
                  <Fact
                    label="Canonical"
                    value={result.page.canonical || "Missing"}
                  />
                  <Fact
                    label="H1"
                    value={
                      result.page.h1.length > 0
                        ? result.page.h1.join(" | ")
                        : "Missing"
                    }
                  />
                  <Fact
                    label="Schema"
                    value={
                      result.page.structuredDataTypes.length > 0
                        ? result.page.structuredDataTypes.join(", ")
                        : "Missing"
                    }
                  />
                </dl>
              </div>
            </article>
          </section>

          {groupedChecks ? (
            <section className="grid gap-5 lg:grid-cols-2">
              {(Object.keys(groupedChecks) as SeoCheck["category"][]).map(
                (category) => {
                  const Icon = categoryIcons[category];
                  return (
                    <article
                      className="card rounded-lg border border-base-300/80 bg-base-100 shadow-xl shadow-slate-950/5"
                      key={category}
                    >
                      <div className="card-body p-5">
                        <div className="mb-1 flex items-center gap-2">
                          <Icon
                            className="text-primary"
                            size={18}
                            aria-hidden="true"
                          />
                          <h2 className="text-lg font-black tracking-normal">
                            {categoryLabels[category]}
                          </h2>
                        </div>
                        <div className="grid gap-3">
                          {groupedChecks[category].map((check) => (
                            <div
                              className="grid grid-cols-[auto_1fr] gap-3 border-t border-base-300 pt-3 first:border-t-0 first:pt-0"
                              key={check.label}
                            >
                              <StatusIcon status={check.status} />
                              <div className="min-w-0">
                                <h3 className="mb-1 text-sm font-black tracking-normal">
                                  {check.label}
                                </h3>
                                <p className="text-sm leading-6 text-base-content/65">
                                  {check.detail}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </article>
                  );
                },
              )}
            </section>
          ) : null}
        </>
      ) : (
        <section className="grid gap-4 md:grid-cols-3">
          <EmptyCard
            icon={ShieldCheck}
            title="Audit depth without the noise"
            copy="Prioritized checks are grouped by content, technical, media, links, and social signals."
          />
          <EmptyCard
            icon={Clock3}
            title="Live fetch data"
            copy="Reports include response time, final URL, page size, and crawlability signals from the current page."
          />
          <EmptyCard
            icon={TrendingUp}
            title="Action-first output"
            copy="Recommendations are ordered so the most important ranking and click-through fixes rise to the top."
          />
        </section>
      )}
    </main>
  );
}

function PreviewMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="grid min-w-0 gap-2 rounded-lg border border-white/10 bg-white/[0.07] p-4">
      <Icon className="text-primary" size={18} aria-hidden="true" />
      <span className="truncate text-xs font-black uppercase ">
        {label}
      </span>
      <strong className="truncate text-lg">{value}</strong>
    </div>
  );
}

function ScoreCard({
  label,
  value,
  primary = false,
}: {
  label: string;
  value: number;
  primary?: boolean;
}) {
  return (
    <article
      className={`card rounded-lg border shadow-xl shadow-slate-950/5 ${
        primary
          ? "bg-accent "
          : "border-base-300/80 bg-base-100"
      }`}
    >
      <div className="card-body gap-4 p-5">
        <div className="flex items-end justify-between gap-4">
          <span
            className={`text-xs font-black uppercase`}
          >
            {label}
          </span>
          <strong className="text-5xl font-black leading-none">{value}</strong>
        </div>
        <progress
          className={`progress h-2 ${primary ? "progress-primary" : "progress-success"}`}
          value={value}
          max={100}
          aria-label={`${label} score`}
        />
      </div>
    </article>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  wide = false,
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={`stat min-w-0 ${wide ? "xl:min-w-96" : ""}`}>
      {Icon ? (
        <Icon
          className="stat-figure text-primary"
          size={18}
          aria-hidden="true"
        />
      ) : null}
      <div className="stat-title text-xs font-black uppercase">{label}</div>
      <div className="stat-value truncate text-base font-black leading-7">
        {value}
      </div>
    </div>
  );
}

function SectionHeading({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h2 className="text-lg font-black tracking-normal">{title}</h2>
      <span className="text-sm font-black text-base-content/55">{meta}</span>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-t border-base-300 py-3 first:border-t-0 first:pt-0">
      <dt className="text-xs font-black uppercase text-base-content/55">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-sm leading-6 text-base-content/75">
        {value}
      </dd>
    </div>
  );
}

function StatusIcon({ status }: { status: SeoCheck["status"] }) {
  if (status === "pass") {
    return (
      <CheckCircle2
        className={`mt-0.5 ${statusClasses.pass}`}
        size={20}
        aria-hidden="true"
      />
    );
  }

  if (status === "warn") {
    return (
      <AlertTriangle
        className={`mt-0.5 ${statusClasses.warn}`}
        size={20}
        aria-hidden="true"
      />
    );
  }

  return (
    <XCircle
      className={`mt-0.5 ${statusClasses.fail}`}
      size={20}
      aria-hidden="true"
    />
  );
}

function EmptyCard({
  icon: Icon,
  title,
  copy,
}: {
  icon: LucideIcon;
  title: string;
  copy: string;
}) {
  return (
    <article className="card rounded-lg border border-base-300/80 bg-base-100 shadow-xl shadow-slate-950/5">
      <div className="card-body p-5">
        <Icon className="mb-1 text-primary" size={22} aria-hidden="true" />
        <h2 className="text-lg font-black tracking-normal">{title}</h2>
        <p className="text-sm leading-6 text-base-content/65">{copy}</p>
      </div>
    </article>
  );
}
