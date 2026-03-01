import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Zap, BarChart2, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';

interface DashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

// Enhanced category data with coverage metrics and milestones
const CATEGORY_DATA = {
  WORK: { 
    coverage: 85, 
    stability: 72,  // green portion (stable memory)
    trend: 8,
    nodes: 1240,
    scenarios: 34,
    breakthroughs: 8,
    glitches: 2,  // recently fixed grammar errors
    latestAchievement: 'Complex contract negotiations'
  },
  DAILY: { 
    coverage: 92, 
    stability: 88,
    trend: 12,
    nodes: 2156,
    scenarios: 56,
    breakthroughs: 15,
    glitches: 1,
    latestAchievement: 'Fluent restaurant ordering'
  },
  TRAVEL: { 
    coverage: 78, 
    stability: 65,
    trend: 5,
    nodes: 945,
    scenarios: 28,
    breakthroughs: 6,
    glitches: 3,
    latestAchievement: 'Hotel check-in scenarios'
  },
  SOCIAL: { 
    coverage: 73, 
    stability: 58,
    trend: 3,
    nodes: 867,
    scenarios: 22,
    breakthroughs: 5,
    glitches: 4,
    latestAchievement: 'Casual conversation flow'
  },
  ACADEMIC: { 
    coverage: 65, 
    stability: 48,
    trend: 2,
    nodes: 734,
    scenarios: 18,
    breakthroughs: 3,
    glitches: 5,
    latestAchievement: 'Technical terminology basics'
  },
  CODING: { 
    coverage: 88, 
    stability: 75,
    trend: 9,
    nodes: 1450,
    scenarios: 42,
    breakthroughs: 11,
    glitches: 1,
    latestAchievement: 'Explaining recursion concept'
  },
  OTHER: { 
    coverage: 58, 
    stability: 35,
    trend: 1,
    nodes: 421,
    scenarios: 9,
    breakthroughs: 1,
    glitches: 6,
    latestAchievement: 'Basic colloquial expressions'
  }
};

// Neural particle component for coverage visualization
const NeuralParticleBar: React.FC<{ coverage: number; stability: number }> = ({ coverage, stability }) => {
  const totalParticles = 40;
  const filledParticles = Math.floor((coverage / 100) * totalParticles);
  const stableParticles = Math.floor((stability / 100) * filledParticles);
  
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: totalParticles }).map((_, idx) => {
        const isStable = idx < stableParticles;
        const isFilled = idx < filledParticles;
        
        return (
          <motion.div
            key={idx}
            initial={{ opacity: 0.3 }}
            animate={{
              opacity: isStable ? 1 : isFilled ? 0.6 : 0.2,
              scale: isStable ? 1 : isFilled ? 1.1 : 1,
            }}
            transition={{
              duration: 2 + Math.random() * 2,
              repeat: isFilled && !isStable ? Infinity : 0,
              repeatType: 'reverse',
            }}
            className={`w-1.5 h-1.5 rounded-full ${
              isStable
                ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'
                : isFilled
                ? 'bg-yellow-400 shadow-[0_0_4px_rgba(250,204,21,0.6)]'
                : 'bg-gray-700'
            }`}
          />
        );
      })}
    </div>
  );
};

