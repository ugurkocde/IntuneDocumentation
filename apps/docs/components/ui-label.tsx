import type { ReactNode } from 'react';

/** A label exactly as it appears in the app or portal, for example a button or menu name. */
export function Ui({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-fd-foreground">{children}</strong>;
}
