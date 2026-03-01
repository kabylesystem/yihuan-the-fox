import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Text } from '@react-three/drei';
import * as THREE from 'three';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceX, forceY } from 'd3-force-3d';
import { Neuron, Synapse, Category } from '../types';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { FlightCameraRig } from './navigation/FlightCameraRig';
import { FlightModeBranch, FlightModePhase } from './navigation/flightTypes';

const CATEGORY_COLORS: Record<Category, string> = {
  work: '#3b82f6', // blue
  daily: '#ec4899', // pink
  travel: '#10b981', // emerald
  social: '#f59e0b', // amber
  academic: '#8b5cf6', // violet
  coding: '#00ffff', // cyan
  other: '#6b7280', // gray
};

function ShootingStar({ onComplete }: { onComplete: () => void }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [startPos] = useState(() => new THREE.Vector3(
    (Math.random() - 0.5) * 40,
    (Math.random() - 0.5) * 40,
    -50
  ));
  const [endPos] = useState(() => new THREE.Vector3(
    (Math.random() - 0.5) * 10,
    (Math.random() - 0.5) * 10,
    10
  ));
  const [progress, setProgress] = useState(0);

  useFrame((state, delta) => {
    if (progress < 1) {
      const newProgress = progress + delta * 1.5;
      setProgress(newProgress);
      if (meshRef.current) {
        meshRef.current.position.lerpVectors(startPos, endPos, newProgress);
        meshRef.current.scale.setScalar(1 + Math.sin(newProgress * Math.PI) * 2);
      }
    } else {
      onComplete();
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.2, 16, 16]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={1 - progress} />
      <pointLight intensity={2} color="#ffffff" distance={5} />
    </mesh>
  );
}

function NeuronNode({
  neuron,
  onClick,
  isDimmed,
  isFocused,
  relightGlowProgress,
}: {
  neuron: Neuron;
  onClick: () => void;
  isDimmed: boolean;
  isFocused?: boolean;
  relightGlowProgress: number | null;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      const time = state.clock.getElapsedTime();
      // Slower pulse based on potential and strength
      let pulse = 1 + Math.sin(time * 0.8 * neuron.potential) * 0.03;
      const baseScale = neuron.type === 'soma' ? 1.2 : 0.7;
      const strengthScale = 0.5 + neuron.strength * 0.5;
      const relightProgress = THREE.MathUtils.clamp(relightGlowProgress ?? 1, 0, 1);
      const hasRelightOverride = relightGlowProgress !== null;
      
      // Enhanced scale when focused
      let scale = pulse * baseScale * strengthScale;
      if (isFocused) {
        scale *= 1.3; // Make focused node 30% larger
      }
      if (hasRelightOverride) {
        scale *= 0.86 + relightProgress * 0.24;
      }
      
      meshRef.current.scale.setScalar(scale);
      
      // Opacity for shadow nodes
      if (neuron.isShadow) {
        (meshRef.current.material as THREE.MeshStandardMaterial).opacity = 0.3;
        (meshRef.current.material as THREE.MeshStandardMaterial).transparent = true;
      } else {
        const opacity = hasRelightOverride ? THREE.MathUtils.lerp(0.22, 1, relightProgress) : (isDimmed ? 0.2 : 1);
        (meshRef.current.material as THREE.MeshStandardMaterial).opacity = opacity;
        (meshRef.current.material as THREE.MeshStandardMaterial).transparent = isDimmed || hasRelightOverride;
      }
    }
  });

  const relightProgress = THREE.MathUtils.clamp(relightGlowProgress ?? 1, 0, 1);
  const hasRelightOverride = relightGlowProgress !== null;
  const baseEmissive = neuron.isShadow ? 0.02 : (isDimmed ? 0.01 : 0.08 + neuron.strength * 0.12);
  const emissiveIntensity = hasRelightOverride
    ? THREE.MathUtils.lerp(0.01, 0.3, relightProgress)
    : baseEmissive;
  const textOpacity = neuron.isShadow
    ? 0.3
    : hasRelightOverride
      ? THREE.MathUtils.lerp(0.15, 1, relightProgress)
      : (isDimmed ? 0.1 : 1);

  return (
    <group position={[neuron.x || 0, neuron.y || 0, neuron.z || 0]}>
      <mesh ref={meshRef} onClick={onClick}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial 
          color={CATEGORY_COLORS[neuron.category]} 
          emissive={CATEGORY_COLORS[neuron.category]}
          emissiveIntensity={emissiveIntensity}
          metalness={0.4}
          roughness={0.6}
        />
      </mesh>
      <Text
        position={[0, 0.4, 0]}
        fontSize={0.15}
        color="white"
        anchorX="center"
        anchorY="middle"
        maxWidth={2}
        fillOpacity={textOpacity}
      >
        {neuron.label}
      </Text>
    </group>
  );
}