// Stability overlay showing memory decay
const StabilityOverlay: React.FC<{ coverage: number; stability: number }> = ({ coverage, stability }) => {
  const instabilityPercent = (coverage - stability);
  
  return (
    <div className="w-full mt-1 h-1.5 bg-black/50 rounded-full overflow-hidden border border-white/10">
      {/* Stable portion - solid green */}
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${stability}%` }}
        transition={{ delay: 0.3, duration: 0.8 }}
        className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400"
        style={{
          boxShadow: '0 0 8px rgba(52, 211, 153, 0.6)'
        }}
      />
      {/* Instability portion - flickering yellow */}
      {instabilityPercent > 0 && (
        <motion.div
          initial={{ width: 0, x: 0 }}
          animate={{ width: `${instabilityPercent}%`, x: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="h-full bg-gradient-to-r from-yellow-500 to-orange-400"
          style={{
            boxShadow: '0 0 8px rgba(234, 179, 8, 0.5)',
            animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite'
          }}
        />
      )}
    </div>
  );
};

// Expandable category card
const CategoryCard: React.FC<{ category: string; data: typeof CATEGORY_DATA.WORK }> = ({ category, data }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="bg-black/40 border border-white/5 rounded-xl p-4 hover:border-white/10 transition-all"
    >
      {/* Clickable header only */}
      <div
        className="flex items-start justify-between mb-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 flex-1">
          <div className={expanded ? 'text-amber-400' : 'text-white/60'}>
            {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </div>
          <div>
            <p className="text-sm font-bold text-white uppercase tracking-widest">{category}</p>
            <p className="text-xs text-white/40 mt-0.5">{data.nodes.toLocaleString()} Nodes</p>
          </div>
        </div>
      </div>

      {/* Neural Particle Bar */}
      <NeuralParticleBar coverage={data.coverage} stability={data.stability} />
      
      {/* Stability Overlay */}
      <StabilityOverlay coverage={data.coverage} stability={data.stability} />

      {/* Expanded Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-4 pt-4 border-t border-white/5 space-y-3"
          >
            {/* Milestones Grid */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-white/5 rounded p-2">
                <p className="text-white/40 text-[10px] uppercase">Scenarios</p>
                <p className="text-blue-400 font-bold">{data.scenarios}</p>
              </div>
              <div className="bg-white/5 rounded p-2">
                <p className="text-white/40 text-[10px] uppercase">Breakthroughs</p>
                <p className="text-emerald-400 font-bold">{data.breakthroughs}</p>
              </div>
              <div className="bg-white/5 rounded p-2">
                <p className="text-white/40 text-[10px] uppercase">Core Glitches</p>
                <p className={`font-bold ${data.glitches <= 2 ? 'text-green-400' : 'text-amber-400'}`}>
                  {data.glitches}
                </p>
              </div>
            </div>

            {/* Latest Achievement */}
            <div className="bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/20 rounded p-3">
              <p className="text-xs text-amber-400 font-bold uppercase mb-1">i+1 Breakthrough</p>
              <p className="text-sm text-white">{data.latestAchievement}</p>
            </div>

            {/* Stability Insight */}
            <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 rounded p-3">
              <div className="flex items-start gap-2">
                <AlertCircle size={14} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-yellow-400 font-bold uppercase mb-0.5">Decay Alert</p>
                  <p className="text-xs text-white/70">
                    {data.coverage - data.stability}% of nodes at risk of forgetting. Recommended: Recalibration drill
                  </p>
                </div>
              </div>
            </div>

            {/* Collapse button */}
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 hover:bg-white/5 transition-all text-xs"
            >
              <ChevronDown size={14} className="rotate-180" />
              Collapse
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export const Dashboard: React.FC<DashboardProps> = ({ isOpen, onClose }) => {
  const [coreStats] = useState({
    vocabulary: {
      current: 4250,
      target: 5000,
      growth: 18,
      distribution: [
        { level: 'A1-A2', count: 450, percentage: 11 },
        { level: 'B1-B2', count: 1850, percentage: 44 },
        { level: 'C1-C2', count: 1950, percentage: 45 },
      ],
    },
    grammar: {
      accuracy: 87,
      trend: 5,
      glitchesFixed: 3,
      glitchsSummary: 'Article usage, verb tense, prepositions'
    },
    fluency: {
      wpm: 145,
      trend: 12,
      cohesionIndex: 78,  // % of complex sentence structures
      complexSentences: '34%'
    },
    retention: {
      percentage: 76,
      trend: 3,
      savedToday: 12,  // nodes saved from forgetting
      riskCount: 45    // nodes at risk
    }
  });

  const sortedCategories = Object.entries(CATEGORY_DATA)
    .sort(([, a], [, b]) => b.coverage - a.coverage);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
          animate={{ opacity: 1, backdropFilter: 'blur(4px)' }}
          exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-[95%] max-w-6xl h-[95vh] bg-gradient-to-br from-slate-900 via-slate-800 to-black border border-amber-500/20 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Background Grid */}
            <div className="absolute inset-0 opacity-5 pointer-events-none">
              <div className="w-full h-full" style={{
                backgroundImage: 'linear-gradient(45deg, #fbbf24 1px, transparent 1px)',
                backgroundSize: '40px 40px'
              }} />
            </div>

            {/* Glow Effects */}
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />

            {/* Content */}
            <div className="relative z-10 flex flex-col flex-1 min-h-0">
              {/* Header */}
              <div className="flex items-center justify-between px-8 py-6 border-b border-white/5 bg-black/40 backdrop-blur-sm flex-shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center">
                    <Zap className="text-white" size={24} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Neural Ecosystem Dashboard</h2>
                    <p className="text-xs text-white/40 uppercase tracking-widest">Field Coverage & Memory Stability</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="p-8 space-y-6">
                  {/* Core Four Dimensions */}
                  <div>
                    <h3 className="text-lg font-bold text-white mb-4">Core Learning Dimensions</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Vocabulary */}
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-cyan-500/20 rounded-2xl p-5"
                      >
                        <p className="text-xs uppercase tracking-widest text-cyan-400 font-bold mb-3">Vocabulary Ecosystem</p>
                        <p className="text-3xl font-bold text-cyan-300 mb-1">{coreStats.vocabulary.current}</p>
                        <p className="text-xs text-white/60 mb-4">words mastered</p>
                        <div className="space-y-2 text-xs">
                          {coreStats.vocabulary.distribution.map((level) => (
                            <div key={level.level} className="flex justify-between">
                              <span className="text-white/60">{level.level}</span>
                              <span className="text-cyan-400 font-semibold">{level.percentage}%</span>
                            </div>
                          ))}
                        </div>
                      </motion.div>

                      {/* Grammar */}
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="bg-gradient-to-br from-emerald-500/10 to-green-500/5 border border-emerald-500/20 rounded-2xl p-5"
                      >
                        <p className="text-xs uppercase tracking-widest text-emerald-400 font-bold mb-3">Grammar Accuracy</p>
                        <p className="text-3xl font-bold text-emerald-300 mb-1">{coreStats.grammar.accuracy}%</p>
                        <p className="text-xs text-white/60 mb-3">syntax proficiency</p>
                        <div className="bg-white/5 rounded p-2">
                          <p className="text-xs text-white/40 mb-1">Glitches Fixed This Week</p>
                          <p className="text-sm font-bold text-green-400">{coreStats.grammar.glitchesFixed}</p>
                          <p className="text-xs text-white/50 mt-1">{coreStats.grammar.glitchsSummary}</p>
                        </div>
                      </motion.div>

                      {/* Fluency */}
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="bg-gradient-to-br from-purple-500/10 to-pink-500/5 border border-purple-500/20 rounded-2xl p-5"
                      >
                        <p className="text-xs uppercase tracking-widest text-purple-400 font-bold mb-3">Speaking Fluency</p>
                        <div className="flex gap-4 mb-4">
                          <div>
                            <p className="text-2xl font-bold text-purple-300">{coreStats.fluency.wpm}</p>
                            <p className="text-xs text-white/60">WPM</p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-purple-300">{coreStats.fluency.cohesionIndex}%</p>
                            <p className="text-xs text-white/60">Cohesion</p>
                          </div>
                        </div>
                        <div className="bg-white/5 rounded p-2">
                          <p className="text-xs text-white/40">Complex Sentences</p>
                          <p className="text-sm font-bold text-purple-400">{coreStats.fluency.complexSentences}</p>
                        </div>
                      </motion.div>

                      {/* Retention */}
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20 rounded-2xl p-5"
                      >
                        <p className="text-xs uppercase tracking-widest text-amber-400 font-bold mb-3">Forgetting Curve Defense</p>
                        <div className="flex gap-4 mb-4">
                          <div>
                            <p className="text-2xl font-bold text-amber-300">{coreStats.retention.percentage}%</p>
                            <p className="text-xs text-white/60">Stable</p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-yellow-400">{coreStats.retention.savedToday}</p>
                            <p className="text-xs text-white/60">Saved Today</p>
                          </div>
                        </div>
                        <div className="bg-white/5 rounded p-2">
                          <p className="text-xs text-white/40">At Risk</p>
                          <p className="text-sm font-bold text-orange-400">{coreStats.retention.riskCount} nodes</p>
                        </div>
                      </motion.div>
                    </div>
                  </div>

                  {/* Category Coverage Breakdown */}
                  <div>
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                      <BarChart2 className="text-amber-400" size={20} />
                      Field Coverage by Category
                    </h3>
                    <div className="grid grid-cols-1 gap-4">
                      {sortedCategories.map(([category, data]) => (
                        <CategoryCard key={category} category={category} data={data} />
                      ))}
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="bg-black/40 border border-white/5 rounded-xl p-4">
                    <p className="text-xs font-bold text-white uppercase mb-3">Understanding the Visualization</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                      <div className="flex gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0 mt-1" />
                        <div>
                          <p className="font-semibold text-white">Solid Green Dots</p>
                          <p className="text-white/60">Stable in long-term memory</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse flex-shrink-0 mt-1" />
                        <div>
                          <p className="font-semibold text-white">Flickering Yellow</p>
                          <p className="text-white/60">At forgetting edge, needs drill</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <div className="w-2 h-2 rounded-full bg-gray-700 flex-shrink-0 mt-1" />
                        <div>
                          <p className="font-semibold text-white">Dim Gray</p>
                          <p className="text-white/60">Not yet learned in this field</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
