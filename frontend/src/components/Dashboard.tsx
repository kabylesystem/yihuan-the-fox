import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import type { Neuron, Synapse, Category } from '../types';

interface DashboardProps {
  isOpen: boolean;
  onClose: () => void;
  neurons: Neuron[];
  synapses: Synapse[];
}

const CAT_LABELS: Record<Category, string> = {
  daily: 'Daily',
  social: 'Social',
  travel: 'Travel',
  work: 'Work',
  academic: 'Academic',
  coding: 'Coding',
  other: 'Other',
};

export const Dashboard: React.FC<DashboardProps> = ({ isOpen, onClose, neurons, synapses }) => {
  if (!isOpen) return null;

  const totalNodes = neurons.length;
  const totalLinks = synapses.length;
  const avgMastery = totalNodes > 0
    ? Math.round((neurons.reduce((s, n) => s + n.strength, 0) / totalNodes) * 100)
    : 0;
  const sentences = neurons.filter(n => n.nodeKind === 'sentence').length;
  const vocab = neurons.filter(n => n.nodeKind === 'vocab').length;
  const grammar = neurons.filter(n => n.nodeKind === 'grammar').length;

  // Category breakdown
  const byCat: Partial<Record<Category, Neuron[]>> = {};
  neurons.forEach(n => { (byCat[n.category] ||= []).push(n); });
  const catEntries = Object.entries(byCat)
    .sort(([, a], [, b]) => b.length - a.length) as [Category, Neuron[]][];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-[420px] max-w-[calc(100vw-2rem)] bg-white/[0.07] backdrop-blur-2xl border border-white/[0.14] rounded-[28px] shadow-[0_20px_60px_rgba(0,0,0,0.5)] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
              <h2 className="text-lg font-semibold text-white tracking-tight">Dashboard</h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-white/[0.10] text-white/40 hover:text-white/70 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 pb-6 space-y-5">
              {/* Top stats row */}
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="Nodes" value={totalNodes} />
                <StatCard label="Links" value={totalLinks} />
                <StatCard label="Mastery" value={`${avgMastery}%`} />
              </div>

              {/* Node types */}
              <div className="flex gap-2">
                <TypePill label="Sentences" count={sentences} color="blue" />
                <TypePill label="Vocab" count={vocab} color="cyan" />
                <TypePill label="Grammar" count={grammar} color="purple" />
              </div>

              {/* Category breakdown */}
              {catEntries.length > 0 && (
                <div className="space-y-2.5">
                  <p className="text-[11px] uppercase tracking-widest text-white/30 font-medium">By Category</p>
                  {catEntries.map(([cat, items]) => {
                    const catMastery = Math.round((items.reduce((s, n) => s + n.strength, 0) / items.length) * 100);
                    return (
                      <div key={cat} className="flex items-center gap-3">
                        <span className="text-xs text-white/50 w-16 text-right">{CAT_LABELS[cat]}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${catMastery}%` }}
                            transition={{ duration: 0.6, delay: 0.1 }}
                            className="h-full rounded-full bg-gradient-to-r from-blue-500/80 to-cyan-400/80"
                          />
                        </div>
                        <span className="text-xs text-white/35 w-8 font-mono">{items.length}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Empty state */}
              {totalNodes === 0 && (
                <p className="text-sm text-white/30 text-center py-4">
                  Start speaking to build your knowledge graph.
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white/[0.05] border border-white/[0.08] rounded-2xl p-3 text-center">
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-white/35 mt-0.5">{label}</p>
    </div>
  );
}

function TypePill({ label, count, color }: { label: string; count: number; color: 'blue' | 'cyan' | 'purple' }) {
  const colors = {
    blue: 'bg-blue-500/15 border-blue-400/20 text-blue-300',
    cyan: 'bg-cyan-500/15 border-cyan-400/20 text-cyan-300',
    purple: 'bg-purple-500/15 border-purple-400/20 text-purple-300',
  };
  return (
    <div className={`flex-1 text-center py-2 rounded-xl border text-xs font-medium ${colors[color]}`}>
      {count} {label}
    </div>
  );
}
