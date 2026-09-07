"use client";
import { createContext, useContext, type ReactNode } from "react";
const SiteBoundary = createContext({
  publicSite: false,
  appOrigin: "",
  nonce: "",
});
export function SiteBoundaryProvider({
  children,
  ...value
}: {
  children: ReactNode;
  publicSite: boolean;
  appOrigin: string;
  nonce: string;
}) {
  return (
    <SiteBoundary.Provider value={value}>{children}</SiteBoundary.Provider>
  );
}
export const useSiteBoundary = () => useContext(SiteBoundary);
