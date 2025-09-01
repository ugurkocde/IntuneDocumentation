"use client";

import Link from "next/link";
import { Heart, Linkedin } from "lucide-react";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-gray-900 text-gray-300 border-t border-white/10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <h3 className="text-white font-semibold text-lg">Intune Documentation</h3>
            <p className="mt-3 text-sm text-gray-400">
              Generate clear, audit‑ready PDF documentation for Microsoft Intune configurations — quickly and securely.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold text-sm tracking-wide">Product</h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/" className="hover:text-white transition-colors">Home</Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
              </li>
              <li>
                <a href="/api/pdf/sample" className="hover:text-white transition-colors">Sample PDF</a>
              </li>
              <li>
                <Link href="/#how-it-works" className="hover:text-white transition-colors">How it works</Link>
              </li>
              <li>
                <Link href="/#features" className="hover:text-white transition-colors">Features</Link>
              </li>
              <li>
                <Link href="/#faq" className="hover:text-white transition-colors">FAQ</Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold text-sm tracking-wide">Company</h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">Terms of Use</Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold text-sm tracking-wide">Connect</h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <a
                  href="https://www.linkedin.com/in/ugurkocde/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 hover:text-white transition-colors"
                >
                  <Linkedin className="w-4 h-4" />
                  LinkedIn
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="text-xs text-gray-400">
            © {year} Intune Documentation. All rights reserved.
          </div>
          <div className="inline-flex items-center gap-2 text-gray-400 text-sm">
            <span>Made with</span>
            <Heart className="w-4 h-4 text-red-500 fill-red-500" />
            <span>by Ugur</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
