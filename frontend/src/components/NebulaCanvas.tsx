import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Text } from '@react-three/drei';
import * as THREE from 'three';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceX, forceY, forceZ } from 'd3-force-3d';
import { Neuron, Synapse, Category, LinkKind } from '../types';
import { EffectComposer, Bloom } from '@react-three/postprocessing';

// ── Color Systems ───────────────────────────────────────────────────────

/** Mastery-based node color: red (0) → amber (0.5) → blue (1.0) */
function getMasteryColor(mastery: number): string {
  if (mastery < 0.25) return '#9bb4ff';
  if (mastery < 0.62) return '#4a6fe8';
  return '#1e3ea8';
}

function getMasteryColorObj(mastery: number): THREE.Color {
  return new THREE.Color(getMasteryColor(mastery));
}

function getNodeVisualColor(mastery: number, nodeKind: string): string {
  const base = getMasteryColorObj(mastery);
  const accent = nodeKind === 'grammar'
    ? new THREE.Color('#60a5fa')
    : nodeKind === 'sentence'
      ? new THREE.Color('#a78bfa')
      : new THREE.Color('#4f6fff');
  return base.lerp(accent, 0.2).getStyle();
}

/** Link colors by relationship type */
const LINK_COLORS: Record<LinkKind, string> = {
  semantic: '#2a50bf',
  conjugation: '#3c68ff',
  prerequisite: '#6f86e8',
  reactivation: '#2d7cff',
  mission: '#16389f',
};

function getCategoryAnchor(category: Category): { x: number; y: number; z: number } {
  const anchors: Record<Category, { x: number; y: number; z: number }> = {
    daily: { x: 0, y: 0, z: 0 },
    social: { x: -3.2, y: 2.2, z: 0.5 },
    travel: { x: 3.1, y: 2.0, z: -0.5 },
    work: { x: -3.1, y: -2.1, z: -0.4 },
    academic: { x: 3.2, y: -2.1, z: 0.4 },
    coding: { x: 0.4, y: 3.1, z: -0.7 },
    other: { x: 0, y: -3.3, z: 0.3 },
  };
  return anchors[category] || anchors.other;
}

/** Node size by kind */
const NODE_RADIUS: Record<string, number> = {
  sentence: 0.55,
  grammar: 0.45,
  vocab: 0.4,
};

// ── Components ──────────────────────────────────────────────────────────

