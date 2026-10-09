import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import Image from 'next/image';
import { appName, links } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="inline-flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt=""
            width={28}
            height={28}
            priority
            className="size-7 rounded-[7px]"
          />
          <span className="whitespace-nowrap font-semibold tracking-tight text-fd-foreground">{appName}</span>
          <span className="hidden rounded-md border border-fd-primary/25 bg-fd-primary/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase leading-none tracking-wide text-fd-primary sm:inline">
            Docs
          </span>
        </span>
      ),
      url: '/',
    },
    links: [
      { text: 'Website', url: links.website, external: true },
      { text: 'Desktop app', url: links.desktop, external: true },
    ],
    githubUrl: links.github,
  };
}
