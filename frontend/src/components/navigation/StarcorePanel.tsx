import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { StarcoreData } from './types';

export function StarcorePanel(props: {
  visible: boolean;
  progress01: number;
  data?: StarcoreData;
}) {
  const { visible, data } = props;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 30, opacity: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="pointer-events-none absolute right-6 top-24 w-[340px]"
        >
          <div className="bg-black/35 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10">
              <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/70 font-semibold">
                {data?.title ?? 'Starcore'}
              </div>
              <div className="mt-1 text-base font-semibold text-white leading-snug">
                {data?.subtitle ?? '—'}
              </div>
            </div>

            <div className="px-5 py-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {(data?.metrics ?? []).map((m) => (
                  <div key={m.label} className="flex flex-col gap-1">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">{m.label}</div>
                    <div className="text-sm text-white/80 font-mono">{m.value}</div>
                  </div>
                ))}
              </div>

              {data?.hint && (
                <div className="mt-4 text-[11px] text-cyan-100/70 leading-relaxed">
                  {data.hint}
                </div>
              )}

              <div className="mt-4 h-[2px] w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: '0%' }}
                  animate={{ width: `${Math.round(props.progress01 * 100)}%` }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="h-full bg-cyan-300/50"
                />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
