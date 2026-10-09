import { source } from '@/lib/source';
import { absoluteUrl, siteDescription, siteName } from '@/lib/shared';
import type * as PageTree from 'fumadocs-core/page-tree';

export const revalidate = false;

function renderNodes(nodes: PageTree.Node[], out: string[]) {
  for (const node of nodes) {
    if (node.type === 'separator') {
      out.push('', `## ${typeof node.name === 'string' ? node.name : ''}`, '');
    } else if (node.type === 'page') {
      const page = source.getNodePage(node);
      if (!page) continue;
      const description = page.data.description ? `: ${page.data.description}` : '';
      out.push(`- [${page.data.title}](${absoluteUrl(page.url)})${description}`);
    } else if (node.type === 'folder') {
      if (node.index) renderNodes([node.index], out);
      renderNodes(node.children, out);
    }
  }
}

export function GET() {
  const out = [`# ${siteName}`, '', `> ${siteDescription}`, ''];
  out.push(
    `Every page is also available as Markdown, for example ${absoluteUrl('/llms.mdx/desktop/install/content.md')}`,
    `Full text of every page: ${absoluteUrl('/llms-full.txt')}`,
  );
  renderNodes(source.getPageTree().children, out);

  return new Response(`${out.join('\n')}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