function NeuronNode({ neuron, onClick, isDimmed, isFocused, compactMode }: {
  neuron: Neuron;
  onClick: () => void;
  isDimmed: boolean;
  isFocused?: boolean;
  compactMode?: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const spawnProgress = useRef(neuron.isNew ? 0 : 1);
  const radius = NODE_RADIUS[neuron.nodeKind] || 0.4;
  const masteryColor = getMasteryColor(neuron.strength);
  const visualColor = getNodeVisualColor(neuron.strength, neuron.nodeKind);
  const ringColor = neuron.nodeKind === 'grammar' ? '#60a5fa' : masteryColor;

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    const time = state.clock.getElapsedTime();

    // Spawn animation
    if (spawnProgress.current < 1) {
      spawnProgress.current = Math.min(1, spawnProgress.current + delta * 2.5);
    }
    const spawn = spawnProgress.current;
    const eased = spawn < 1 ? 1 - Math.pow(1 - spawn, 3) * Math.cos(spawn * Math.PI * 2) : 1;

    // Subtle pulse
    let pulse = 1 + Math.sin(time * 0.8) * 0.02;
    let scale = pulse * eased;
    if (isFocused) scale *= 1.2;
    if (neuron.isNew) scale *= 1 + Math.sin(time * 4) * 0.1;

    meshRef.current.scale.setScalar(scale);

    // Opacity
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    const baseOpacity = Math.max(0.6, Math.min(1, 0.6 + neuron.strength * 0.4));
    if (neuron.isShadow) {
      mat.opacity = 0.35;
      mat.transparent = true;
    } else {
      mat.opacity = isDimmed ? 0.22 : baseOpacity;
      mat.transparent = true;
    }

    // Emissive glow for new nodes
    if (neuron.isNew && !neuron.isShadow) {
      const flashIntensity = 0.6 * (1 - spawnProgress.current) + 0.3;
      mat.emissiveIntensity = flashIntensity + Math.sin(time * 3) * 0.1;
    }

    // Ring rotation
    if (ringRef.current) {
      ringRef.current.rotation.z = time * 0.3;
      ringRef.current.scale.setScalar(eased);
    }
  });

  // Grammar nodes get a diamond-like shape indicator
  const isGrammar = neuron.nodeKind === 'grammar';

  return (
    <group position={[neuron.x || 0, neuron.y || 0, neuron.z || 0]}>
      {/* Main sphere */}
      <mesh ref={meshRef} onClick={onClick}>
        <sphereGeometry args={[radius, 20, 20]} />
        <meshStandardMaterial
          color={visualColor}
          emissive={visualColor}
          emissiveIntensity={neuron.isShadow ? 0.05 : (isDimmed ? 0.02 : 0.2 + neuron.strength * 0.2)}
          metalness={0.3}
          roughness={0.4}
        />
      </mesh>

      {/* Mastery ring — thicker for sentences, dashed for grammar */}
      {!isDimmed && !neuron.isShadow && (
        <mesh ref={ringRef}>
          <ringGeometry args={[radius + 0.08, radius + 0.15, isGrammar ? 4 : 32]} />
          <meshBasicMaterial
            color={ringColor}
            transparent
            opacity={0.28 + neuron.strength * 0.52}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Kind indicator: inner dot for grammar, outer halo for sentence */}
      {neuron.nodeKind === 'sentence' && !isDimmed && (
        <mesh>
          <ringGeometry args={[radius + 0.2, radius + 0.25, 32]} />
          <meshBasicMaterial color={masteryColor} transparent opacity={0.2} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Glow light */}
      {!isDimmed && !neuron.isShadow && (
        <pointLight intensity={neuron.isNew ? 1.6 : (0.5 + neuron.strength * 0.9)} color={visualColor} distance={2.6} />
      )}

      {/* Label */}
      <Text
        position={[0, radius + 0.35, 0]}
        fontSize={compactMode ? 0.36 : 0.3}
        color="#10246f"
        anchorX="center"
        anchorY="middle"
        maxWidth={4}
        fillOpacity={neuron.isShadow ? 0.45 : (isDimmed ? 0.28 : Math.max(0.6, 0.6 + neuron.strength * 0.4))}
        outlineWidth={0.015}
        outlineColor="#000000"
      >
        {neuron.label}
      </Text>
    </group>
  );
}

function SynapseLine({ synapse, neurons, isDimmed, onClick, compactMode }: {
  synapse: Synapse;
  neurons: Neuron[];
  isDimmed: boolean;
  onClick: () => void;
  compactMode?: boolean;
}) {
  const source = neurons.find(n => n.id === synapse.source);
  const target = neurons.find(n => n.id === synapse.target);
  const lineRef = useRef<THREE.Mesh>(null);
  const accentRef = useRef<THREE.Mesh>(null);
  const signalRef = useRef<THREE.Mesh>(null);
  const drawProgress = useRef(synapse.isNew ? 0 : 1);

  const linkColor = LINK_COLORS[synapse.linkKind || 'semantic'];

  const points = useMemo(() => {
    if (!source || !target) return [];
    const start = new THREE.Vector3(source.x || 0, source.y || 0, source.z || 0);
    const end = new THREE.Vector3(target.x || 0, target.y || 0, target.z || 0);
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const dist = start.distanceTo(end);
    mid.y += dist * (compactMode ? 0.08 : 0.15);
    return [start, mid, end];
  }, [source?.x, source?.y, source?.z, target?.x, target?.y, target?.z, compactMode]);

  const curve = useMemo(() => {
    if (points.length < 3) return null;
    return new THREE.CatmullRomCurve3(points);
  }, [points]);

  useFrame((state, delta) => {
    if (drawProgress.current < 1) {
      drawProgress.current = Math.min(1, drawProgress.current + delta * 2);
    }

    const dp = drawProgress.current;

    if (lineRef.current?.material) {
      const mat = lineRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (isDimmed ? 0.03 : 0.8) * dp;
    }
    if (accentRef.current?.material) {
      const mat = accentRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (isDimmed ? 0.01 : 0.35) * dp;
    }

    if (signalRef.current && curve) {
      const t = (state.clock.getElapsedTime() * 0.5) % 1;
      const pos = curve.getPoint(t * dp);
      signalRef.current.position.copy(pos);
      const mat = signalRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = dp * (0.5 + Math.sin(state.clock.getElapsedTime() * 4) * 0.3);
    }
  });

  if (!source || !target || !curve) return null;

  return (
    <group onClick={(e) => { e.stopPropagation(); onClick(); }}>
      {/* Core line — white bright */}
      <mesh ref={lineRef}>
        <tubeGeometry args={[curve, 32, 0.03, 8, false]} />
        <meshBasicMaterial
          color={linkColor}
          transparent
          opacity={isDimmed ? 0.03 : 0.8}
          toneMapped={false}
        />
      </mesh>

      {/* Wider colored accent */}
      <mesh ref={accentRef}>
        <tubeGeometry args={[curve, 32, 0.07, 8, false]} />
        <meshBasicMaterial
          color={linkColor}
          transparent
          opacity={isDimmed ? 0.01 : 0.35}
          toneMapped={false}
        />
      </mesh>

      {/* Traveling signal particle */}
      {!isDimmed && (
        <mesh ref={signalRef}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshBasicMaterial color={linkColor} transparent opacity={0.7} />
          <pointLight intensity={2} color={linkColor} distance={2} />
        </mesh>
      )}

    </group>
  );
}

function CameraController({ targetNode, isFlying, isFocused, newNodesCentroid, graphCenter, graphRadius, autoCameraEnabled }: {
  targetNode: Neuron | null;
  isFlying: boolean;
  isFocused?: boolean;
  newNodesCentroid: THREE.Vector3 | null;
  graphCenter: THREE.Vector3 | null;
  graphRadius: number;
  autoCameraEnabled: boolean;
}) {
  const { camera, controls } = useThree() as any;
  const flightAngle = useRef(0);
  const [shipPos] = useState(() => new THREE.Vector3());
  const [shipTarget] = useState(() => new THREE.Vector3());
  const autoFocusTimer = useRef(0);

  useFrame((state, delta) => {
    // Auto-focus on new nodes
    if (autoCameraEnabled && newNodesCentroid && !isFocused && !isFlying && !targetNode) {
      autoFocusTimer.current += delta;
      if (autoFocusTimer.current < 2) {
        const targetPos = new THREE.Vector3(
          newNodesCentroid.x,
          newNodesCentroid.y,
          newNodesCentroid.z + 5
        );
        camera.position.lerp(targetPos, 0.03);
        if (controls) {
          controls.target.lerp(newNodesCentroid, 0.03);
        }
      }
    } else if (!newNodesCentroid) {
      autoFocusTimer.current = 0;
    }

    if (isFocused && targetNode && targetNode.x !== undefined) {
      const targetPos = new THREE.Vector3(targetNode.x, targetNode.y, (targetNode.z || 0) + 4);
      camera.position.lerp(targetPos, 0.08);
      if (controls) {
        controls.target.lerp(new THREE.Vector3(targetNode.x, targetNode.y, targetNode.z), 0.08);
      }
    } else if (targetNode && targetNode.x !== undefined) {
      const targetPos = new THREE.Vector3(targetNode.x, targetNode.y, (targetNode.z || 0) + 3);
      camera.position.lerp(targetPos, 0.05);
      if (controls) {
        controls.target.lerp(new THREE.Vector3(targetNode.x, targetNode.y, targetNode.z), 0.05);
      }
    } else if (isFlying) {
      flightAngle.current += delta * 0.05;
      const radius = 10;
      const x = Math.cos(flightAngle.current) * radius;
      const z = Math.sin(flightAngle.current) * radius;
      const y = Math.sin(flightAngle.current * 0.5) * 4;
      camera.position.lerp(new THREE.Vector3(x, y, z), 0.01);
      if (controls) {
        controls.target.lerp(new THREE.Vector3(0, 0, 0), 0.01);
      }
    } else if (autoCameraEnabled && !targetNode && !isFocused && graphCenter) {
      const desiredZ = Math.max(7, Math.min(18, graphRadius * 2.2 + 5));
      const targetPos = new THREE.Vector3(graphCenter.x, graphCenter.y, graphCenter.z + desiredZ);
      camera.position.lerp(targetPos, 0.03);
      if (controls) {
        controls.target.lerp(graphCenter, 0.04);
      }
    }
  });

  return null;
}

/** Legend overlay showing what colors mean */
function GraphLegend() {
  return (
    <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur-md border border-white/10 rounded-xl p-3 text-[10px] text-white/70 space-y-2 z-10 pointer-events-none">
      <div className="text-[9px] uppercase tracking-widest text-white/40 font-bold mb-1">Mastery</div>
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-[#ef4444]" />
        <span>New / Decaying</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]" />
        <span>Learning</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-[#3557cf]" />
        <span>Mastered</span>
      </div>
      <div className="border-t border-white/10 my-1.5" />
      <div className="text-[9px] uppercase tracking-widest text-white/40 font-bold mb-1">Links</div>
      <div className="flex items-center gap-2">
        <div className="w-4 h-0.5 bg-[#3f63da] rounded" />
        <span>Semantic</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-4 h-0.5 bg-[#3b82f6] rounded" />
        <span>Conjugation</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-4 h-0.5 bg-[#a855f7] rounded" />
        <span>Prerequisite</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-4 h-0.5 bg-[#f97316] rounded" />
        <span>Reactivation</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-4 h-0.5 bg-[#eab308] rounded" />
        <span>Mission</span>
      </div>
    </div>
  );
}

/** Slowly rotating star field wrapper for sense of depth and motion */
function RotatingStarField() {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.012;
      groupRef.current.rotation.x += delta * 0.004;
    }
  });
  return (
    <group ref={groupRef}>
      <Stars radius={200} depth={120} count={16000} factor={3.5} saturation={0.15} fade speed={1.2} />
      <Stars radius={150} depth={80} count={6000} factor={5.5} saturation={0.2} fade speed={1.8} />
      <Stars radius={100} depth={40} count={2000} factor={8.0} saturation={0.1} fade speed={2.5} />
    </group>
  );
}

// ── Main Component ──────────────────────────────────────────────────────

export function NebulaCanvas({ neurons, synapses, onNeuronClick, onSynapseClick, filterCategory, searchTarget, timePulse, shootingStars, onShootingStarComplete, isFlying, recenterNonce }: {
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
  recenterNonce?: number;
}) {
  const [positionedNodes, setPositionedNodes] = useState<Neuron[]>([]);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [autoCameraEnabled, setAutoCameraEnabled] = useState(true);
  const previousPositionsRef = useRef<Map<string, { x: number; y: number; z: number }>>(new Map());

  const normalizeLayoutSpread = (nodes: Neuron[]) => {
    if (nodes.length === 0) return nodes;
    const cx = nodes.reduce((s, n) => s + (n.x || 0), 0) / nodes.length;
    const cy = nodes.reduce((s, n) => s + (n.y || 0), 0) / nodes.length;
    const cz = nodes.reduce((s, n) => s + (n.z || 0), 0) / nodes.length;

    let maxRadius = 0;
    nodes.forEach((n) => {
      const dx = (n.x || 0) - cx;
      const dy = (n.y || 0) - cy;
      const dz = (n.z || 0) - cz;
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      maxRadius = Math.max(maxRadius, r);
    });

    const desiredRadius = nodes.length <= 8 ? 4 : (nodes.length <= 20 ? 6 : 9);
    if (maxRadius < 0.0001) return nodes;

    const scale = desiredRadius / maxRadius;
    // Keep scale bounded so layout remains stable across turns
    const boundedScale = Math.max(0.65, Math.min(1.35, scale));

    nodes.forEach((n) => {
      n.x = cx + ((n.x || 0) - cx) * boundedScale;
      n.y = cy + ((n.y || 0) - cy) * boundedScale;
      n.z = cz + ((n.z || 0) - cz) * boundedScale;
    });

    return nodes;
  };

  // Centroid of new nodes for camera auto-focus
  const newNodesCentroid = useMemo(() => {
    const newNodes = positionedNodes.filter(n => n.isNew);
    if (newNodes.length === 0) return null;
    const cx = newNodes.reduce((s, n) => s + (n.x || 0), 0) / newNodes.length;
    const cy = newNodes.reduce((s, n) => s + (n.y || 0), 0) / newNodes.length;
    const cz = newNodes.reduce((s, n) => s + (n.z || 0), 0) / newNodes.length;
    return new THREE.Vector3(cx, cy, cz);
  }, [positionedNodes]);

  const graphCenter = useMemo(() => {
    if (positionedNodes.length === 0) return null;
    const cx = positionedNodes.reduce((s, n) => s + (n.x || 0), 0) / positionedNodes.length;
    const cy = positionedNodes.reduce((s, n) => s + (n.y || 0), 0) / positionedNodes.length;
    const cz = positionedNodes.reduce((s, n) => s + (n.z || 0), 0) / positionedNodes.length;
    return new THREE.Vector3(cx, cy, cz);
  }, [positionedNodes]);

  const graphRadius = useMemo(() => {
    if (!graphCenter || positionedNodes.length === 0) return 0;
    let r = 0;
    positionedNodes.forEach((n) => {
      const dx = (n.x || 0) - graphCenter.x;
      const dy = (n.y || 0) - graphCenter.y;
      const dz = (n.z || 0) - graphCenter.z;
      r = Math.max(r, Math.sqrt(dx * dx + dy * dy + dz * dz));
    });
    return r;
  }, [positionedNodes, graphCenter]);
  const compactMode = positionedNodes.length > 0 && positionedNodes.length <= 8;

  const clusterByConnectedComponents = (nodes: Neuron[], links: Synapse[]) => {
    if (nodes.length <= 2) return nodes;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const adj = new Map<string, string[]>();
    nodes.forEach((n) => adj.set(n.id, []));
    links.forEach((l) => {
      if (!adj.has(l.source) || !adj.has(l.target)) return;
      adj.get(l.source)!.push(l.target);
      adj.get(l.target)!.push(l.source);
    });

    const visited = new Set<string>();
    const components: string[][] = [];
    for (const n of nodes) {
      if (visited.has(n.id)) continue;
      const queue = [n.id];
      const comp: string[] = [];
      visited.add(n.id);
      while (queue.length) {
        const cur = queue.shift()!;
        comp.push(cur);
        for (const nxt of adj.get(cur) || []) {
          if (visited.has(nxt)) continue;
          visited.add(nxt);
          queue.push(nxt);
        }
      }
      components.push(comp);
    }
    if (components.length <= 1) return nodes;

      const ringRadius = components.length <= 4 ? 1.2 : (components.length <= 8 ? 1.8 : 2.6);
    components.forEach((comp, i) => {
      const angle = (i / components.length) * Math.PI * 2;
      const targetCx = Math.cos(angle) * ringRadius;
      const targetCy = Math.sin(angle) * ringRadius;

      let cx = 0;
      let cy = 0;
      let cz = 0;
      comp.forEach((id) => {
        const n = byId.get(id)!;
        cx += n.x || 0;
        cy += n.y || 0;
        cz += n.z || 0;
      });
      cx /= comp.length;
      cy /= comp.length;
      cz /= comp.length;

      const shiftX = targetCx - cx;
      const shiftY = targetCy - cy;
      const shiftZ = -cz * 0.6;
      comp.forEach((id) => {
        const n = byId.get(id)!;
        n.x = (n.x || 0) + shiftX;
        n.y = (n.y || 0) + shiftY;
        n.z = (n.z || 0) + shiftZ;
      });
    });

    return nodes;
  };

  // Force simulation
  useEffect(() => {
    const nodes = neurons.map(n => ({ ...n }));
    const nodeIds = new Set(nodes.map(n => n.id));
    const links = synapses
      .filter(s => nodeIds.has(s.source) && nodeIds.has(s.target))
      .map(s => ({ ...s }));

    if (focusNodeId) {
      // Focused layout: selected node at center, connected around it
      const focusNode = nodes.find(n => n.id === focusNodeId);
      if (focusNode) {
        focusNode.x = 0;
        focusNode.y = 0;
        focusNode.z = 0;

        const connectedToFocus = new Set<string>();
        links.forEach(link => {
          if (link.source === focusNodeId) connectedToFocus.add(link.target as string);
          if (link.target === focusNodeId) connectedToFocus.add(link.source);
        });

        const otherNodes = nodes.filter(n => n.id !== focusNodeId);
        const directConnected = otherNodes.filter(n => connectedToFocus.has(n.id));
        const indirectConnected = otherNodes.filter(n => !connectedToFocus.has(n.id));

        directConnected.forEach((node, i) => {
          const angle = (i / directConnected.length) * Math.PI * 2;
          node.x = Math.cos(angle) * 3;
          node.y = Math.sin(angle) * 3;
          node.z = 0;
        });

        indirectConnected.forEach((node, i) => {
          const angle = (i / Math.max(1, indirectConnected.length)) * Math.PI * 2;
          node.x = Math.cos(angle) * 5.5;
          node.y = Math.sin(angle) * 5.5;
          node.z = 0;
        });

        setPositionedNodes(nodes);
      }
    } else {
      // Standard force layout — preserve existing positions
      const prevPos = previousPositionsRef.current;
      const hasNewNodes = nodes.some(n => !prevPos.has(n.id));

      // Keep previous positions as starting points.
      // Do not hard-pin when new nodes arrive (prevents spiral/snail layouts).
      nodes.forEach(n => {
        const prev = prevPos.get(n.id);
        if (prev) {
          n.x = prev.x;
          n.y = prev.y;
          n.z = prev.z;
          if (!hasNewNodes) {
            (n as any).fx = prev.x;
            (n as any).fy = prev.y;
            (n as any).fz = prev.z;
          }
        }
      });

      const smallGraph = nodes.length <= 8;
      const linkDistance = smallGraph ? 2.1 : 3.8;
      const chargeStrength = smallGraph ? -3.1 : -8.5;
      const centerStrength = smallGraph ? 0.18 : 0.05;
      const axisStrength = smallGraph ? 0.1 : 0.02;

      const sim = forceSimulation<Neuron>(nodes)
        .force('link', forceLink<Neuron, any>(links).id(d => d.id).distance(linkDistance).strength(0.55))
        .force('charge', forceManyBody().strength(chargeStrength))
        .force('center', forceCenter(0, 0, 0).strength(centerStrength))
        .force('x', forceX(0).strength(axisStrength))
        .force('y', forceY(0).strength(axisStrength))
        .force('z', forceZ(0).strength(axisStrength))
        .force('categoryX', forceX((d: any) => getCategoryAnchor(d.category as Category).x).strength(smallGraph ? 0.04 : 0.07))
        .force('categoryY', forceY((d: any) => getCategoryAnchor(d.category as Category).y).strength(smallGraph ? 0.04 : 0.07))
        .force('categoryZ', forceZ((d: any) => getCategoryAnchor(d.category as Category).z).strength(smallGraph ? 0.02 : 0.05))
        .stop();

      const iterations = hasNewNodes ? 300 : 50;
      for (let i = 0; i < iterations; i++) sim.tick();

      // Unpin and save
      nodes.forEach(n => {
        delete (n as any).fx;
        delete (n as any).fy;
        delete (n as any).fz;
      });

      normalizeLayoutSpread(nodes);
      clusterByConnectedComponents(nodes, links);
      normalizeLayoutSpread(nodes);

      const newPosMap = new Map<string, { x: number; y: number; z: number }>();
      nodes.forEach(n => {
        newPosMap.set(n.id, { x: n.x || 0, y: n.y || 0, z: n.z || 0 });
      });
      previousPositionsRef.current = newPosMap;

      setPositionedNodes(nodes);
    }
  }, [neurons, synapses, focusNodeId, recenterNonce]);

  const activeSearchTarget = useMemo(() => {
    if (!searchTarget) return null;
    return positionedNodes.find(n => n.id === searchTarget.id) || null;
  }, [searchTarget, positionedNodes]);

  const handleNeuronClick = (neuron: Neuron) => {
    setFocusNodeId(focusNodeId === neuron.id ? null : neuron.id);
    onNeuronClick(neuron);
  };

  useEffect(() => {
    if (!recenterNonce) return;
    previousPositionsRef.current = new Map();
    setFocusNodeId(null);
    setAutoCameraEnabled(true);
  }, [recenterNonce]);

  return (
    <div
      className="w-full h-full relative"
      style={{
        background:
          'radial-gradient(circle at 50% 22%, #0c1228 0%, #060d1f 36%, #030714 66%, #010309 100%)',
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none z-[1]"
        style={{
          background:
            'radial-gradient(circle at 50% 42%, rgba(40,65,140,0.07) 0%, rgba(15,30,80,0.04) 28%, rgba(2,4,12,0.0) 72%)',
        }}
      />
      <Canvas camera={{ position: [0, 0, 12], fov: 60 }}>
        <color attach="background" args={['#020510']} />
        <ambientLight intensity={0.28} />
        <pointLight position={[10, 10, 10]} intensity={0.6} />

        <RotatingStarField />

        <group>
          {/* Render synapses FIRST (behind nodes) */}
          {synapses
            .filter(s => positionedNodes.some(n => n.id === s.source) && positionedNodes.some(n => n.id === s.target))
            .map((s, i) => {
              const source = positionedNodes.find(n => n.id === s.source);
              const isDimmed = filterCategory !== 'all' && source?.category !== filterCategory;
              return (
                <SynapseLine
                  key={`${s.source}-${s.target}-${i}`}
                  synapse={s}
                  neurons={positionedNodes}
                  isDimmed={isDimmed}
                  onClick={() => onSynapseClick(s)}
                  compactMode={compactMode}
                />
              );
            })}

          {/* Render nodes */}
          {positionedNodes.map(n => {
            const isDimmed = filterCategory !== 'all' && n.category !== filterCategory;
            const isFocused = focusNodeId === n.id;
            return (
              <NeuronNode
                key={n.id}
                neuron={n}
                onClick={() => handleNeuronClick(n)}
                isDimmed={isDimmed}
                isFocused={isFocused}
                compactMode={compactMode}
              />
            );
          })}
        </group>

        <CameraController
          targetNode={activeSearchTarget}
          isFlying={isFlying}
          isFocused={focusNodeId !== null}
          newNodesCentroid={newNodesCentroid}
          graphCenter={graphCenter}
          graphRadius={graphRadius}
          autoCameraEnabled={autoCameraEnabled}
        />

        <EffectComposer>
          <Bloom luminanceThreshold={0.25} luminanceSmoothing={0.92} height={300} intensity={0.45} />
        </EffectComposer>

        <OrbitControls
          makeDefault
          autoRotate={autoCameraEnabled && !activeSearchTarget && !isFlying && !focusNodeId && !newNodesCentroid}
          autoRotateSpeed={0.2}
          enableDamping
          dampingFactor={0.05}
          enablePan={true}
          screenSpacePanning={true}
          minDistance={1}
          maxDistance={90}
          onStart={() => setAutoCameraEnabled(false)}
        />
      </Canvas>
    </div>
  );
}