function SynapseLine({ synapse, neurons, isDimmed, onClick }: { synapse: Synapse; neurons: Neuron[]; isDimmed: boolean; onClick: () => void }) {
  const source = neurons.find(n => n.id === synapse.source);
  const target = neurons.find(n => n.id === synapse.target);
  const signalRef = useRef<THREE.Mesh>(null);
  const lineRef = useRef<THREE.Mesh>(null);

  const points = useMemo(() => {
    if (!source || !target) return [];
    const start = new THREE.Vector3(source.x || 0, source.y || 0, source.z || 0);
    const end = new THREE.Vector3(target.x || 0, target.y || 0, target.z || 0);
    
    // Create a curved path by adding a midpoint with an offset
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

  useFrame((state) => {
    // Update line opacity with pulsing effect
    if (lineRef.current && lineRef.current.material) {
      const pulse = 0.4 + Math.sin(state.clock.getElapsedTime() * 3) * 0.3;
      (lineRef.current.material as THREE.MeshBasicMaterial).opacity = isDimmed ? 0.02 : (synapse.strength * pulse);
    }

    // Update signal particle movement
    if (signalRef.current && curve) {
      const t = (state.clock.getElapsedTime() * 0.8) % 1;
      const pos = curve.getPoint(t);
      signalRef.current.position.copy(pos);
      signalRef.current.scale.setScalar(0.06 + Math.sin(state.clock.getElapsedTime() * 8) * 0.02);
      
      const signalMaterial = signalRef.current.material as THREE.MeshBasicMaterial;
      signalMaterial.opacity = 0.6 + Math.sin(state.clock.getElapsedTime() * 6) * 0.4;
    }
  });

  if (!source || !target || points.length < 3 || !curve) return null;

  return (
    <group onClick={(e) => { e.stopPropagation(); onClick(); }}>
      {/* Slim bright core line - high visibility at any angle */}
      <mesh ref={lineRef}>
        <tubeGeometry args={[curve, 20, 0.004, 5, false]} />
        <meshBasicMaterial 
          color={0xffffff}
          transparent
          opacity={isDimmed ? 0.02 : (synapse.strength * 0.85)}
          fog={false}
          toneMapped={false}
        />
      </mesh>

      {/* Colored accent layer */}
      <mesh>
        <tubeGeometry args={[curve, 20, 0.008, 5, false]} />
        <meshBasicMaterial 
          color={CATEGORY_COLORS[source?.category || 'other']}
          transparent
          opacity={isDimmed ? 0.01 : (synapse.strength * 0.5)}
          fog={false}
          toneMapped={false}
        />
      </mesh>

      {/* Traveling signal particle showing flow direction */}
      {!isDimmed && (
        <mesh ref={signalRef}>
          <sphereGeometry args={[0.02, 12, 12]} />
          <meshBasicMaterial 
            color={CATEGORY_COLORS[source?.category || 'other']} 
            transparent
            opacity={0.7}
          />
          <pointLight intensity={2} color={CATEGORY_COLORS[source?.category || 'other']} distance={1.2} />
        </mesh>
      )}

      {/* Multiple pulse waves along the line */}
      {!isDimmed && [0, 0.33, 0.66].map((offset, i) => (
        <PulseWave key={i} curve={curve} offset={offset} strength={synapse.strength} color={CATEGORY_COLORS[source?.category || 'other']} />
      ))}

      {/* Direction arrows along the line - show language flow direction */}
      {!isDimmed && [0.25, 0.5, 0.75].map((position, i) => (
        <FlowArrow key={`arrow-${i}`} curve={curve} position={position} color={CATEGORY_COLORS[source?.category || 'other']} />
      ))}
    </group>
  );
}

function FlowArrow({ curve, position, color }: { curve: THREE.Curve<THREE.Vector3>; position: number; color: string }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current) {
      // Get position on curve
      const pos = curve.getPoint(position);
      groupRef.current.position.copy(pos);
      
      // Get forward direction (tangent)
      const forward = curve.getTangent(position).normalize();
      
      // Get perpendicular directions for proper orientation
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(up, forward).normalize();
      const adjustedUp = new THREE.Vector3().crossVectors(forward, right).normalize();
      
      // Build rotation matrix from basis vectors for smooth orientation
      const matrix = new THREE.Matrix4();
      matrix.makeBasis(right, adjustedUp, forward);
      groupRef.current.quaternion.setFromRotationMatrix(matrix);
      
      // Subtle pulsing for natural visibility
      const pulse = 0.6 + Math.sin(state.clock.getElapsedTime() * 2) * 0.25;
      groupRef.current.children.forEach(child => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
          child.material.opacity = pulse;
        }
      });
    }
  });

  return (
    <group ref={groupRef}>
      {/* Streamlined arrow head - smooth shape pointing forward */}
      <mesh position={[0, 0, 0.02]}>
        <coneGeometry args={[0.01, 0.04, 6]} />
        <meshBasicMaterial 
          color={color}
          transparent
          opacity={0.7}
          toneMapped={false}
        />
        <pointLight intensity={1.2} color={color} distance={0.6} />
      </mesh>
      
      {/* Elegant middle sphere - flow marker */}
      <mesh position={[0, 0, -0.005]}>
        <sphereGeometry args={[0.008, 6, 6]} />
        <meshBasicMaterial 
          color={color}
          transparent
          opacity={0.5}
          toneMapped={false}
        />
      </mesh>
      
      {/* Subtle glow trail - fading effect */}
      <mesh position={[0, 0, -0.02]}>
        <sphereGeometry args={[0.012, 5, 5]} />
        <meshBasicMaterial 
          color={color}
          transparent
          opacity={0.25}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function DirectionArrow({ curve, position, color }: { curve: THREE.Curve<THREE.Vector3>; position: number; color: string }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (groupRef.current) {
      // Get position on curve
      const pos = curve.getPoint(position);
      groupRef.current.position.copy(pos);
      
      // Get tangent direction
      const tangent = curve.getTangent(position).normalize();
      
      // Calculate rotation to point along tangent
      const axis = new THREE.Vector3(0, 0, 1).cross(tangent);
      if (axis.length() > 0.001) {
        const angle = Math.acos(Math.min(1, Math.max(-1, new THREE.Vector3(0, 0, 1).dot(tangent))));
        groupRef.current.quaternion.setFromAxisAngle(axis.normalize(), angle);
      }
    }
  });

  return (
    <group ref={groupRef}>
      {/* Arrow head - cone pointing forward */}
      <mesh position={[0, 0, 0]}>
        <coneGeometry args={[0.015, 0.05, 8]} />
        <meshBasicMaterial 
          color={color}
          transparent
          opacity={0.6}
          toneMapped={false}
        />
      </mesh>
      
      {/* Arrow shaft - thin line */}
      <mesh position={[0, -0.04, 0]}>
        <cylinderGeometry args={[0.004, 0.004, 0.03, 4]} />
        <meshBasicMaterial 
          color={color}
          transparent
          opacity={0.5}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function PulseWave({ curve, offset, strength, color }: { curve: THREE.Curve<THREE.Vector3>; offset: number; strength: number; color: string }) {
  const pulseGroupRef = useRef<THREE.Group>(null);
  const pulseGeometryRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (pulseGroupRef.current && pulseGeometryRef.current) {
      const t = (state.clock.getElapsedTime() * 0.6 + offset) % 1;
      const pos = curve.getPoint(t);
      pulseGroupRef.current.position.copy(pos);
      
      // Very subtle pulse expansion
      const pulseScale = Math.sin(t * Math.PI) * 0.03;
      pulseGroupRef.current.scale.setScalar(Math.max(0.01, pulseScale));
      
      // Gentle opacity fade
      const pulseOpacity = (1 - t) * 0.25;
      const material = pulseGeometryRef.current.material as THREE.MeshBasicMaterial;
      if (material) material.opacity = pulseOpacity;
    }
  });

  return (
    <group ref={pulseGroupRef}>
      <mesh ref={pulseGeometryRef}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshBasicMaterial 
          color={color}
          transparent
          opacity={0.25}
        />
        <pointLight intensity={1.5} color={color} distance={1} />
      </mesh>
    </group>
  );
}

