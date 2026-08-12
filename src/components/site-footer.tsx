"use client";

import Link from "next/link";
import Image from "next/image";
import { Heart, Linkedin } from "lucide-react";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-petrol-950/6 bg-mint-50 text-petrol-600 border-t">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:px-10 lg:py-16">
        <div className="grid grid-cols-2 gap-10 sm:gap-12 lg:grid-cols-5">
          <div className="col-span-2 lg:col-span-1">
            <div className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 rounded-md"
              />
              <h3 className="text-petrol-950 text-base font-bold">
                Intune Documentation
              </h3>
            </div>
            <p className="text-petrol-600 mt-4 max-w-xs text-sm leading-6">
              Generate clear, audit-ready PDF documentation for Microsoft Intune
              configurations, quickly and securely.
            </p>
          </div>

          <div>
            <h4 className="text-petrol-950 text-xs font-bold tracking-[0.16em] uppercase">
              Product
            </h4>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <Link
                  href="/"
                  className="transition-colors hover:text-teal-700"
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard"
                  className="transition-colors hover:text-teal-700"
                >
                  Dashboard
                </Link>
              </li>
              <li>
                <a
                  href="/api/pdf/sample"
                  className="transition-colors hover:text-teal-700"
                >
                  Sample PDF
                </a>
              </li>
              <li>
                <Link
                  href="/#how-it-works"
                  className="transition-colors hover:text-teal-700"
                >
                  How it works
                </Link>
              </li>
              <li>
                <Link
                  href="/#features"
                  className="transition-colors hover:text-teal-700"
                >
                  Features
                </Link>
              </li>
              <li>
                <Link
                  href="/#faq"
                  className="transition-colors hover:text-teal-700"
                >
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-petrol-950 text-xs font-bold tracking-[0.16em] uppercase">
              Legal
            </h4>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <Link
                  href="/privacy-policy"
                  className="transition-colors hover:text-teal-700"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="transition-colors hover:text-teal-700"
                >
                  Terms of Use
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-petrol-950 text-xs font-bold tracking-[0.16em] uppercase">
              Connect
            </h4>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <a
                  href="https://www.linkedin.com/in/ugurkocde/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center gap-2 transition-colors hover:text-teal-700"
                >
                  <Linkedin className="h-4 w-4" />
                  LinkedIn
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-petrol-950 text-xs font-bold tracking-[0.16em] uppercase">
              Related Products
            </h4>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <a
                  href="https://entradocumentation.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-teal-700"
                >
                  EntraDocumentation
                </a>
              </li>
            </ul>
            <p className="text-petrol-600 mt-4 text-xs leading-5">
              Complete Microsoft 365 documentation ecosystem
            </p>
          </div>
        </div>
      </div>

      <div className="border-petrol-950/8 border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 sm:px-8 md:flex-row lg:px-10">
          <div className="text-petrol-600 text-xs">
            © {year} Ugur Creative Labs. All rights reserved.
          </div>
          <a
            href="https://www.linkedin.com/in/ugurkocde/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-petrol-600 inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm transition-colors hover:text-teal-700"
            aria-label="Visit Ugur's LinkedIn profile"
          >
            <span>Made with</span>
            <Heart className="h-4 w-4 fill-red-500 text-red-500" />
            <span>by Ugur</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
