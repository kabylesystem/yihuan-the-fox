import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Text } from '@react-three/drei';
import * as THREE from 'three';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceX, forceY, forceZ } from 'd3-force-3d';
import { Neuron, Synapse, Category } from '../types';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { FlightCameraRig } from './navigation/FlightCameraRig';
import { FlightModeBranch, FlightModePhase } from './navigation/flightTypes';

const CATEGORY_COLORS: Record<Category, string> = {
  work:     '#3b82f6',
  daily:    '#ec4899',
  travel:   '#10b981',
  social:   '#f59e0b',
  academic: '#8b5cf6',
  coding:   '#00ffff',
  other:    '#6b7280',
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
      const baseScale = neuron.type === 'soma' ? 1.4 : 0.75;
      const strengthScale = 0.5 + neuron.strength * 0.6;

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
      if (neuron.isShadow) {
        mat.opacity = 0.3;
        mat.transparent = true;
      } else if (isNew) {
        // Brand-new neuron: very dark, barely visible — recede into darkness
        mat.opacity = 0.06;
        mat.transparent = true;
      } else if (isHighlighted) {
        // Fully lit — bioluminescent
        mat.opacity = 1.0;
        mat.transparent = false;
      } else if (isStreamingActive) {
        // Non-highlighted old nodes recede into darkness during streaming
        mat.opacity = isDimmed ? 0.05 : 0.1;
        mat.transparent = true;
      } else {
        mat.opacity = isDimmed ? 0.15 : 1;
        mat.transparent = isDimmed || false;
      }
    }
  });

  // isHighlighted overrides dimming — force full brightness on referenced old nodes
  const effectiveDimmed = isHighlighted ? false : (isNew ? true : isDimmed);

  const emissiveIntensity = neuron.isShadow
    ? 0.02
    : isNew
      ? 0.0
      : isHighlighted
        ? 1.2 + neuron.strength * 0.8   // deep bioluminescent blast
        : isStreamingActive
          ? 0.005                          // everything else nearly dead
          : effectiveDimmed
            ? 0.01
            : neuron.type === 'soma'
              ? 0.15 + neuron.strength * 0.25
              : 0.06 + neuron.strength * 0.1;

  // Grey color for new unconnected neurons; normal category color otherwise
  const displayColor = isNew ? '#1f2937' : CATEGORY_COLORS[neuron.category];
  // Highlighted: use a saturated/intensified version of the category color
  const emissiveColor = isHighlighted ? CATEGORY_COLORS[neuron.category] : (isNew ? '#0f1117' : CATEGORY_COLORS[neuron.category]);

  return (
    <group position={[neuron.x || 0, neuron.y || 0, neuron.z || 0]}>
      <mesh ref={meshRef} onClick={onClick}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial
          color={displayColor}
          emissive={emissiveColor}
          emissiveIntensity={emissiveIntensity}
          metalness={isHighlighted ? 0.1 : 0.4}
          roughness={isHighlighted ? 0.2 : 0.6}
        />
      </mesh>
      {/* Point light halo for highlighted nodes — bioluminescent bloom source */}
      {isHighlighted && (
        <pointLight
          color={CATEGORY_COLORS[neuron.category]}
          intensity={6}
          distance={3.5}
          decay={2}
        />
      )}
      <Text
        position={[0, 0.35, 0]}
        fontSize={0.1}
        color="white"
        anchorX="center"
        anchorY="middle"
        maxWidth={2.5}
        fillOpacity={neuron.isShadow ? 0.3 : isNew ? 0.04 : isHighlighted ? 1.0 : isStreamingActive ? 0.06 : effectiveDimmed ? 0.1 : 0.9}
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
function CameraController({ targetNode, isFocused, positionedNodes }: { targetNode: Neuron | null; isFocused?: boolean; positionedNodes?: Neuron[] }) {
  const { camera, controls } = useThree() as any;
  const lastNodeCount = useRef(0);

  // Auto-fit camera when node count changes (new data generated)
  useEffect(() => {
    if (!positionedNodes || positionedNodes.length === 0) return;
    if (positionedNodes.length === lastNodeCount.current) return;
    lastNodeCount.current = positionedNodes.length;

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

  useFrame(() => {
    if (isFocused && targetNode && targetNode.x !== undefined) {
      const targetPos = new THREE.Vector3(targetNode.x, targetNode.y, targetNode.z + 8);
      camera.position.lerp(targetPos, 0.08);
      if (controls) {
        controls.target.lerp(new THREE.Vector3(targetNode.x, targetNode.y, targetNode.z), 0.08);
      }
    } else if (targetNode && targetNode.x !== undefined) {
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
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);

  useEffect(() => {
    // Clone to avoid mutating props
    const nodes = neurons.map(n => ({ ...n }));
    const links = synapses.map(s => ({ ...s }));

    // If there's a focus node, use different positioning strategy
    if (focusNodeId) {
      const focusNode = nodes.find(n => n.id === focusNodeId);
      if (focusNode) {
        // Place focus node at center
        focusNode.x = 0;
        focusNode.y = 0;
        focusNode.z = 0;

        // Arrange connected nodes in circles around the focus node
        const connectedToFocus = new Set<string>();
        links.forEach(link => {
          if (link.source === focusNodeId) connectedToFocus.add(link.target as string);
          if (link.target === focusNodeId) connectedToFocus.add(link.source);
        });

        const otherNodes = nodes.filter(n => n.id !== focusNodeId);
        const directConnected = otherNodes.filter(n => connectedToFocus.has(n.id));
        const indirectConnected = otherNodes.filter(n => !connectedToFocus.has(n.id));

        // Place direct connections in inner circle (radius ~3)
        directConnected.forEach((node, i) => {
          const angle = (i / directConnected.length) * Math.PI * 2;
          const radius = 3;
          node.x = Math.cos(angle) * radius;
          node.y = Math.sin(angle) * radius;
          node.z = Math.cos(angle * 0.5) * radius * 0.3;
        });

        // Place indirect connections in outer circle (radius ~6)
        indirectConnected.forEach((node, i) => {
          const angle = (i / indirectConnected.length) * Math.PI * 2;
          const radius = 6;
          node.x = Math.cos(angle) * radius;
          node.y = Math.sin(angle) * radius;
          node.z = Math.cos(angle * 0.5) * radius * 0.5;
        });

        setPositionedNodes(nodes);
      }
    } else {
      // Normal force-directed simulation
      const n = nodes.length;
      const scale = Math.max(0.25, Math.min(1.0, 8 / Math.sqrt(n)));
      const linkClose = 0.18 * scale;
      const linkFar   = 0.35 * scale;

      // ── Seed initial positions randomly in 3D so the simulation has
      //    depth to work with — avoids collapsing to a flat plane ──────
      const rng = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
      for (const node of nodes) {
        if (node.x === undefined) {
          node.x = rng(-1, 1);
          node.y = rng(-1, 1);
          node.z = rng(-1, 1);
        }
      }

      // ── Category anchors: spread on a sphere using golden-ratio
      //    latitude spacing so no two clusters share the same Z plane ───
      const categories = [...new Set(nodes.map(d => d.category))];
      const catCount = categories.length || 1;
      const ringR = Math.max(0.5, 1.6 * scale);
      const catAnchors: Record<string, { x: number; y: number; z: number }> = {};
      categories.forEach((cat, idx) => {
        // golden-angle spiral on a sphere → even 3D spread
        const phi   = Math.acos(1 - 2 * (idx + 0.5) / catCount);   // polar [0,π]
        const theta = Math.PI * (1 + Math.sqrt(5)) * idx;            // azimuth
        catAnchors[cat] = {
          x: ringR * Math.sin(phi) * Math.cos(theta),
          y: ringR * Math.cos(phi),                   // full Y range — no flatten
          z: ringR * Math.sin(phi) * Math.sin(theta),
        };
      });

      const sim = forceSimulation<Neuron>(nodes, 3)
        .force('link', forceLink<Neuron, any>(links).id(d => d.id).distance((link: any) => {
          return link.type === 'logical' ? linkClose : linkFar;
        }).strength(0.7))
        // Moderate repulsion — separates nodes in 3D space
        .force('charge', forceManyBody().strength(-1.5 * scale))
        // Light center gravity — keeps cloud visible without collapsing depth
        .force('center', forceCenter(0, 0, 0).strength(0.4))
        // Category clustering — equal weight on all 3 axes → true 3D clusters
        .force('catX', forceX<Neuron>(d => catAnchors[d.category]?.x ?? 0).strength(0.5))
        .force('catY', forceY<Neuron>(d => {
          const base = catAnchors[d.category]?.y ?? 0;
          return base + (d.type === 'soma' ? 0.06 * scale : -0.06 * scale);
        }).strength(0.5))
        .force('catZ', forceZ<Neuron>(d => catAnchors[d.category]?.z ?? 0).strength(0.5))
        .stop();

      for (let i = 0; i < 500; i++) sim.tick();
      setPositionedNodes(nodes);
    }
  }, [neurons, synapses, focusNodeId]);

  // Find the actual positioned node for searching
  const activeSearchTarget = useMemo(() => {
    if (!searchTarget) return null;
    return positionedNodes.find(n => n.id === searchTarget.id) || null;
  }, [searchTarget, positionedNodes]);

  const handleNeuronClick = (neuron: Neuron) => {
    if (focusNodeId === neuron.id) {
      setFocusNodeId(null);
    } else {
      setFocusNodeId(neuron.id);
    }
    onNeuronClick(neuron);
  };

  return (
    <div className="w-full h-full bg-black">
      <Canvas camera={{ position: [0, 0, 20], fov: 60 }}>
        <color attach="background" args={['#020205']} />
        <ambientLight intensity={0.4} />
        <pointLight position={[10, 10, 10]} intensity={1.5} />

        <Stars radius={100} depth={50} count={10000} factor={4} saturation={0} fade speed={1} />

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
                isFocused={focusNodeId === n.id}
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
          <CameraController targetNode={activeSearchTarget} isFocused={focusNodeId !== null} positionedNodes={positionedNodes} />
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

        <EffectComposer>
          <Bloom luminanceThreshold={0.1} luminanceSmoothing={0.9} height={300} intensity={1.5} />
        </EffectComposer>

        <OrbitControls
          makeDefault
          autoRotate={!activeSearchTarget && !isFlying && !focusNodeId}
          autoRotateSpeed={0.3}
          enableDamping
          dampingFactor={0.05}
          enablePan={true}
          screenSpacePanning={true}
        />
      </Canvas>
    </div>
  );
}
