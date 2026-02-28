"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Monitor,
  Shield,
  Database,
  FileText,
  Download,
  Server,
  X,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const STEP_COUNT = 5;
const CONNECTOR_COUNT = STEP_COUNT - 1;
// Total phases: node0, connector0, node1, connector1, ... node4
// = 5 nodes + 4 connectors = 9 phases
const TOTAL_PHASES = STEP_COUNT + CONNECTOR_COUNT; // 9
const PHASE_MS = 600; // ms per phase -- slower, more deliberate

interface NodeConfig {
  label: string;
  sublabel: string;
  icon: typeof Monitor;
  activeGradient: string;
  activeShadow: string;
  activeRing: string;
  textActive: string;
}

const nodes: NodeConfig[] = [
  {
    label: "You",
    sublabel: "Your browser",
    icon: Monitor,
    activeGradient: "bg-gradient-to-br from-cyan-400 to-cyan-600",
    activeShadow: "shadow-cyan-500/25",
    activeRing: "ring-cyan-400/30",
    textActive: "text-cyan-400",
  },
  {
    label: "Microsoft OAuth",
    sublabel: "Entra ID login",
    icon: Shield,
    activeGradient: "bg-gradient-to-br from-blue-400 to-blue-600",
    activeShadow: "shadow-blue-500/25",
    activeRing: "ring-blue-400/30",
    textActive: "text-blue-400",
  },
  {
    label: "Graph API",
    sublabel: "Read-only fetch",
    icon: Database,
    activeGradient: "bg-gradient-to-br from-indigo-400 to-indigo-600",
    activeShadow: "shadow-indigo-500/25",
    activeRing: "ring-indigo-400/30",
    textActive: "text-indigo-400",
  },
  {
    label: "PDF Generation",
    sublabel: "In your browser",
    icon: FileText,
    activeGradient: "bg-gradient-to-br from-emerald-400 to-emerald-600",
    activeShadow: "shadow-emerald-500/25",
    activeRing: "ring-emerald-400/30",
    textActive: "text-emerald-400",
  },
  {
    label: "Download",
    sublabel: "Stays on your device",
    icon: Download,
    activeGradient: "bg-gradient-to-br from-green-400 to-green-600",
    activeShadow: "shadow-green-500/25",
    activeRing: "ring-green-400/30",
    textActive: "text-green-400",
  },
];

/* ------------------------------------------------------------------ */
/*  Scroll-entrance variants                                           */
/* ------------------------------------------------------------------ */

const sectionVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0, 0, 0.2, 1] as const, staggerChildren: 0.1 },
  },
};

const childVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0, 0, 0.2, 1] as const },
  },
};

/* ------------------------------------------------------------------ */
/*  Phase helpers                                                      */
/* ------------------------------------------------------------------ */

// Phase 0 = node 0 active, phase 1 = dot traveling connector 0,
// phase 2 = node 1 active, phase 3 = dot traveling connector 1, etc.
function isNodeActive(nodeIndex: number, phase: number): boolean {
  const nodePhase = nodeIndex * 2;
  return phase >= nodePhase;
}

function isConnectorActive(connectorIndex: number, phase: number): boolean {
  const connectorPhase = connectorIndex * 2 + 1;
  return phase === connectorPhase;
}

/* ------------------------------------------------------------------ */
/*  FlowNode                                                           */
/* ------------------------------------------------------------------ */

function FlowNode({
  config,
  isActive,
  reducedMotion,
}: {
  config: NodeConfig;
  isActive: boolean;
  reducedMotion: boolean;
}) {
  const Icon = config.icon;
  const showActive = isActive || reducedMotion;

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Icon container with glow ring wrapper */}
      <div className="relative">
        {/* Glow ring */}
        {!reducedMotion && (
          <div
            className={`absolute -inset-2 rounded-2xl ring-2 transition-opacity duration-500 ease-out ${config.activeRing} ${
              showActive ? "opacity-100" : "opacity-0"
            }`}
          />
        )}

        <div
          className={`relative w-14 h-14 md:w-16 md:h-16 rounded-xl flex items-center justify-center transition-all duration-500 ease-out ${
            showActive
              ? `${config.activeGradient} shadow-lg ${config.activeShadow} scale-100`
              : "bg-white/5 border border-white/10 scale-[0.92]"
          }`}
        >
          <Icon
            className={`w-6 h-6 md:w-7 md:h-7 transition-colors duration-500 ease-out ${
              showActive ? "text-white" : "text-white/40"
            }`}
          />
        </div>
      </div>

      {/* Label */}
      <div className="text-center">
        <p
          className={`text-xs md:text-sm font-semibold transition-colors duration-500 ease-out ${
            showActive ? config.textActive : "text-white/40"
          }`}
        >
          {config.label}
        </p>
        <p
          className={`text-[10px] md:text-xs transition-colors duration-500 ease-out ${
            showActive ? "text-white/70" : "text-white/25"
          }`}
        >
          {config.sublabel}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FlowConnector -- track + single-direction dot via CSS              */
