"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface Section {
  id: string;
  label: string;
}

interface SectionNavigationProps {
  sections: Section[];
}

export function SectionNavigation({ sections }: SectionNavigationProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleClick = (id: string) => {
    setIsOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <nav className="mb-8 border border-slate-200 rounded-lg bg-slate-50" aria-label="Table of contents">
      {/* Mobile: collapsible dropdown */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 md:hidden cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="section-nav-list"
      >
        <span>Jump to section</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Desktop: always visible / Mobile: toggle */}
      <ul id="section-nav-list" className={`px-4 pb-3 space-y-1 md:py-3 ${isOpen ? "block" : "hidden md:block"}`}>
        {sections.map((section) => (
          <li key={section.id}>
            <button
              onClick={() => handleClick(section.id)}
              className="w-full text-left text-sm text-slate-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded transition-colors cursor-pointer"
            >
              {section.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
