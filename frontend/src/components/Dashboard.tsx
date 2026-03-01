import React, { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, ShieldAlert, X } from 'lucide-react';

interface DashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CategoryRow {
  name: string;
  nodes: number;
  coverage: number;
  stability: number;
}

const CATEGORY_ROWS: CategoryRow[] = [
  { name: 'Daily', nodes: 2156, coverage: 92, stability: 88 },
  { name: 'Coding', nodes: 1450, coverage: 88, stability: 75 },
  { name: 'Work', nodes: 1240, coverage: 85, stability: 72 },
  { name: 'Travel', nodes: 945, coverage: 78, stability: 65 },
  { name: 'Social', nodes: 867, coverage: 73, stability: 58 },
  { name: 'Academic', nodes: 734, coverage: 65, stability: 48 },
  { name: 'Other', nodes: 421, coverage: 58, stability: 35 },
];

const CORE_STATS = {
  vocabulary: {
    label: 'Vocabulary Mastery',
    value: 4250,
    target: 5000,
    growth: 18,
    cefr: [
      { level: 'A1-A2', percentage: 11 },
      { level: 'B1-B2', percentage: 44 },
      { level: 'C1-C2', percentage: 45 },
    ],
  },
  grammar: {
    label: 'Grammar',
    accuracy: 87,
    trend: 5,
    fixedThisWeek: 3,
  },
  speaking: {
    label: 'Speaking',
    wpm: 145,
    trend: 12,
    cohesion: 78,
  },
  retention: {
    label: 'Memory Retention',
    value: 76,
    trend: 3,
    atRisk: 45,
  },
};

const CEFRMiniBar: React.FC<{ parts: { level: string; percentage: number }[] }> = ({ parts }) => {
  return (
    <div className="space-y-1.5">
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className="flex h-full">
          <div className="bg-cyan-300/90" style={{ width: `${parts[0]?.percentage ?? 0}%` }} />
          <div className="bg-blue-400/90" style={{ width: `${parts[1]?.percentage ?? 0}%` }} />
          <div className="bg-blue-500/90" style={{ width: `${parts[2]?.percentage ?? 0}%` }} />
        </div>
      </div>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-white/45">
        {parts.map((part) => (
          <span key={part.level}>
            {part.level} {part.percentage}%
          </span>
        ))}
      </div>
    </div>
  );
};

const SegmentedStatusBar: React.FC<{ stable: number; atRisk: number; unexplored: number }> = ({ stable, atRisk, unexplored }) => {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/8 border border-white/10">
      <div className="flex h-full">
        <div className="bg-cyan-300/90" style={{ width: `${stable}%` }} />
        <div className="bg-amber-300/90" style={{ width: `${atRisk}%` }} />
        <div className="bg-white/25" style={{ width: `${unexplored}%` }} />
      </div>
    </div>
  );
};

const CompactKpiCard: React.FC<{
  title: string;
  value: string;
  subtitle: string;
  support: string;
  micro?: React.ReactNode;
}> = ({ title, value, subtitle, support, micro }) => {
  return (
    <section className="rounded-2xl border border-white/[0.12] bg-white/[0.06] backdrop-blur-xl p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">{title}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      <p className="text-[11px] text-white/55">{subtitle}</p>
      {micro && <div className="mt-3">{micro}</div>}
      <p className="mt-3 rounded-lg border border-white/[0.12] bg-white/[0.04] px-2.5 py-2 text-xs text-white/70">{support}</p>
    </section>
  );
};

