import { Link } from 'react-router-dom'

import { HoverHint } from './HoverHint'

interface PageGuideProps {
  title: string
  summary: string
  steps: string[]
  nextHref?: string
  nextLabel?: string
}

export function PageGuide({
  title,
  summary,
  steps,
  nextHref,
  nextLabel,
}: PageGuideProps) {
  return (
    <section className="card-surface border-teal/20 bg-[linear-gradient(135deg,rgba(0,212,170,0.08),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent)] p-5 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="eyebrow">Start Here</p>
            <HoverHint label="These quick steps are written for a first-time user. Follow them in order if you are unsure what to do next." />
          </div>
          <div>
            <h3 className="text-2xl text-ink">{title}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">{summary}</p>
          </div>
        </div>
        {nextHref && nextLabel ? (
          <Link
            to={nextHref}
            className="inline-flex rounded-full border border-teal/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-teal transition hover:bg-teal/10"
            title={nextLabel}
          >
            {nextLabel}
          </Link>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {steps.map((step, index) => (
          <article
            key={step}
            className="rounded-[20px] border border-stroke/70 bg-card/70 p-4"
            title={step}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal">
              Step {index + 1}
            </p>
            <p className="mt-3 text-sm leading-6 text-muted">{step}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
