import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

export function NavigationHUD(props: {
  enabled: boolean;
  primary: string;
  secondary?: string;
}) {
  return (
    <AnimatePresence>
      {props.enabled && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="pointer-events-none absolute left-0 right-0 bottom-10 flex justify-center"
        >
          <div className="max-w-[720px] px-5 py-3 rounded-2xl border border-white/10 bg-black/30 backdrop-blur-md">
            <div className="text-sm text-white/85 font-medium tracking-tight">{props.primary}</div>
            {props.secondary && (
              <div className="mt-0.5 text-[12px] text-cyan-100/65">{props.secondary}</div>
            )}
            <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-white/30">
              Voice interface pending — simulation mode
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
