"use client";

import { useMsal } from "@azure/msal-react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { User, LogOut, Menu, X, LogIn } from "lucide-react";
import { Button } from "~/components/ui/button";
import { useUserProfile } from "~/hooks/use-user-profile";
import { useState } from "react";
import { loginRequest } from "~/lib/msal-config";

export function NavigationHeader() {
  const { instance, accounts } = useMsal();
  const pathname = usePathname();
  const router = useRouter();
  const { userProfile } = useUserProfile();
  const isAuthenticated = accounts.length > 0;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  const handleSignOut = () => {
    void instance.logoutRedirect({
      postLogoutRedirectUri: window.location.origin,
    });
  };

  const handleSignIn = async () => {
    try {
      setSigningIn(true);
      const result = await instance.loginPopup(loginRequest);
      if (result?.account) {
        router.push("/dashboard");
      }
    } catch (e) {
      console.error("Sign-in failed:", e);
    } finally {
      setSigningIn(false);
    }
  };

  const NavLinks = () => (
    <nav className="flex items-center gap-6">
      <Link
        href="/"
        className={`text-sm font-medium transition-colors ${
          pathname === "/" ? "text-blue-600" : "text-slate-600 hover:text-slate-900"
        }`}
      >
        Home
      </Link>
      {isAuthenticated && (
        <Link
          href="/dashboard"
          className={`text-sm font-medium transition-colors ${
            pathname === "/dashboard" ? "text-blue-600" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Dashboard
        </Link>
      )}
    </nav>
  );

  return (
    <header className="sticky top-0 z-50 backdrop-blur supports-[backdrop-filter]:bg-white/85 bg-white border-b border-slate-200/80">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-3 group">
            <Image
              src="/logo.png"
              alt="Intune Documentation"
              width={36}
              height={36}
              className="rounded-md group-hover:scale-105 transition-transform"
            />
            <div className="leading-tight">
              <span className="block text-base font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                Intune Documentation
              </span>
              <span className="block text-[11px] tracking-wide text-slate-500">PDF Generator</span>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            <NavLinks />
          </div>

          {/* Actions */}
          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg">
                  <User className="w-4 h-4 text-slate-500" />
                  <span className="text-sm text-slate-700 font-medium max-w-[220px] truncate">
                    {userProfile?.displayName || accounts[0]?.username || "User"}
                  </span>
                </div>
                <Button onClick={handleSignOut} variant="ghost" size="sm">
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </Button>
              </>
            ) : (
              <>
                <Button onClick={handleSignIn} size="sm" loading={signingIn}>
                  <LogIn className="w-4 h-4" />
                  Sign in
                </Button>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-700 cursor-pointer"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile panel */}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white/95 backdrop-blur">
          <div className="w-full px-4 sm:px-6 lg:px-8 py-4 space-y-4">
            <NavLinks />
            <div className="flex items-center gap-3">
              {isAuthenticated ? (
                <>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg flex-1">
                    <User className="w-4 h-4 text-slate-500" />
                    <span className="text-sm text-slate-700 font-medium truncate">
                      {userProfile?.displayName || accounts[0]?.username || "User"}
                    </span>
                  </div>
                  <Button onClick={handleSignOut} variant="ghost" size="sm" className="flex-shrink-0">
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={handleSignIn} size="sm" loading={signingIn} className="flex-shrink-0">
                    <LogIn className="w-4 h-4" />
                    Sign in
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
