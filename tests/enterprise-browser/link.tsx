import type { AnchorHTMLAttributes } from "react";
export default function TestLink(
  props: AnchorHTMLAttributes<HTMLAnchorElement>,
) {
  return <a {...props} />;
}