export const Dashboard: React.FC<DashboardProps> = ({ isOpen, onClose }) => {
  const now = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date()),
    []
  );

  const categoryRows = useMemo(() => {
    return CATEGORY_ROWS.map((row) => {
      const atRisk = Math.max(0, row.coverage - row.stability);
      const unexplored = Math.max(0, 100 - row.coverage);
      const riskNodes = Math.round((row.nodes * atRisk) / 100);
      return { ...row, atRisk, unexplored, riskNodes };
    }).sort((a, b) => b.atRisk - a.atRisk || b.riskNodes - a.riskNodes);
  }, []);

  const totalRiskNodes = useMemo(
    () => categoryRows.reduce((sum, row) => sum + row.riskNodes, 0),
    [categoryRows]
  );
  const topRiskRows = categoryRows.slice(0, 3);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35"
        >
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.985 }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex h-[90vh] w-[96%] max-w-[1240px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-black/80 text-white shadow-2xl backdrop-blur-2xl"
          >
            <header className="flex flex-shrink-0 items-start justify-between border-b border-white/10 px-5 py-4 md:px-6">
              <div>
                <h2 className="text-xl font-bold text-white md:text-2xl">Neural Ecosystem Dashboard</h2>
                <p className="mt-1 text-xs text-white/45">Learning control center · scan priorities in 5 seconds</p>
              </div>

              <div className="ml-4 flex items-start gap-2 md:gap-3">
                <div className="hidden rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-right md:block">
                  <p className="text-[10px] uppercase tracking-widest text-white/45">Date Range</p>
                  <p className="mt-0.5 text-xs text-white/75">Last 30 days · Updated {now}</p>
                </div>
                <button className="rounded-lg border border-amber-300/35 bg-amber-400/15 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-400/25">
                  Review At-Risk Nodes ({totalRiskNodes})
                </button>
                <button
                  onClick={onClose}
                  className="rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
                  aria-label="Close dashboard"
                >
                  <X size={20} />
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 md:px-6 md:py-5">
              <div className="grid grid-cols-12 gap-4">
                <section className="col-span-12">
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-12 md:col-span-6 xl:col-span-3">
                      <CompactKpiCard
                        title={CORE_STATS.vocabulary.label}
                        value={`${CORE_STATS.vocabulary.value.toLocaleString()}`}
                        subtitle={`Target ${CORE_STATS.vocabulary.target.toLocaleString()} · +${CORE_STATS.vocabulary.growth}%`}
                        support={`${Math.round((CORE_STATS.vocabulary.value / CORE_STATS.vocabulary.target) * 100)}% completion`}
                        micro={<CEFRMiniBar parts={CORE_STATS.vocabulary.cefr} />}
                      />
                    </div>
                    <div className="col-span-12 md:col-span-6 xl:col-span-3">
                      <CompactKpiCard
                        title={CORE_STATS.grammar.label}
                        value={`${CORE_STATS.grammar.accuracy}%`}
                        subtitle={`+${CORE_STATS.grammar.trend}% vs last cycle`}
                        support={`${CORE_STATS.grammar.fixedThisWeek} issues fixed this week`}
                      />
                    </div>
                    <div className="col-span-12 md:col-span-6 xl:col-span-3">
                      <CompactKpiCard
                        title={CORE_STATS.speaking.label}
                        value={`${CORE_STATS.speaking.wpm} WPM`}
                        subtitle={`+${CORE_STATS.speaking.trend}% speaking pace`}
                        support={`${CORE_STATS.speaking.cohesion}% cohesion`}
                      />
                    </div>
                    <div className="col-span-12 md:col-span-6 xl:col-span-3">
                      <CompactKpiCard
                        title={CORE_STATS.retention.label}
                        value={`${CORE_STATS.retention.value}%`}
                        subtitle={`+${CORE_STATS.retention.trend}% retention trend`}
                        support={`${CORE_STATS.retention.atRisk} nodes currently at risk`}
                      />
                    </div>
                  </div>
                </section>

                <section className="col-span-12 xl:col-span-8">
                  <div className="rounded-2xl border border-white/[0.12] bg-white/[0.04] backdrop-blur-xl">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
                      <h3 className="text-sm font-semibold text-white md:text-base">Topic Coverage</h3>
                      <div className="flex items-center gap-3 text-[10px] uppercase tracking-wide text-white/45">
                        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan-300" />Stable</span>
                        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-300" />At-risk</span>
                        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-white/40" />Unexplored</span>
                      </div>
                    </div>

                    <div className="hidden grid-cols-12 gap-3 px-4 py-2 text-[10px] uppercase tracking-wide text-white/45 md:grid">
                      <span className="col-span-4">Category</span>
                      <span className="col-span-2">Nodes</span>
                      <span className="col-span-2">Coverage</span>
                      <span className="col-span-2">Stability</span>
                      <span className="col-span-2">Mix</span>
                    </div>

                    <div className="space-y-1 p-2 md:p-3">
                      {categoryRows.map((row) => (
                        <div
                          key={row.name}
                          className="grid grid-cols-12 items-center gap-2 rounded-xl border border-transparent px-2 py-2 transition hover:border-white/10 hover:bg-white/[0.04] md:gap-3"
                        >
                          <div className="col-span-6 md:col-span-4">
                            <p className="text-sm font-medium text-white">{row.name}</p>
                          </div>
                          <div className="col-span-2 text-sm font-semibold text-white/80">{row.nodes.toLocaleString()}</div>
                          <div className="col-span-2 text-sm font-semibold text-cyan-200">{row.coverage}%</div>
                          <div className="col-span-2 text-sm font-semibold text-white/80">{row.stability}%</div>
                          <div className="col-span-12 md:col-span-2">
                            <SegmentedStatusBar stable={row.stability} atRisk={row.atRisk} unexplored={row.unexplored} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="col-span-12 xl:col-span-4">
                  <div className="rounded-2xl border border-white/[0.12] bg-white/[0.04] backdrop-blur-xl p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white">Needs Review</h3>
                      <ShieldAlert size={16} className="text-amber-300" />
                    </div>
                    <p className="mb-3 text-xs text-white/55">
                      Highest-risk categories first. Start here before adding new material.
                    </p>
                    <div className="space-y-2">
                      {topRiskRows.map((row) => (
                        <div key={row.name} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-white">{row.name}</p>
                            <p className="text-xs font-semibold text-amber-300">{row.riskNodes} risk nodes</p>
                          </div>
                          <p className="mt-1 text-[11px] text-white/55">
                            Review zone: {row.atRisk}% of covered nodes are unstable.
                          </p>
                        </div>
                      ))}
                    </div>
                    <button className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-blue-400/35 bg-blue-500/15 px-3 py-1.5 text-xs font-semibold text-blue-100 transition hover:bg-blue-500/25">
                      Start Guided Review
                      <ArrowUpRight size={13} />
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