/* ------------------------------------------------------------------ */

function FlowConnector({
  isActive,
  direction,
  reducedMotion,
}: {
  isActive: boolean;
  direction: "horizontal" | "vertical";
  reducedMotion: boolean;
}) {
  const isHorizontal = direction === "horizontal";
  // Key forces re-mount when isActive flips to true,
  // so the animation plays once from start.
  const dotKey = isActive ? "active" : "inactive";

  return (
    <div
      className={`relative flex-shrink-0 ${
        isHorizontal
          ? "w-12 md:w-16 lg:w-20 self-center"
          : "h-10 self-center"
      }`}
      // Match height to the icon box so connectors align with icons
      style={isHorizontal ? { height: 2 } : { width: 2 }}
    >
      {/* Track line */}
      <div
        className={`absolute ${
          isHorizontal
            ? "inset-x-0 top-1/2 h-[2px] -translate-y-1/2"
            : "inset-y-0 left-1/2 w-[2px] -translate-x-1/2"
        } bg-white/20 rounded-full`}
      />

      {/* Traveling dot */}
      {!reducedMotion && (
        <div
          key={dotKey}
          className={`absolute w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.7)] ${
            isActive ? "opacity-100" : "opacity-0"
          } ${
            isHorizontal
              ? "top-1/2 -translate-y-1/2 -translate-x-1/2 animate-[travel-dot-h_600ms_ease-in-out_forwards]"
              : "left-1/2 -translate-x-1/2 -translate-y-1/2 animate-[travel-dot-v_600ms_ease-in-out_forwards]"
          }`}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  BlockedPath                                                        */
/* ------------------------------------------------------------------ */

function BlockedPath({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <motion.div
      className="flex flex-col items-center gap-3 mt-6 md:mt-8"
      variants={childVariants}
    >
      {/* Dashed line */}
      <div
        className="w-[2px] h-12 md:h-16"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, rgb(239 68 68 / 0.4) 0px, rgb(239 68 68 / 0.4) 6px, transparent 6px, transparent 12px)",
        }}
        aria-hidden="true"
      />

      {/* Blocked server node */}
      <motion.div
        className="relative flex flex-col items-center gap-2"
        initial={{ opacity: reducedMotion ? 0.6 : 0 }}
        {...(!reducedMotion && {
          whileInView: { opacity: 0.6 },
          viewport: { once: true },
          transition: { duration: 0.5, delay: 0.8 },
        })}
      >
        <div className="relative w-14 h-14 md:w-16 md:h-16 rounded-xl bg-red-950/30 border border-red-500/20 flex items-center justify-center">
          <Server className="w-6 h-6 md:w-7 md:h-7 text-red-400/40" />
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: reducedMotion ? 1 : 0, scale: reducedMotion ? 1 : 0.5 }}
            {...(!reducedMotion && {
              whileInView: { opacity: 1, scale: 1 },
              viewport: { once: true },
              transition: { duration: 0.3, delay: 1.1 },
            })}
          >
            <X className="w-8 h-8 md:w-10 md:h-10 text-red-500/60" strokeWidth={2.5} />
          </motion.div>
        </div>
        <p className="text-xs md:text-sm font-semibold text-red-400/60">
          External Server
        </p>
      </motion.div>

      {/* Annotation */}
      <motion.p
        className="font-mono text-xs md:text-sm text-white/60 bg-white/5 px-3 py-1.5 rounded-full border border-white/10"
        initial={{ opacity: reducedMotion ? 1 : 0, y: reducedMotion ? 0 : 8 }}
        {...(!reducedMotion && {
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true },
          transition: { duration: 0.4, delay: 1.3 },
        })}
      >
        Data never leaves your browser
      </motion.p>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Desktop horizontal flow                                            */
/* ------------------------------------------------------------------ */

