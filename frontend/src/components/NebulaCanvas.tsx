import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Text } from '@react-three/drei';
import * as THREE from 'three';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceX, forceY, forceZ } from 'd3-force-3d';
import { Neuron, Synapse, Category } from '../types';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { FlightCameraRig } from './navigation/FlightCameraRig';
import { FlightModeBranch, FlightModePhase } from './navigation/flightTypes';

// Bloom post-processing wrapped in a React error boundary so it
// can fail silently on devices that don't support it (mobile WebGL1, etc.)
class BloomBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  constructor(props: any) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

const CATEGORY_COLORS: Record<Category, string> = {
  work:     '#60a5fa',
  daily:    '#f472b6',
  travel:   '#34d399',
  social:   '#fbbf24',
  academic: '#a78bfa',
  coding:   '#22d3ee',
  other:    '#94a3b8',
};

function ShootingStar({ onComplete }: { onComplete: () => void }) {
  const meshRef  = useRef<THREE.Mesh>(null);
  const startPos = useMemo(() => new THREE.Vector3(
    (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 40, -80
  ), []);
  const endPos   = useMemo(() => new THREE.Vector3(
    (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, 5
  ), []);
  const [progress, setProgress] = useState(0);

  useFrame((_, delta) => {
    if (progress < 1) {
      const np = Math.min(1, progress + delta * 1.2);
      setProgress(np);
      if (meshRef.current) {
        meshRef.current.position.lerpVectors(startPos, endPos, np);
        meshRef.current.scale.setScalar(1 + Math.sin(np * Math.PI) * 3);
      }
    } else { onComplete(); }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.15, 8, 8]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={1 - progress} toneMapped={false} />
      <pointLight intensity={4} color="#aaddff" distance={8} decay={2} />
    </mesh>
  );
}

function NeuronNode({ neuron, onClick, isDimmed, isFocused, isNew, isHighlighted, isStreamingActive }: {
  neuron: Neuron; onClick: () => void; isDimmed: boolean; isFocused?: boolean;
  isNew?: boolean;            // just arrived this streaming tick → start grey
  isHighlighted?: boolean;    // old neuron referenced by new synapse → bioluminescent burst
  isStreamingActive?: boolean; // streaming in progress → dim everything else
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  // Track when highlight first activated for burst animation
  const highlightStartRef = useRef<number | null>(null);

  useFrame((state) => {
    if (meshRef.current) {
      const time = state.clock.getElapsedTime();
      const pulse = 1 + Math.sin(time * (0.6 + neuron.potential * 0.8)) * 0.04;
      const baseScale = neuron.type === 'soma' ? 2.2 : 1.4;
      // Fading nodes shrink slightly: strength 0.15→0.62, 0.5→0.80, 1.0→1.0
      const strengthScale = 0.5 + neuron.strength * 0.5;

      let scale = pulse * baseScale * strengthScale;
      if (isFocused) scale *= 1.35;
      if (isHighlighted) {
        // Record when this node first became highlighted
        if (highlightStartRef.current === null) highlightStartRef.current = time;
        const elapsed = time - highlightStartRef.current;
        // Burst: spike to 2.0× over 0.15s then settle to 1.5× with fast throb
        const burstDecay = Math.max(0, 1 - elapsed / 0.3);
        const throb = 1 + Math.sin(time * 8) * 0.08;
        scale *= (1.5 + burstDecay * 0.5) * throb;
      } else {
        // Reset burst timer when no longer highlighted
        highlightStartRef.current = null;
      }

      meshRef.current.scale.setScalar(scale);

      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      // Mastery-driven opacity: strength 0.15→0.28, 0.6→0.66, 1.0→1.0
      const masteryOpacity = 0.15 + neuron.strength * 0.85;
      if (isNew) {
        mat.opacity = 0.06;
        mat.transparent = true;
      } else if (isHighlighted) {
        mat.opacity = 1.0;
        mat.transparent = false;
      } else if (isStreamingActive) {
        mat.opacity = isDimmed ? 0.05 : masteryOpacity * 0.15;
        mat.transparent = true;
      } else {
        mat.opacity = isDimmed ? 0.15 : masteryOpacity;
        mat.transparent = masteryOpacity < 0.95 || isDimmed;
      }
    }
  });

  // isHighlighted overrides dimming — force full brightness on referenced old nodes
  const effectiveDimmed = isHighlighted ? false : (isNew ? true : isDimmed);

  // Emissive scales with strength for vibrant glow
  const strengthGlow = 0.3 + neuron.strength * 0.7; // 0.15→0.41, 0.5→0.65, 1.0→1.0
  const emissiveIntensity = isNew
      ? 0.0
      : isHighlighted
        ? 2.0 + neuron.strength * 1.0
        : isStreamingActive
          ? 0.02
          : effectiveDimmed
            ? 0.05
            : neuron.type === 'soma'
              ? strengthGlow * 1.2
              : strengthGlow * 0.8;

  // Grey color for new unconnected neurons; normal category color otherwise
  const displayColor = isNew ? '#1f2937' : CATEGORY_COLORS[neuron.category];
  // Highlighted: use a saturated/intensified version of the category color
  const emissiveColor = isHighlighted ? CATEGORY_COLORS[neuron.category] : (isNew ? '#0f1117' : CATEGORY_COLORS[neuron.category]);

  return (
    <group position={[neuron.x || 0, neuron.y || 0, neuron.z || 0]}>
      <mesh ref={meshRef} onClick={onClick}>
        <sphereGeometry args={[0.3, 24, 24]} />
        <meshStandardMaterial
          color={displayColor}
          emissive={emissiveColor}
          emissiveIntensity={emissiveIntensity}
          metalness={isHighlighted ? 0.05 : 0.2}
          roughness={isHighlighted ? 0.15 : 0.4}
        />
      </mesh>
      {/* Ambient glow on every node — colored aura */}
      {!isNew && !effectiveDimmed && (
        <pointLight
          color={CATEGORY_COLORS[neuron.category]}
          intensity={strengthGlow * 2}
          distance={2.0}
          decay={2}
        />
      )}
      {/* Bright halo for highlighted nodes — bioluminescent bloom source */}
      {isHighlighted && (
        <pointLight
          color={CATEGORY_COLORS[neuron.category]}
          intensity={10}
          distance={5}
          decay={2}
        />
      )}
      {/* Label background for readability */}
      <Text
        position={[0, 0.65, 0]}
        fontSize={0.28}
        color={CATEGORY_COLORS[neuron.category]}
        anchorX="center"
        anchorY="middle"
        maxWidth={4}
        fontWeight="bold"
        outlineWidth={0.025}
        outlineColor="#000000"
        fillOpacity={isNew ? 0.04 : isHighlighted ? 1.0 : isStreamingActive ? 0.08 : effectiveDimmed ? 0.2 : Math.max(0.6, neuron.strength)}
      >
        {neuron.label}
      </Text>
    </group>
  );
}

// ── Synapse line with flowing electric impulses ───────────────────────────
function SynapseLine({ synapse, neurons, isDimmed, onClick, isCrossBatch, isStreamingActive }: {
  synapse: Synapse; neurons: Neuron[]; isDimmed: boolean; onClick: () => void;
  isCrossBatch?: boolean;      // connects a highlighted old node → new node → LIT UP
  isStreamingActive?: boolean; // streaming in progress, and this is NOT a cross-batch line → dim
}) {
  const source = neurons.find(n => n.id === synapse.source);
  const target = neurons.find(n => n.id === synapse.target);
  const lineRef = useRef<THREE.Mesh>(null);

  const points = useMemo(() => {
    if (!source || !target) return [];
    const start = new THREE.Vector3(source.x || 0, source.y || 0, source.z || 0);
    const end = new THREE.Vector3(target.x || 0, target.y || 0, target.z || 0);
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const dist = start.distanceTo(end);
    mid.y += dist * 0.2;
    mid.z += dist * 0.1;
    return [start, mid, end];
  }, [source?.x, source?.y, source?.z, target?.x, target?.y, target?.z]);

  const curve = useMemo(() => {
    if (points.length < 3) return null;
    return new THREE.CatmullRomCurve3(points);
  }, [points]);

  const spark1Ref = useRef<THREE.Mesh>(null);
  const spark2Ref = useRef<THREE.Mesh>(null);
  const spark3Ref = useRef<THREE.Mesh>(null);
  const sparkRefs    = [spark1Ref, spark2Ref, spark3Ref];
  const sparkOffsets = [0, 0.33, 0.66];
  const impulseSpeed = useMemo(() => {
    if (isCrossBatch) return (0.4 + synapse.strength * 0.6) * 2.5; // fast for cross-batch
    return 0.4 + synapse.strength * 0.6;
  }, [synapse.strength, isCrossBatch]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();

    // Determine effective dimming
    const effectiveDimmed = isDimmed || (isStreamingActive && !isCrossBatch);

    // Original pulsing line opacity
    if (lineRef.current && lineRef.current.material) {
      const pulse = 0.4 + Math.sin(t * 3) * 0.3;
      let opacity: number;
      if (isDimmed) {
        opacity = 0.02;
      } else if (isCrossBatch) {
        // Bright pulsing cross-batch synapse — the "new branch" lighting up
        opacity = 0.7 + Math.sin(t * 10) * 0.3;
      } else if (isStreamingActive) {
        opacity = 0.015; // nearly invisible during streaming
      } else {
        opacity = synapse.strength * pulse;
      }
      (lineRef.current.material as THREE.MeshBasicMaterial).opacity = opacity;
    }

    // Electric impulse sparks
    if (!effectiveDimmed && curve) {
      sparkRefs.forEach((ref, idx) => {
        if (!ref.current) return;
        const tp = ((t * impulseSpeed + sparkOffsets[idx]) % 1);
        ref.current.position.copy(curve.getPoint(tp));
        const brightness = Math.sin(tp * Math.PI);
        const sparkOpacity = isCrossBatch
          ? brightness * 1.0  // full bright for cross-batch sparks
          : brightness * (0.5 + synapse.strength * 0.5);
        (ref.current.material as THREE.MeshBasicMaterial).opacity = sparkOpacity;
        const sparkScale = isCrossBatch
          ? 0.8 + brightness * 2.5  // bigger sparks for cross-batch
          : 0.5 + brightness * 1.5;
        ref.current.scale.setScalar(sparkScale);
      });
    } else if (curve) {
      // Hide sparks when dimmed
      sparkRefs.forEach((ref) => {
        if (ref.current) {
          (ref.current.material as THREE.MeshBasicMaterial).opacity = 0;
          ref.current.scale.setScalar(0);
        }
      });
    }
  });

  if (!source || !target || points.length < 3 || !curve) return null;

  const srcColor = CATEGORY_COLORS[source.category] || '#6b7280';
  // Cross-batch synapses get thicker tubes for visual impact
  const coreRadius = isCrossBatch ? 0.008 : 0.004;
  const accentRadius = isCrossBatch ? 0.016 : 0.008;
  const showSparks = !isDimmed && !(isStreamingActive && !isCrossBatch);

  return (
    <group onClick={(e) => { e.stopPropagation(); onClick(); }}>
      {/* Slim bright core line */}
      <mesh ref={lineRef}>
        <tubeGeometry args={[curve, 20, coreRadius, 5, false]} />
        <meshBasicMaterial
          color={isCrossBatch ? 0xffffff : 0xffffff}
          transparent
          opacity={isDimmed ? 0.02 : isStreamingActive && !isCrossBatch ? 0.015 : (synapse.strength * 0.85)}
          fog={false}
          toneMapped={false}
        />
      </mesh>

      {/* Colored accent layer */}
      <mesh>
        <tubeGeometry args={[curve, 20, accentRadius, 5, false]} />
        <meshBasicMaterial
          color={srcColor}
          transparent
          opacity={isDimmed ? 0.01 : isStreamingActive && !isCrossBatch ? 0.01 : isCrossBatch ? synapse.strength * 1.0 : (synapse.strength * 0.5)}
          fog={false}
          toneMapped={false}
        />
      </mesh>

      {/* Point light aura for cross-batch "explosion" effect */}
      {isCrossBatch && (
        <pointLight color={srcColor} intensity={4} distance={2.5} decay={2} />
      )}

      {/* Electric impulse sparks */}
      {showSparks && sparkRefs.map((ref, i) => (
        <mesh key={i} ref={ref}>
          <sphereGeometry args={[isCrossBatch ? 0.035 : 0.02, 8, 8]} />
          <meshBasicMaterial color={srcColor} transparent opacity={0.8} toneMapped={false} />
          <pointLight color={srcColor} intensity={isCrossBatch ? 5 : 2} distance={isCrossBatch ? 2.0 : 1.2} />
        </mesh>
      ))}
    </group>
  );
}

// ── Camera Controller (non-flight mode) ─────────────────────────────────
// Module-level flag — survives component remounts so camera never auto-recenters
// after the user has navigated away
let _cameraInitialized = false;

function CameraController({ targetNode, positionedNodes }: { targetNode: Neuron | null; isFocused?: boolean; positionedNodes?: Neuron[] }) {
  const { camera, controls } = useThree() as any;

  // Auto-fit ONCE on very first load with nodes — never again
  useEffect(() => {
    if (_cameraInitialized) return;
    if (!positionedNodes || positionedNodes.length === 0) return;
    _cameraInitialized = true;

    const validNodes = positionedNodes.filter(n => n.x !== undefined && n.y !== undefined && n.z !== undefined);
    if (validNodes.length === 0) return;
    let maxR = 0;
    for (const n of validNodes) {
      const r = Math.sqrt((n.x ?? 0) ** 2 + (n.y ?? 0) ** 2 + (n.z ?? 0) ** 2);
      if (r > maxR) maxR = r;
    }
    const fitZ = Math.max(6, maxR / Math.tan((Math.PI / 180) * 30) + 2);
    camera.position.set(0, 0, fitZ);
    if (controls) controls.target.set(0, 0, 0);
  }, [positionedNodes, camera, controls]);

  // Only move camera for search — gentle lerp to search target
  useFrame(() => {
    if (targetNode && targetNode.x !== undefined) {
      const targetPos = new THREE.Vector3(targetNode.x, targetNode.y, targetNode.z + 5);
      camera.position.lerp(targetPos, 0.05);
      if (controls) {
        controls.target.lerp(new THREE.Vector3(targetNode.x, targetNode.y, targetNode.z), 0.05);
      }
    }
  });

  return null;
}

export function NebulaCanvas({ neurons, synapses, onNeuronClick, onSynapseClick, filterCategory, searchTarget, timePulse, shootingStars, onShootingStarComplete, isFlying, streamingNewIds = new Set(), highlightedIds = new Set(), flightPhase = 'hidden' as FlightModePhase, flightBranch = null as FlightModeBranch, relightTargetId = null as string | null, relightGlowProgress = 1, onTravelArrive, onFocusComplete }: {
  neurons: Neuron[];
  synapses: Synapse[];
  onNeuronClick: (n: Neuron) => void;
  onSynapseClick: (s: Synapse) => void;
  filterCategory: Category | 'all';
  searchTarget: Neuron | null;
  timePulse: number;
  shootingStars: string[];
  onShootingStarComplete: (id: string) => void;
  isFlying: boolean;
  streamingNewIds?: Set<string>;
  highlightedIds?: Set<string>;
  flightPhase?: FlightModePhase;
  flightBranch?: FlightModeBranch;
  relightTargetId?: string | null;
  relightGlowProgress?: number;
  onTravelArrive?: () => void;
  onFocusComplete?: () => void;
}) {
  // Use local state for positioned nodes to avoid prop mutation issues
  const [positionedNodes, setPositionedNodes] = useState<Neuron[]>([]);
  // Preserve positions across re-simulations so nodes don't jump
  const prevPositionsRef = useRef<Map<string, { x: number; y: number; z: number }>>(new Map());

  useEffect(() => {
    // Clone to avoid mutating props
    const nodes = neurons.map(n => ({ ...n }));
    const links = synapses.map(s => ({ ...s }));

    const n = nodes.length;
    const scale = Math.max(0.25, Math.min(1.0, 8 / Math.sqrt(n)));
    const linkClose = 0.18 * scale;
    const linkFar   = 0.35 * scale;

    // Restore previous positions so existing nodes don't jump
    const prevPos = prevPositionsRef.current;
    const rng = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
    for (const node of nodes) {
      const saved = prevPos.get(node.id);
      if (saved) {
        node.x = saved.x;
        node.y = saved.y;
        node.z = saved.z;
      } else if (node.x === undefined) {
        node.x = rng(-1, 1);
        node.y = rng(-1, 1);
        node.z = rng(-1, 1);
      }
    }

    const categories = [...new Set(nodes.map(d => d.category))];
    const catCount = categories.length || 1;
    const ringR = Math.max(0.5, 1.6 * scale);
    const catAnchors: Record<string, { x: number; y: number; z: number }> = {};
    categories.forEach((cat, idx) => {
      const phi   = Math.acos(1 - 2 * (idx + 0.5) / catCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * idx;
      catAnchors[cat] = {
        x: ringR * Math.sin(phi) * Math.cos(theta),
        y: ringR * Math.cos(phi),
        z: ringR * Math.sin(phi) * Math.sin(theta),
      };
    });

    const sim = forceSimulation<Neuron>(nodes, 3)
      .force('link', forceLink<Neuron, any>(links).id(d => d.id).distance((link: any) => {
        return link.type === 'logical' ? linkClose : linkFar;
      }).strength(0.7))
      .force('charge', forceManyBody().strength(-1.5 * scale))
      .force('center', forceCenter(0, 0, 0).strength(0.05))
      .force('catX', forceX<Neuron>(d => catAnchors[d.category]?.x ?? 0).strength(0.5))
      .force('catY', forceY<Neuron>(d => {
        const base = catAnchors[d.category]?.y ?? 0;
        return base + (d.type === 'soma' ? 0.06 * scale : -0.06 * scale);
      }).strength(0.5))
      .force('catZ', forceZ<Neuron>(d => catAnchors[d.category]?.z ?? 0).strength(0.5))
      .stop();

    // Fewer ticks if most nodes already have positions (incremental update)
    const hasPositions = nodes.filter(nd => prevPos.has(nd.id)).length;
    const ticks = hasPositions > nodes.length * 0.5 ? 80 : 500;
    for (let i = 0; i < ticks; i++) sim.tick();

    // Save positions for next re-simulation
    const newPos = new Map<string, { x: number; y: number; z: number }>();
    for (const nd of nodes) {
      newPos.set(nd.id, { x: nd.x ?? 0, y: nd.y ?? 0, z: nd.z ?? 0 });
    }
    prevPositionsRef.current = newPos;

    setPositionedNodes(nodes);
  }, [neurons, synapses]);

  // Find the actual positioned node for searching
  const activeSearchTarget = useMemo(() => {
    if (!searchTarget) return null;
    return positionedNodes.find(n => n.id === searchTarget.id) || null;
  }, [searchTarget, positionedNodes]);

  const handleNeuronClick = (neuron: Neuron) => {
    onNeuronClick(neuron);
  };

  return (
    <div className="w-full h-full bg-black">
      <Canvas camera={{ position: [0, 0, 20], fov: 60 }}>
        <color attach="background" args={['#020205']} />
        <ambientLight intensity={0.4} />
        <pointLight position={[10, 10, 10]} intensity={1.5} />

        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

        <group>
          {positionedNodes.map(n => {
            const decay    = Math.max(0, n.strength - timePulse);
            const isDimmed = (filterCategory !== 'all' && n.category !== filterCategory)
                          || (decay < 0.1 && !n.isShadow);
            const isNew          = streamingNewIds.has(n.id);
            const isHighlighted  = highlightedIds.has(n.id);
            const isStreamingActive = streamingNewIds.size > 0;
            return (
              <NeuronNode
                key={n.id}
                neuron={n}
                onClick={() => handleNeuronClick(n)}
                isDimmed={isDimmed}
                isFocused={false}
                isNew={isNew}
                isHighlighted={isHighlighted}
                isStreamingActive={isStreamingActive && !isNew && !isHighlighted}
              />
            );
          })}
          {synapses.map((s, i) => {
            const source = positionedNodes.find(n => n.id === s.source);
            const filterDimmed = filterCategory !== 'all' && source?.category !== filterCategory;
            const isStreamingActive = streamingNewIds.size > 0;
            // Cross-batch: synapse connecting a highlighted old node ↔ a new node
            const isCrossBatch = !filterDimmed && (
              (highlightedIds.has(s.source) && streamingNewIds.has(s.target))
              || (highlightedIds.has(s.target) && streamingNewIds.has(s.source))
            );
            // Dim the synapse if both endpoints are brand-new (internal new-batch link)
            const bothNew = streamingNewIds.has(s.source) && streamingNewIds.has(s.target);
            const synapseDimmed = filterDimmed || bothNew;
            // Non-cross-batch synapses recede during streaming
            const synapseStreamingActive = isStreamingActive && !isCrossBatch && !filterDimmed;
            return (
              <SynapseLine
                key={`${s.source}-${s.target}-${i}`}
                synapse={s}
                neurons={positionedNodes}
                isDimmed={synapseDimmed}
                onClick={() => onSynapseClick(s)}
                isCrossBatch={isCrossBatch}
                isStreamingActive={synapseStreamingActive}
              />
            );
          })}
          {shootingStars.map(id => (
            <ShootingStar key={id} onComplete={() => onShootingStarComplete(id)} />
          ))}
        </group>

        {/* Non-flight camera control */}
        {flightPhase === 'hidden' && (
          <CameraController targetNode={activeSearchTarget} positionedNodes={positionedNodes} />
        )}

        {/* Flight mode: spaceship + camera rig */}
        <FlightCameraRig
          phase={isFlying ? flightPhase : 'hidden'}
          branch={flightBranch}
          nodes={positionedNodes}
          searchTarget={activeSearchTarget}
          relightTargetId={relightTargetId}
          onTravelArrive={onTravelArrive || (() => {})}
          onFocusComplete={onFocusComplete || (() => {})}
        />

        <BloomBoundary>
          <EffectComposer>
            <Bloom luminanceThreshold={0.05} luminanceSmoothing={0.8} height={400} intensity={2.5} />
          </EffectComposer>
        </BloomBoundary>

        <OrbitControls
          makeDefault
          autoRotate={false}
          enableDamping
          dampingFactor={0.05}
          enablePan={true}
          screenSpacePanning={true}
        />
      </Canvas>
    </div>
  );
}
