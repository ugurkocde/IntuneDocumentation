"use client";

import { useMsal } from "@azure/msal-react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { User, LogOut, Menu, X, LogIn } from "lucide-react";
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

const NavLinks = memo(function NavLinks({ vertical = false, pathname, activeSection, activeLink, linkBase, isAuthenticated }: NavLinksProps) {
  return (
    <nav className={vertical ? "flex flex-col gap-3" : "flex items-center gap-6"}>
      <Link
        href="/"
        prefetch
        className={`text-sm font-medium transition-colors ${
          pathname === "/" ? activeLink : linkBase
        }`}
      >
        Home
      </Link>
      <Link
        href="/#how-it-works"
        className={`text-sm font-medium transition-colors ${activeSection === "how-it-works" ? activeLink : linkBase}`}
      >
        How it works
      </Link>
      <Link
        href="/#features"
        className={`text-sm font-medium transition-colors ${activeSection === "features" ? activeLink : linkBase}`}
      >
        Features
      </Link>
      <Link
        href="/#faq"
        className={`text-sm font-medium transition-colors ${activeSection === "faq" ? activeLink : linkBase}`}
      >
        FAQ
      </Link>
      {isAuthenticated && (
        <Link
          href="/dashboard"
          prefetch
          className={`text-sm font-medium transition-colors ${
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
      { rootMargin: "-40% 0px -50% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
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
        setSignInError("Pop-up was blocked. Please allow pop-ups for this site and try again.");
      } else if (e?.errorCode === "user_cancelled") {
        setSignInError(null);
      } else {
        setSignInError("Sign-in failed. Please try again.");
      }
    } finally {
      setSigningIn(false);
    }
  };

  const linkBase = onHome && !scrolled ? "text-white/90 hover:text-white" : "text-slate-600 hover:text-slate-900";
  const activeLink = onHome && !scrolled ? "text-white" : "text-blue-600";

  const navProps = { pathname, activeSection, activeLink, linkBase, isAuthenticated };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        onHome && !scrolled
          ? 'bg-transparent border-transparent'
          : 'backdrop-blur supports-[backdrop-filter]:bg-white/85 bg-white border-b border-slate-200/80'
      }`}
    >
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-3 group">
            {/* Use fixed height with auto width to prevent logo skew */}
            <img
              src="/logo.png"
              alt="Intune Documentation"
              className="h-9 w-auto rounded-md group-hover:scale-105 transition-transform"
              loading="eager"
              decoding="async"
            />
            <div className="leading-tight">
              <span className={`block text-base font-bold transition-colors ${onHome && !scrolled ? 'text-white group-hover:text-white' : 'text-slate-900 group-hover:text-blue-700'}`}>
                Intune Documentation
              </span>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            <NavLinks {...navProps} />
          </div>

          {/* Actions */}
          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${onHome && !scrolled ? 'bg-white/10' : 'bg-slate-50'}`}>
                  <User className={`w-4 h-4 ${onHome && !scrolled ? 'text-white/80' : 'text-slate-500'}`} />
                  <span className={`text-sm font-medium max-w-[220px] truncate ${onHome && !scrolled ? 'text-white' : 'text-slate-700'}`}>
                    {userProfile?.displayName || accounts[0]?.username || "User"}
                  </span>
                </div>
                <Button onClick={handleSignOut} variant="ghost" size="sm" className={onHome && !scrolled ? 'text-white hover:bg-white/10 hover:text-white' : ''}>
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <Button onClick={handleSignIn} size="sm" loading={signingIn} className={onHome && !scrolled ? 'bg-white text-slate-900 hover:bg-white/90' : ''}>
                  <LogIn className="w-4 h-4" />
                  Sign in
                </Button>
                {signInError && (
                  <span className="text-xs text-red-500 max-w-[200px]">{signInError}</span>
                )}
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className={`md:hidden p-2 rounded-lg cursor-pointer ${onHome && !scrolled ? 'text-white hover:bg-white/10' : 'text-slate-700 hover:bg-slate-100'}`}
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile panel */}
      {mobileOpen && (
        <div className={`md:hidden backdrop-blur ${onHome && !scrolled ? 'bg-slate-900/60 border-white/10' : 'bg-white/95 border-slate-200'} border-t`}>
          <div className="w-full px-4 sm:px-6 lg:px-8 py-4 space-y-4">
            <NavLinks vertical {...navProps} />
            <div className="flex items-center gap-3">
              {isAuthenticated ? (
                <>
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg flex-1 ${onHome && !scrolled ? 'bg-white/10' : 'bg-slate-50'}`}>
                    <User className={`w-4 h-4 ${onHome && !scrolled ? 'text-white/80' : 'text-slate-500'}`} />
                    <span className={`text-sm font-medium truncate ${onHome && !scrolled ? 'text-white' : 'text-slate-700'}`}>
                      {userProfile?.displayName || accounts[0]?.username || "User"}
                    </span>
                  </div>
                  <Button onClick={handleSignOut} variant="ghost" size="sm" className={`flex-shrink-0 ${onHome && !scrolled ? 'text-white hover:bg-white/10 hover:text-white' : ''}`}>
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </Button>
                </>
              ) : (
                <div className="flex flex-col gap-1">
                  <Button onClick={handleSignIn} size="sm" loading={signingIn} className={`flex-shrink-0 ${onHome && !scrolled ? 'bg-white text-slate-900 hover:bg-white/90' : ''}`}>
                    <LogIn className="w-4 h-4" />
                    Sign in
                  </Button>
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
