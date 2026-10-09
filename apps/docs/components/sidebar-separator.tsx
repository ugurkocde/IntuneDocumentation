'use client';

import type * as PageTree from 'fumadocs-core/page-tree';

/** GitBook style group label between sidebar sections. */
export function SidebarSectionLabel({ item }: { item: PageTree.Separator }) {
  return (
    <p className="mt-7 mb-1.5 px-2 text-xs font-semibold tracking-wide text-fd-foreground/80 uppercase first:mt-0">
      {item.name}
    </p>
  );
}
