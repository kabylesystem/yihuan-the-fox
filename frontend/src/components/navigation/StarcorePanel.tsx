import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, RotateCcw } from 'lucide-react';
import { FlightModeBranch } from './flightTypes';

interface StarcorePanelProps {
  branch: FlightModeBranch;
  targetLabel?: string;
  onOpenSession: () => void;
  onReturn: () => void;
}

export function StarcorePanel({ branch, targetLabel, onOpenSession, onReturn }: StarcorePanelProps) {
  const isExplore = branch === 'explore';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex flex-col items-center gap-6 text-center"
    >
      {/* Big icon */}
      <motion.div
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
        className="w-20 h-20 rounded-full bg-cyan-500/15 border border-cyan-400/25 flex items-center justify-center"
      >
        {isExplore
          ? <Sparkles size={36} className="text-cyan-300" />
          : <RotateCcw size={36} className="text-cyan-300" />
        }
      </motion.div>

      {/* Title */}
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">
          {isExplore ? 'New Territory Found' : 'Fading Memory Detected'}
        </h2>
        <p className="text-base text-white/50 max-w-xs">
          {isExplore
            ? 'Practice new words to expand your nebula.'
            : `Reinforce "${targetLabel || 'this memory'}" before it fades.`
          }
        </p>
      </div>

      {/* CTA */}
      <button
        onClick={onOpenSession}
        className="px-8 py-3.5 rounded-2xl bg-cyan-500/20 border border-cyan-400/30 text-cyan-100 font-semibold text-base hover:bg-cyan-400/25 hover:border-cyan-300/40 transition-all shadow-[0_0_30px_rgba(6,182,212,0.2)]"
      >
        {isExplore ? 'Start Session' : 'Review Now'}
      </button>

      <button
        onClick={onReturn}
        className="text-sm text-white/35 hover:text-white/60 transition-colors"
      >
        Back to nebula
      </button>
    </motion.div>
  );
}