function DesktopFlow({
  phase,
  reducedMotion,
}: {
  phase: number;
  reducedMotion: boolean;
}) {
  return (
    <div className="hidden md:flex items-start justify-center">
      {nodes.map((node, i) => (
        <div key={node.label} className="flex items-start">
          <FlowNode
            config={node}
            isActive={isNodeActive(i, phase)}
            reducedMotion={reducedMotion}
          />
          {i < CONNECTOR_COUNT && (
            <div className="flex items-center" style={{ height: 64, paddingTop: 0 }}>
              {/* Align connector with the icon box center (64px = md:h-16) */}
              <FlowConnector
                isActive={isConnectorActive(i, phase)}
                direction="horizontal"
                reducedMotion={reducedMotion}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mobile vertical flow                                               */
/* ------------------------------------------------------------------ */

function MobileFlow({
  phase,
  reducedMotion,
}: {
  phase: number;
  reducedMotion: boolean;
}) {
  return (
    <div className="flex md:hidden flex-col items-center">
      {nodes.map((node, i) => (
        <div key={node.label} className="flex flex-col items-center">
          <FlowNode
            config={node}
            isActive={isNodeActive(i, phase)}
            reducedMotion={reducedMotion}
          />
          {i < CONNECTOR_COUNT && (
            <FlowConnector
              isActive={isConnectorActive(i, phase)}
              direction="vertical"
              reducedMotion={reducedMotion}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main DataFlowDiagram                                               */
/* ------------------------------------------------------------------ */

export function DataFlowDiagram() {
  const prefersReduced = useReducedMotion();
  const [hasMounted, setHasMounted] = useState(false);
  const [phase, setPhase] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => setHasMounted(true), []);
  const reducedMotion = hasMounted ? (prefersReduced ?? false) : true;

  const handleMouseEnter = useCallback(() => setIsPaused(true), []);
  const handleMouseLeave = useCallback(() => setIsPaused(false), []);

  useEffect(() => {
    if (reducedMotion || isPaused) return;

    // Determine delay for this phase
    const isLastPhase = phase === TOTAL_PHASES - 1;
    const isFirstPhase = phase === 0;
    let delay = PHASE_MS;
    if (isFirstPhase) delay = PHASE_MS * 1.5; // linger on first node
    if (isLastPhase) delay = PHASE_MS * 2; // linger on last node before reset

    const timer = setTimeout(() => {
      setPhase((prev) => (prev + 1) % TOTAL_PHASES);
    }, delay);

    return () => clearTimeout(timer);
  }, [reducedMotion, isPaused, phase]);

  return (
    <section className="relative py-24 bg-gradient-to-b from-slate-900 to-blue-950 overflow-hidden">
      <div className="absolute inset-0 bg-grid-white/[0.02]" aria-hidden="true" />

      <motion.div
        className="container mx-auto px-4 sm:px-6 lg:px-8 relative"
        variants={sectionVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
      >
        <motion.div className="max-w-2xl mx-auto text-center mb-12 md:mb-16" variants={childVariants}>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Where Does Your Data Go?
          </h2>
          <p className="text-base md:text-lg text-blue-200/70">
            Your Intune data flows directly from Microsoft to your browser.
            No intermediary servers. No data storage.
          </p>
        </motion.div>

        <motion.div
          className="max-w-5xl mx-auto"
          variants={childVariants}
          role="img"
          aria-label="Data flow architecture diagram showing 5 steps: Your browser connects to Microsoft OAuth, fetches from Graph API, generates PDF in the browser, and downloads to your device. No data is sent to any external server."
          onPointerEnter={handleMouseEnter}
          onPointerLeave={handleMouseLeave}
          onFocus={handleMouseEnter}
          onBlur={handleMouseLeave}
        >
          <DesktopFlow phase={phase} reducedMotion={reducedMotion} />
          <MobileFlow phase={phase} reducedMotion={reducedMotion} />
          <BlockedPath reducedMotion={reducedMotion} />
        </motion.div>

        <motion.div className="text-center mt-10 md:mt-12" variants={childVariants}>
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-sm font-semibold text-emerald-400">
              Server involvement: zero
            </span>
          </span>
          <p className="mt-3 text-sm text-blue-200/50 max-w-md mx-auto">
            PDF and DOCX generation happens entirely in your browser using client-side JavaScript. Nothing is uploaded, stored, or processed remotely.
          </p>
        </motion.div>
      </motion.div>
    </section>
  );
}
