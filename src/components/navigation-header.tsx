"use client";

import { useMsal } from "@azure/msal-react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { User, LogOut, Menu, X } from "lucide-react";
import { Button } from "~/components/ui/button";
import { useUserProfile } from "~/hooks/use-user-profile";
import { useEffect, useState, memo } from "react";
import { loginRequest } from "~/lib/msal-config";

interface NavLinksProps {
  vertical?: boolean;
  pathname: string;
  activeSection: string;
  activeLink: string;
  linkBase: string;
  isAuthenticated: boolean;
}

const NavLinks = memo(function NavLinks({
  vertical = false,
  pathname,
  activeSection,
  activeLink,
  linkBase,
  isAuthenticated,
}: NavLinksProps) {
  return (
    <nav
      className={vertical ? "flex flex-col gap-3" : "flex items-center gap-6"}
    >
      <Link
        href="/"
        prefetch
        className={`inline-flex min-h-11 items-center rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${
          pathname === "/" ? activeLink : linkBase
        }`}
      >
        Home
      </Link>
      <Link
        href="/#how-it-works"
        className={`inline-flex min-h-11 items-center rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${activeSection === "how-it-works" ? activeLink : linkBase}`}
      >
        How it works
      </Link>
      <Link
        href="/#features"
        className={`inline-flex min-h-11 items-center rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${activeSection === "features" ? activeLink : linkBase}`}
      >
        Features
      </Link>
      <Link
        href="/#faq"
        className={`inline-flex min-h-11 items-center rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${activeSection === "faq" ? activeLink : linkBase}`}
      >
        FAQ
      </Link>
      {isAuthenticated && (
        <Link
          href="/dashboard"
          prefetch
          className={`inline-flex min-h-11 items-center rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${
            pathname === "/dashboard" ? activeLink : linkBase
          }`}
        >
          Dashboard
        </Link>
      )}
    </nav>
  );
});

export function NavigationHeader() {
  const { instance, accounts } = useMsal();
  const pathname = usePathname();
  const router = useRouter();
  const { userProfile } = useUserProfile();
  const isAuthenticated = accounts.length > 0;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("");
  const [signInError, setSignInError] = useState<string | null>(null);

  const onHome = pathname === "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Observe sections for active highlighting on home page
  useEffect(() => {
    if (!onHome) return;
    const ids = ["how-it-works", "features", "faq"];
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];
    if (elements.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) {
          setActiveSection(visible.target.id);
        }
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    elements.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [onHome]);

  const handleSignOut = () => {
    void instance.logoutRedirect({
      postLogoutRedirectUri: window.location.origin,
    });
  };

  const handleSignIn = async () => {
    try {
      setSigningIn(true);
      setSignInError(null);
      const result = await instance.loginPopup(loginRequest);
      if (result?.account) {
        router.push("/dashboard");
      }
    } catch (e: any) {
      console.error("Sign-in failed:", e);
      if (e?.errorCode === "popup_window_error") {
        setSignInError(
          "Pop-up was blocked. Please allow pop-ups for this site and try again.",
        );
      } else if (e?.errorCode === "user_cancelled") {
        setSignInError(null);
      } else {
        setSignInError("Sign-in failed. Please try again.");
      }
    } finally {
      setSigningIn(false);
    }
  };

  const linkBase = "text-petrol-600 hover:text-petrol-950";
  const activeLink = "text-teal-700";

  const navProps = {
    pathname,
    activeSection,
    activeLink,
    linkBase,
    isAuthenticated,
  };

  return (
    <header
      className={`fixed top-0 right-0 left-0 z-50 transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300 ${
        scrolled
          ? "border-petrol-950/8 border-b bg-white/85 shadow-[0_8px_30px_-24px_rgba(8,47,54,0.35)] backdrop-blur-xl"
          : "bg-mint-50/75 border-b border-transparent backdrop-blur-sm"
      }`}
    >
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Brand */}
          <Link href="/" className="group flex items-center gap-3">
            {/* Use fixed height with auto width to prevent logo skew */}
            <Image
              src="/logo.svg"
              alt="Intune Documentation"
              width={36}
              height={36}
              className="h-9 w-auto rounded-md transition-transform group-hover:scale-105"
              priority
            />
            <div className="leading-tight">
              <span className="text-petrol-950 block text-base font-bold transition-colors group-hover:text-teal-700">
                Intune Documentation
              </span>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden items-center gap-8 md:flex">
            <NavLinks {...navProps} />
          </div>

          {/* Actions */}
          <div className="hidden items-center gap-3 md:flex">
            {isAuthenticated ? (
              <>
                <div className="flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1.5">
                  <User className="h-4 w-4 text-teal-700" />
                  <span className="text-petrol-800 max-w-[220px] truncate text-sm font-medium">
                    {userProfile?.displayName ||
                      accounts[0]?.username ||
                      "User"}
                  </span>
                </div>
                <Button
                  onClick={handleSignOut}
                  variant="ghost"
                  size="sm"
                  className="text-petrol-700 hover:bg-mint-100 rounded-full"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleSignIn}
                  variant="ghost"
                  size="sm"
                  disabled={signingIn}
                  className="text-petrol-800 rounded-full px-4 hover:bg-white"
                >
                  Sign in
                </Button>
                <Button
                  onClick={handleSignIn}
                  size="sm"
                  loading={signingIn}
                  className="rounded-full bg-teal-600 px-5 text-white shadow-none hover:bg-teal-700 focus:ring-teal-600"
                >
                  Get Started
                </Button>
                {signInError && (
                  <span className="max-w-[200px] text-xs text-red-500">
                    {signInError}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="text-petrol-800 cursor-pointer rounded-lg p-2 transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile panel */}
      {mobileOpen && (
        <div
          id="mobile-navigation"
          className="border-petrol-950/8 border-t bg-white/95 backdrop-blur-xl md:hidden"
        >
          <div className="w-full space-y-4 px-4 py-4 sm:px-6 lg:px-8">
            <NavLinks vertical {...navProps} />
            <div className="flex items-center gap-3">
              {isAuthenticated ? (
                <>
                  <div className="flex flex-1 items-center gap-2 rounded-full bg-teal-50 px-3 py-1.5">
                    <User className="h-4 w-4 text-teal-700" />
                    <span className="text-petrol-800 truncate text-sm font-medium">
                      {userProfile?.displayName ||
                        accounts[0]?.username ||
                        "User"}
                    </span>
                  </div>
                  <Button
                    onClick={handleSignOut}
                    variant="ghost"
                    size="sm"
                    className="text-petrol-700 flex-shrink-0 rounded-full"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </Button>
                </>
              ) : (
                <div className="flex w-full flex-col gap-2">
                  <div className="flex gap-2">
                    <Button
                      onClick={handleSignIn}
                      variant="ghost"
                      size="sm"
                      disabled={signingIn}
                      className="text-petrol-800 flex-1 rounded-full"
                    >
                      Sign in
                    </Button>
                    <Button
                      onClick={handleSignIn}
                      size="sm"
                      loading={signingIn}
                      className="flex-1 rounded-full bg-teal-600 text-white hover:bg-teal-700 focus:ring-teal-600"
                    >
                      Get Started
                    </Button>
                  </div>
                  {signInError && (
                    <span className="text-xs text-red-500">{signInError}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
