"use client";

import { useMsal } from "@azure/msal-react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { User, LogOut, Home, FileText } from "lucide-react";
import { Button } from "~/components/ui/button";
import { useUserProfile } from "~/hooks/use-user-profile";

export function NavigationHeader() {
  const { instance, accounts } = useMsal();
  const router = useRouter();
  const pathname = usePathname();
  const { userProfile } = useUserProfile();
  const isAuthenticated = accounts.length > 0;

  const handleSignOut = () => {
    instance.logoutRedirect({
      postLogoutRedirectUri: window.location.origin,
    });
  };

  return (
    <header className="bg-white shadow-sm border-b border-slate-200">
      <div className="max-w-8xl mx-auto px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo and Brand */}
          <Link href="/" className="flex items-center gap-3 group">
            <Image
              src="/logo.png"
              alt="Intune Documentation"
              width={40}
              height={40}
              className="group-hover:scale-105 transition-transform"
            />
            <div>
              <h1 className="text-xl font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                Intune Documentation
              </h1>
            </div>
          </Link>

          {/* Navigation Links */}
          {isAuthenticated && (
            <nav className="flex items-center gap-6">
              <Link
                href="/"
                className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                  pathname === "/" 
                    ? "text-blue-600" 
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Home className="w-4 h-4" />
                Home
              </Link>
              <Link
                href="/dashboard"
                className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                  pathname === "/dashboard" 
                    ? "text-blue-600" 
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <FileText className="w-4 h-4" />
                Dashboard
              </Link>
              {/* Future docs link */}
              {/* <Link
                href="/docs"
                className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                  pathname === "/docs" 
                    ? "text-blue-600" 
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <BookOpen className="w-4 h-4" />
                Documentation
              </Link> */}
            </nav>
          )}

          {/* User Section */}
          {isAuthenticated ? (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg">
                <User className="w-4 h-4 text-slate-500" />
                <span className="text-sm text-slate-700 font-medium">
                  {userProfile?.displayName || accounts[0]?.username || "User"}
                </span>
              </div>
              <Button onClick={handleSignOut} variant="ghost" size="sm">
                <LogOut className="w-4 h-4" />
                Sign Out
              </Button>
            </div>
          ) : (
            <div className="text-sm text-slate-600">
              Not signed in
            </div>
          )}
        </div>
      </div>
    </header>
  );
}