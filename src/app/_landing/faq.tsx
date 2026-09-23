import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { faqs } from "./content";
import { Section, SectionHeading } from "./primitives";

function linkify(text: string): ReactNode {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-teal-700 underline decoration-teal-600/40 underline-offset-2"
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function Faq() {
  return (
    <Section id="faq" tone="white">
      <div className="mx-auto max-w-4xl">
        <div className="mb-10">
          <SectionHeading
            centered
            eyebrow="Questions, answered"
            title="Frequently asked questions"
          />
        </div>
        {/* Native disclosure: works without JavaScript, and the shared name
            keeps one answer open at a time */}
        <div className="space-y-3">
          {faqs.map((faq) => (
            <details
              key={faq.question}
              name="faq"
              className="group border-petrol-950/6 bg-surface overflow-hidden rounded-2xl border"
            >
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-teal-50/55 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none focus-visible:ring-inset sm:px-6 [&::-webkit-details-marker]:hidden">
                <h3 className="text-petrol-950 font-semibold">
                  {faq.question}
                </h3>
                <ChevronDown
                  className="h-5 w-5 shrink-0 text-teal-700 transition-transform duration-200 group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="text-petrol-600 max-w-3xl px-5 pb-5 text-sm leading-6 sm:px-6">
                {linkify(faq.answer)}
              </p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}
