# Content guide

Pages live in `content/docs` as MDX. The URL is the file path without the extension, served from the site root: `content/docs/desktop/install.mdx` is `https://docs.intunedocumentation.com/desktop/install`.

## Page basics

Every page starts with frontmatter. Quote both values (descriptions often contain a colon).

```mdx
---
title: "Install the desktop app"
description: "Download and install the Intune Documentation desktop app on Windows or macOS."
---
```

- The title renders as the page heading, so do not repeat it as `# Heading`. Start sections at `##`.
- `##` and `###` headings appear in the "On this page" rail.
- The description is used for search results, SEO and `llms.txt`. One sentence.
- The sidebar order and groups are defined in `content/docs/meta.json`. A new page only shows in the sidebar after you add its path there. Lines like `"---Help---"` are group labels.
- Link to other pages with absolute paths: `[Install the app](/desktop/install)`.

Style rules: no emojis, no em dashes or en dashes, and no spaced hyphen as punctuation.

## Images

Put screenshots in `public/images/desktop/<name>.png` and reference them as `/images/desktop/<name>.png`. Use the `Screenshot` component, not plain Markdown images.

## Components

All components below are available in every MDX file without an import.

### Screenshot

Rounded, bordered image with a shadow. Click opens it full size.

```mdx
<Screenshot
  src="/images/desktop/sign-in.png"
  alt="The sign in screen of the desktop app"
  caption="Sign in with an account that can read Intune."
  width={1600}
  height={1000}
/>
```

`src` and `alt` are required. Pass the real pixel `width` and `height` of the file (defaults are 1600 by 1000) so the page does not jump while loading.

### Callout and Note

```mdx
<Note>You can run the export again at any time.</Note>

<Callout type="warn" title="Admin consent required">
  A Global Administrator must grant consent before the first sign in.
</Callout>
```

`type` is one of `info` (default), `warn`, `error`, `success`, `idea`. `Note` is a shortcut for an `info` callout.

### Steps

```mdx
<Steps>
<Step>
### Open the Entra admin center

Go to **App registrations** and select **New registration**.
</Step>
<Step>
### Name the app

Enter a name and select **Register**.
</Step>
</Steps>
```

Leave a blank line around Markdown inside a `Step`.

### CopyValue

Inline value with a copy button, for IDs, URLs and permission names the reader has to paste somewhere.

```mdx
Add <CopyValue value="http://localhost" /> as the redirect URI.
```

### Ui

Bold label for a button, menu or field name exactly as it appears on screen.

```mdx
Select <Ui>Grant admin consent</Ui>.
```

### Tabs

```mdx
<Tabs items={['Windows', 'macOS']}>
  <Tab value="Windows">Run the installer.</Tab>
  <Tab value="macOS">Open the DMG and drag the app to Applications.</Tab>
</Tabs>
```

### Cards

Used on the Welcome page for navigation tiles. Icons come from `lucide-react` and need an import at the top of the file.

```mdx
import { Download } from 'lucide-react';

<Cards>
  <Card icon={<Download />} title="Install the desktop app" href="/desktop/install">
    Download the app for Windows or macOS.
  </Card>
</Cards>
```

## Check your work

```bash
npm run dev        # http://localhost:3200
npm run build      # must pass before you open a pull request
```
