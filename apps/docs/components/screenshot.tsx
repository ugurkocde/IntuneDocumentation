import { ImageZoom } from 'fumadocs-ui/components/image-zoom';

export interface ScreenshotProps {
  /** Path under /public, for example /images/desktop/sign-in.png */
  src: string;
  /** Describe what the screenshot shows, for screen readers and search engines. */
  alt: string;
  /** Optional caption shown below the image. */
  caption?: string;
  /** Intrinsic pixel width of the image file. Defaults to 1600. */
  width?: number;
  /** Intrinsic pixel height of the image file. Defaults to 1000. */
  height?: number;
}

export function Screenshot({ src, alt, caption, width = 1600, height = 1000 }: ScreenshotProps) {
  return (
    <figure className="not-prose my-6">
      <div className="overflow-hidden rounded-xl border bg-fd-card shadow-[0_18px_50px_-30px_rgb(8_47_54/0.35)]">
        <ImageZoom
          src={src}
          alt={alt}
          width={width}
          height={height}
          sizes="(min-width: 1024px) 760px, 100vw"
          className="block h-auto w-full"
        />
      </div>
      {caption ? (
        <figcaption className="mt-2.5 text-center text-sm text-fd-muted-foreground">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
