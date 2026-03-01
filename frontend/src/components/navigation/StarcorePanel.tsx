import React from 'react';
import { motion } from 'motion/react';
import { FlightModeBranch } from './flightTypes';

interface StarcorePanelProps {
  branch: FlightModeBranch;
  targetLabel?: string;
  onOpenSession: () => void;
}

export function StarcorePanel({ branch, targetLabel, onOpenSession }: StarcorePanelProps) {
  const title = branch === 'explore' ? 'Starcore: Frontier Synthesis' : 'Starcore: Memory Recalibration';
  const subtitle =
    branch === 'explore'
      ? 'Nebula growth sequence online. Stabilize new linguistic territory.'
      : 'Fading signal locked. Run a targeted review to restore retention.';

  return (
    <motion.div
      initial={{ x: 18, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="h-full overflow-y-auto p-6"
    >
      <div className="rounded-2xl border border-cyan-300/20 bg-slate-950/65 p-5 backdrop-blur-2xl shadow-[0_20px_60px_rgba(14,116,144,0.35)]">
        <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/60">Starcore Console</p>
        <h4 className="mt-2 text-base font-semibold text-cyan-50">{title}</h4>
        <p className="mt-2 text-xs leading-relaxed text-cyan-100/70">{subtitle}</p>

        <div className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-100/60">Target</p>
          <p className="mt-1 text-sm font-medium text-cyan-50">{targetLabel ?? 'Autonomous selection in progress'}</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onOpenSession}
            className="rounded-lg border border-cyan-300/30 bg-cyan-400/15 px-3 py-2 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-300/20"
          >
            Open Session
          </button>
          <button className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-white/80 transition hover:bg-white/10">
            Hold Orbit
          </button>
        </div>
      </div>
    </motion.div>
  );
}
