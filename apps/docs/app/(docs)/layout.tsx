import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/notebook';
import { baseOptions } from '@/lib/layout.shared';
import { SidebarSectionLabel } from '@/components/sidebar-separator';

export default function Layout({ children }: LayoutProps<'/'>) {
  const base = baseOptions();

  return (
    <DocsLayout
      {...base}
      tree={source.getPageTree()}
      nav={{ ...base.nav, mode: 'top' }}
      tabs={false}
      sidebar={{ components: { Separator: SidebarSectionLabel } }}
    >
      {children}
    </DocsLayout>
  );
}
