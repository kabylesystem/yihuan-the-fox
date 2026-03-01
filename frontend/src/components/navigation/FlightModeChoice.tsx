import React from 'react';
import { AnimatePresence, motion } from 'motion/react';

interface FlightModeChoiceProps {
  visible: boolean;
  onRelight: () => void;
  onExplore: () => void;
}

export function FlightModeChoice({ visible, onRelight, onExplore }: FlightModeChoiceProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.98 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="pointer-events-auto w-[min(220px,86vw)] rounded-xl border border-cyan-300/20 bg-slate-950/70 p-2 backdrop-blur-xl shadow-[0_0_24px_rgba(56,189,248,0.16)]"
        >
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onExplore}
              className="rounded-lg border border-cyan-200/25 bg-cyan-500/10 px-2.5 py-1.5 text-center transition hover:border-cyan-200/45 hover:bg-cyan-400/15"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-100">Explore</p>
            </button>

            <button
              onClick={onRelight}
              className="rounded-lg border border-sky-200/25 bg-sky-500/10 px-2.5 py-1.5 text-center transition hover:border-sky-200/45 hover:bg-sky-400/15"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-100">Relight</p>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
