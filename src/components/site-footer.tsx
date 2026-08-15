"use client";

import Link from "next/link";
import Image from "next/image";
import { Github, Linkedin } from "lucide-react";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-petrol-950/6 bg-mint-50 text-petrol-600 border-t">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:px-10 lg:py-16">
        <div className="grid grid-cols-2 gap-10 sm:gap-12 lg:grid-cols-5">
          <div className="col-span-2 lg:col-span-1">
            <div className="flex items-center gap-3">
              <Image
                src="/logo.svg"
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
              <li>
                <Link
                  href="/impressum"
                  className="transition-colors hover:text-teal-700"
                >
                  Legal Notice (Impressum)
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
                  href="https://www.linkedin.com/company/ugurlabs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center gap-2 transition-colors hover:text-teal-700"
                >
                  <Linkedin className="h-4 w-4" />
                  LinkedIn
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/ugurkocde/IntuneDocumentation"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center gap-2 transition-colors hover:text-teal-700"
                >
                  <Github className="h-4 w-4" />
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/ugurkocde/IntuneDocumentation#self-host-with-docker"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 items-center transition-colors hover:text-teal-700"
                >
                  Self-hosting guide
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-petrol-950 text-xs font-bold tracking-[0.16em] uppercase">
              Company
            </h4>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <a
                  href="https://ugurlabs.com/about"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-teal-700"
                >
                  About Ugurlabs
                </a>
              </li>
              <li>
                <a
                  href="https://ugurlabs.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-teal-700"
                >
                  All products
                </a>
              </li>
              <li>
                <a
                  href="mailto:support@ugurlabs.com"
                  className="transition-colors hover:text-teal-700"
                >
                  Contact
                </a>
              </li>
            </ul>
            <p className="text-petrol-600 mt-4 text-xs leading-5">
              Practical tools for Microsoft cloud administration
            </p>
          </div>
        </div>
      </div>

      <div className="border-petrol-950/8 border-t">
        <div className="mx-auto flex max-w-6xl items-center justify-center px-5 py-6 sm:px-8 lg:px-10">
          <div className="text-petrol-600 text-xs">
            © {year} UgurLabs. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
}