export function NebulaCanvas({
  neurons,
  synapses,
  onNeuronClick,
  onSynapseClick,
  filterCategory,
  searchTarget,
  timePulse,
  shootingStars,
  onShootingStarComplete,
  isFlying,
  flightPhase,
  flightBranch,
  relightTargetId,
  relightGlowProgress,
  onFlightTravelArrive,
  onFlightFocusComplete,
}: {
  neurons: Neuron[]; 
  synapses: Synapse[];
  onNeuronClick: (n: Neuron) => void;
  onSynapseClick: (s: Synapse) => void;
  filterCategory: Category | 'all';
  searchTarget: Neuron | null;
  timePulse: number; // 0 to 1
  shootingStars: string[]; // IDs of shooting stars
  onShootingStarComplete: (id: string) => void;
  isFlying: boolean;
  flightPhase: FlightModePhase;
  flightBranch: FlightModeBranch;
  relightTargetId: string | null;
  relightGlowProgress: number;
  onFlightTravelArrive: () => void;
  onFlightFocusComplete: () => void;
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
      const sim = forceSimulation<Neuron>(nodes)
        .force('link', forceLink<Neuron, any>(links).id(d => d.id).distance(0.1))
        .force('charge', forceManyBody().strength(-0.5))
        .force('center', forceCenter(0, 0, 0))
        .force('dnaX', forceX<Neuron>(d => {
          if (!d.grammarDna) return 0;
          const hash = d.grammarDna.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0);
          return (hash % 1);
        }).strength(0.005))
        .force('dnaY', forceY<Neuron>(d => {
          if (!d.grammarDna) return 0;
          const hash = d.grammarDna.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0);
          return ((hash / 1) % 1);
        }).strength(0.005))
        .stop();
      
      for (let i = 0; i < 300; i++) sim.tick();
      setPositionedNodes(nodes);
    }
  }, [neurons, synapses, focusNodeId]);

  // Find the actual positioned node for searching
  const activeSearchTarget = useMemo(() => {
    if (!searchTarget) return null;
    return positionedNodes.find(n => n.id === searchTarget.id) || null;
  }, [searchTarget, positionedNodes]);

  const handleNeuronClick = (neuron: Neuron) => {
    // Toggle focus on this node
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
            const decay = Math.max(0, n.strength - timePulse);
            const isDimmed = (filterCategory !== 'all' && n.category !== filterCategory) || (decay < 0.1 && !n.isShadow);
            const isFocused = focusNodeId === n.id;
            const nodeRelightProgress = relightTargetId === n.id ? relightGlowProgress : null;
            
            return (
              <NeuronNode 
                key={n.id} 
                neuron={n} 
                onClick={() => handleNeuronClick(n)} 
                isDimmed={isDimmed}
                isFocused={isFocused}
                relightGlowProgress={nodeRelightProgress}
              />
            );
          })}
          {synapses.map((s, i) => {
            const source = positionedNodes.find(n => n.id === s.source);
            const isDimmed = filterCategory !== 'all' && source?.category !== filterCategory;
            return (
              <SynapseLine key={`${s.source}-${s.target}-${i}`} synapse={s} neurons={positionedNodes} isDimmed={isDimmed} onClick={() => onSynapseClick(s)} />
            );
          })}
          {shootingStars.map(id => (
            <ShootingStar key={id} onComplete={() => onShootingStarComplete(id)} />
          ))}
        </group>

        <FlightCameraRig
          phase={isFlying ? flightPhase : 'hidden'}
          branch={flightBranch}
          nodes={positionedNodes}
          searchTarget={activeSearchTarget}
          relightTargetId={relightTargetId}
          onTravelArrive={onFlightTravelArrive}
          onFocusComplete={onFlightFocusComplete}
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
