import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Callout } from 'fumadocs-ui/components/callout';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import type { ComponentProps } from 'react';
import type { MDXComponents } from 'mdx/types';
import { CopyValue } from './copy-value';
import { Screenshot } from './screenshot';
import { Ui } from './ui-label';

function Note(props: ComponentProps<typeof Callout>) {
  return <Callout type="info" {...props} />;
}

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Callout,
    Note,
    Steps,
    Step,
    Tabs,
    Tab,
    Screenshot,
    CopyValue,
    Ui,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
