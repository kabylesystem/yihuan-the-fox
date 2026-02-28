import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Neuron } from '../../types';
import type { NavigationFlightState, NavigationIntent, NavigationTarget, StarcoreData } from './types';
import { bezier3, easeInOutCubic, easeOutCubic, makeTravelCurve } from './curves';

const APPEAR_MS = 420;
const HOLD_MS = 4000;
const TRAVEL_MS = 1000;
const FOCUS_MS = 520;
const PANEL_MS = 300;
const RELIGHT_ACTION_MS = 1100;
const FRONTIER_GROW_MS = 1600;

export interface NavigationMachineOutput {
  state: NavigationFlightState;
  intent: NavigationIntent;
  shipPos: THREE.Vector3;
  shipQuat: THREE.Quaternion;
  shipScale: number;
  shipThruster: number; // 0..1
  shipEnergyPulse: number; // 0..1

  cameraPos: THREE.Vector3;
  cameraTarget: THREE.Vector3;

  target: NavigationTarget;
  hudPrimary: string;
  hudSecondary?: string;
  panelVisible: boolean;
  panelProgress01: number;
  starcore?: StarcoreData;

  // Frontier effects
  frontierVisible: boolean;
  frontierProgress01: number;
  connectionFrom?: THREE.Vector3;
  connectionTo?: THREE.Vector3;

  // Relight effects
  relightPulse01: number;
}

function formatPercent(v01: number) {
  return `${Math.round(v01 * 100)}%`;
}

function pickDimmingTarget(nodes: Neuron[], timePulse: number): Neuron | null {
  const candidates = nodes
    .filter((n) => !n.isShadow)
    .map((n) => ({ n, decay: Math.max(0, n.strength - timePulse) }))
    .filter((x) => x.decay < 0.14);

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.decay - b.decay);
  return candidates[0].n;
}

function computeBounds(nodes: Neuron[]) {
  const center = new THREE.Vector3();
  const valid = nodes.filter((n) => typeof n.x === 'number' && typeof n.y === 'number' && typeof n.z === 'number');
  if (valid.length === 0) return { center, radius: 6 };

  for (const n of valid) center.add(new THREE.Vector3(n.x!, n.y!, n.z!));
  center.multiplyScalar(1 / valid.length);

  let radius = 0;
  for (const n of valid) {
    radius = Math.max(radius, center.distanceTo(new THREE.Vector3(n.x!, n.y!, n.z!)));
  }

  return { center, radius: Math.max(4, radius) };
}

function nextSimulatedIntent(): NavigationIntent {
  try {
    const key = 'echoNavSimIntent';
    const last = (localStorage.getItem(key) as NavigationIntent | null) ?? 'relight';
    const next: NavigationIntent = last === 'relight' ? 'explore' : 'relight';
    localStorage.setItem(key, next);
    return last;
  } catch {
    return 'relight';
  }
}

export function useNavigationFlightMachine(opts: {
  enabled: boolean;
  nodes: Neuron[];
  timePulse: number;
  camera: THREE.PerspectiveCamera;
}): NavigationMachineOutput {
  const { enabled, nodes, timePulse, camera } = opts;

  const [state, setState] = useState<NavigationFlightState>('hidden');
  const stateSinceRef = useRef<number>(performance.now());
  const panelOpenedAtRef = useRef<number | null>(null);

  const shipPos = useRef(new THREE.Vector3());
  const shipQuat = useRef(new THREE.Quaternion());
  const shipScale = useRef(0);
  const shipThruster = useRef(0);
  const shipEnergyPulse = useRef(0);

  const camPos = useRef(new THREE.Vector3(0, 0, 20));
  const camTarget = useRef(new THREE.Vector3(0, 0, 0));

  const targetRef = useRef<NavigationTarget>({ kind: 'none', position: new THREE.Vector3(0, 0, 0) });
  const intentRef = useRef<NavigationIntent>('relight');

  const frontierVisible = useRef(false);
  const frontierProgress = useRef(0);
  const relightPulse = useRef(0);

  const travelCurveRef = useRef<ReturnType<typeof makeTravelCurve> | null>(null);
  const camCurveRef = useRef<ReturnType<typeof makeTravelCurve> | null>(null);
  const originSnapshot = useRef<{ ship: THREE.Vector3; cam: THREE.Vector3; camTarget: THREE.Vector3 } | null>(null);

  const { center, radius } = useMemo(() => computeBounds(nodes), [nodes]);

  useEffect(() => {
    if (!enabled) {
      setState('hidden');
      shipScale.current = 0;
      frontierVisible.current = false;
      frontierProgress.current = 0;
      relightPulse.current = 0;
      targetRef.current = { kind: 'none', position: new THREE.Vector3(0, 0, 0) };
      panelOpenedAtRef.current = null;
      return;
    }

    intentRef.current = nextSimulatedIntent();
    setState('appear');
    stateSinceRef.current = performance.now();
  }, [enabled]);

  const output = useMemo<NavigationMachineOutput>(() => {
    return {
      state,
      intent: intentRef.current,
      shipPos: shipPos.current,
      shipQuat: shipQuat.current,
      shipScale: shipScale.current,
      shipThruster: shipThruster.current,
      shipEnergyPulse: shipEnergyPulse.current,
      cameraPos: camPos.current,
      cameraTarget: camTarget.current,
      target: { ...targetRef.current, position: targetRef.current.position },
      hudPrimary: '',
      panelVisible: false,
      panelProgress01: 0,
      frontierVisible: frontierVisible.current,
      frontierProgress01: frontierProgress.current,
      relightPulse01: relightPulse.current,
    };
  }, [state]);

  // Frame step is pulled by caller (NavigationFlightLayer) to avoid stale camera.
  const stepRef = useRef<((dt: number, now: number) => void) | null>(null);

  stepRef.current = (dt: number, now: number) => {
    if (!enabled) return;

    // Anchor ship near bottom-center of the view during appear/idle/hold.
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const idleAnchor = camera.position
      .clone()
      .add(forward.clone().multiplyScalar(6.0))
      .add(up.clone().multiplyScalar(-2.1))
      .add(right.clone().multiplyScalar(0.0));

    const since = now - stateSinceRef.current;

    const setStateNow = (next: NavigationFlightState) => {
      setState(next);
      stateSinceRef.current = now;

      if (next === 'starcoreOpen') {
        panelOpenedAtRef.current = now;
      }
    };

    // Subtle idle signals
    const t = now * 0.001;
    const floatY = Math.sin(t * 1.2) * 0.08;
    const driftX = Math.sin(t * 0.7) * 0.12;
    const driftY = Math.sin(t * 0.9) * 0.05;

    shipThruster.current = 0.5 + 0.5 * Math.sin(t * 2.0);
    shipEnergyPulse.current = 0.5 + 0.5 * Math.sin(t * 1.6 + 1.3);

    if (state === 'appear') {
      const p = easeOutCubic(Math.min(1, since / APPEAR_MS));
      shipScale.current = p;
      shipPos.current.copy(idleAnchor).add(new THREE.Vector3(driftX * 0.4, floatY, 0));

      // Face forward (towards scene) on takeoff/appear.
      const lookAt = idleAnchor.clone().add(forward.clone().multiplyScalar(10));
      const m = new THREE.Matrix4().lookAt(shipPos.current, lookAt, up);
      shipQuat.current.setFromRotationMatrix(m);

      camPos.current.lerp(new THREE.Vector3(0, 0, 20), 0.06);
      camTarget.current.lerp(new THREE.Vector3(0, 0, 0), 0.06);

      if (p >= 1) setStateNow('idle');
      return;
    }

    if (state === 'idle') {
      shipScale.current = 1;
      shipPos.current.copy(idleAnchor).add(new THREE.Vector3(driftX, floatY + driftY, 0));

      const lookAt = shipPos.current.clone().add(forward.clone().multiplyScalar(10));
      const m = new THREE.Matrix4().lookAt(shipPos.current, lookAt, up);
      shipQuat.current.slerp(new THREE.Quaternion().setFromRotationMatrix(m), 0.08);

      camPos.current.lerp(new THREE.Vector3(0, 0, 20), 0.04);
      camTarget.current.lerp(new THREE.Vector3(0, 0, 0), 0.04);

      setStateNow('hold');
      return;
    }

    if (state === 'hold') {
      shipScale.current = 1;
      shipPos.current.copy(idleAnchor).add(new THREE.Vector3(driftX, floatY + driftY, 0));

      const lookAt = shipPos.current.clone().add(forward.clone().multiplyScalar(10));
      const m = new THREE.Matrix4().lookAt(shipPos.current, lookAt, up);
      shipQuat.current.slerp(new THREE.Quaternion().setFromRotationMatrix(m), 0.08);

      camPos.current.lerp(new THREE.Vector3(0, 0, 20), 0.03);
      camTarget.current.lerp(new THREE.Vector3(0, 0, 0), 0.03);

      if (since >= HOLD_MS) setStateNow('assess');
      return;
    }

    if (state === 'assess') {
      const dimming = pickDimmingTarget(nodes, timePulse);
      const frontierPos = center
        .clone()
        .add(new THREE.Vector3(radius + 7.5, 1.6, -4.5));

      if (dimming && typeof dimming.x === 'number') {
        targetRef.current = {
          kind: 'dimmingNode',
          node: dimming,
          position: new THREE.Vector3(dimming.x!, dimming.y!, dimming.z!),
        };
      } else {
        targetRef.current = { kind: 'frontier', position: frontierPos };
      }

      originSnapshot.current = {
        ship: shipPos.current.clone(),
        cam: camPos.current.clone(),
        camTarget: camTarget.current.clone(),
      };

      const targetPos = targetRef.current.position.clone();
      travelCurveRef.current = makeTravelCurve(originSnapshot.current.ship, targetPos);

      const camEnd = targetPos.clone().add(new THREE.Vector3(0, 1.8, 9.0));
      camCurveRef.current = makeTravelCurve(originSnapshot.current.cam, camEnd);

      setStateNow(targetRef.current.kind === 'dimmingNode' ? 'relightTravel' : 'exploreTravel');
      return;
    }

    if (state === 'relightTravel' || state === 'exploreTravel') {
      const p = easeInOutCubic(Math.min(1, since / TRAVEL_MS));
      const curve = travelCurveRef.current;
      const camCurve = camCurveRef.current;
      const startSnap = originSnapshot.current;
      if (!curve || !camCurve || !startSnap) return;

      shipPos.current.copy(bezier3(curve.start, curve.control, curve.end, p));

      // Orientation: face along travel direction
      const aheadT = Math.min(1, p + 0.02);
      const ahead = bezier3(curve.start, curve.control, curve.end, aheadT);
      const dir = ahead.clone().sub(shipPos.current).normalize();
      const lookAt = shipPos.current.clone().add(dir.multiplyScalar(10));
      const m = new THREE.Matrix4().lookAt(shipPos.current, lookAt, new THREE.Vector3(0, 1, 0));
      shipQuat.current.slerp(new THREE.Quaternion().setFromRotationMatrix(m), 0.25);

      // Camera follows with a cinematic lag
      camPos.current.copy(bezier3(camCurve.start, camCurve.control, camCurve.end, p));
      camTarget.current.lerp(targetRef.current.position, 0.08);

      shipThruster.current = 0.9;

      if (p >= 1) setStateNow('focus');
      return;
    }

    if (state === 'focus') {
      const p = easeOutCubic(Math.min(1, since / FOCUS_MS));
      const targetPos = targetRef.current.position.clone();
      const camEnd = targetPos.clone().add(new THREE.Vector3(0, 1.2, 6.2));

      camPos.current.lerp(camEnd, 0.06 + p * 0.04);
      camTarget.current.lerp(targetPos, 0.09);

      // Ship subtle settle
      shipPos.current.lerp(targetPos.clone().add(new THREE.Vector3(0, -0.2, 0.9)), 0.06);
      shipThruster.current = 0.55;

      if (p >= 1) setStateNow('starcoreOpen');
      return;
    }

    if (state === 'starcoreOpen') {
      frontierVisible.current = targetRef.current.kind === 'frontier';
      frontierProgress.current = 0;
      relightPulse.current = 0;

      const p = Math.min(1, since / PANEL_MS);
      if (p >= 1) setStateNow('awaitVoice');
      return;
    }

    if (state === 'awaitVoice') {
      // Hold position, keep camera locked.
      const targetPos = targetRef.current.position;
      camTarget.current.lerp(targetPos, 0.08);

      if (targetRef.current.kind === 'frontier') {
        // If there is no dimming target, immediately proceed as "explore".
        setStateNow('frontierGrow');
        return;
      }

      // Simulate voice response after a brief prompt.
      if (since >= 2400) {
        setStateNow(intentRef.current === 'relight' ? 'relightAction' : 'exploreTravel');

        if (intentRef.current === 'explore') {
          // Rebuild travel to frontier from current position
          const frontierPos = center.clone().add(new THREE.Vector3(radius + 7.5, 1.6, -4.5));
          targetRef.current = { kind: 'frontier', position: frontierPos };
          originSnapshot.current = {
            ship: shipPos.current.clone(),
            cam: camPos.current.clone(),
            camTarget: camTarget.current.clone(),
          };
          travelCurveRef.current = makeTravelCurve(originSnapshot.current.ship, frontierPos);
          camCurveRef.current = makeTravelCurve(originSnapshot.current.cam, frontierPos.clone().add(new THREE.Vector3(0, 1.8, 9.0)));
        }
      }
      return;
    }

    if (state === 'relightAction') {
      const p = Math.min(1, since / RELIGHT_ACTION_MS);
      relightPulse.current = p;
      shipThruster.current = 0.75;

      if (p >= 1) setStateNow('done');
      return;
    }

    if (state === 'frontierGrow') {
      const p = Math.min(1, since / FRONTIER_GROW_MS);
      frontierVisible.current = true;
      frontierProgress.current = p;
      shipThruster.current = 0.55;

      if (p >= 1) setStateNow('done');
      return;
    }

    if (state === 'done') {
      shipThruster.current = 0.45;
      return;
    }
  };

  // Expose stepper to caller
  (output as any).__step = stepRef;

  // Compose HUD + panel data from state
  const composed = useMemo(() => {
    const o: NavigationMachineOutput = {
      ...output,
      hudPrimary: 'Engines online. Setting course…',
      hudSecondary: undefined,
      panelVisible: false,
      panelProgress01: 0,
      starcore: undefined,
      frontierVisible: output.frontierVisible,
      frontierProgress01: output.frontierProgress01,
      relightPulse01: output.relightPulse01,
    };

    const target = targetRef.current;

    if (state === 'appear' || state === 'idle' || state === 'hold') {
      o.hudPrimary = "Engines online. Let's check for a fading nebula signal.";
      o.hudSecondary = 'Stand by — scanning the map ahead.';
    }

    if (state === 'assess') {
      o.hudPrimary = 'Scanning for fading nebula nodes…';
      o.hudSecondary = 'Searching for the next best target.';
    }

    if (state === 'relightTravel') {
      o.hudPrimary = 'Fading signal detected. Moving in.';
      o.hudSecondary = 'Closing distance for a relight check.';
    }

    if (state === 'exploreTravel') {
      o.hudPrimary = 'No urgent fades detected. Heading to the frontier.';
      o.hudSecondary = 'Plotting an expansion corridor.';
    }

    if (state === 'focus' || state === 'starcoreOpen') {
      o.hudPrimary = 'Target acquired.';
      o.hudSecondary = 'Stabilizing view and opening Starcore…';
    }

    if (state === 'awaitVoice') {
      if (target.kind === 'dimmingNode') {
        o.hudPrimary = 'This signal is fading.';
        o.hudSecondary = 'Do you want to relight it, or push into the frontier?';
      } else {
        o.hudPrimary = 'Frontier site confirmed.';
        o.hudSecondary = 'Beginning growth sequence.';
      }
    }

    if (state === 'relightAction') {
      o.hudPrimary = 'Relight pulse released.';
      o.hudSecondary = 'Reinforcing recall pathways.';
    }

    if (state === 'frontierGrow') {
      o.hudPrimary = 'New nebula forming.';
      o.hudSecondary = 'Linking into the network.';
    }

    if (state === 'done') {
      if (target.kind === 'frontier') {
        o.hudPrimary = 'Frontier secured.';
        o.hudSecondary = 'Ready to begin a new learning dialogue.';
      } else if (target.kind === 'dimmingNode') {
        o.hudPrimary = 'Signal stabilized.';
        o.hudSecondary = 'Ready for a quick recall check.';
      } else {
        o.hudPrimary = 'Course complete.';
        o.hudSecondary = 'Awaiting your next command.';
      }
    }

    // Panel visibility
    if (
      state === 'starcoreOpen' ||
      state === 'awaitVoice' ||
      state === 'relightAction' ||
      state === 'frontierGrow' ||
      state === 'done'
    ) {
      o.panelVisible = true;

      // Open progress should be relative to the moment the panel started opening.
      const now = performance.now();
      const openedAt = panelOpenedAtRef.current ?? now;
      o.panelProgress01 = Math.min(1, (now - openedAt) / PANEL_MS);

      if (target.kind === 'dimmingNode' && target.node) {
        o.starcore = {
          title: 'Starcore — Fading Node',
          subtitle: target.node.label,
          metrics: [
            { label: 'Strength', value: formatPercent(target.node.strength) },
            { label: 'Potential', value: formatPercent(target.node.potential) },
            { label: 'Usage', value: `${target.node.usageCount}` },
            { label: 'Last Reviewed', value: new Date(target.node.lastReviewed).toLocaleString() },
          ],
          hint:
            state === 'awaitVoice'
              ? `Simulated voice intent: ${intentRef.current === 'relight' ? 'RELIGHT' : 'FRONTIER'}`
              : undefined,
        };
      } else if (target.kind === 'frontier') {
        o.starcore = {
          title: 'Starcore — Frontier Site',
          subtitle: 'Expansion corridor',
          metrics: [
            { label: 'Protocol', value: 'i+1 Frontier' },
            { label: 'Growth', value: formatPercent(frontierProgress.current) },
            { label: 'Stability', value: 'Nominal' },
          ],
        };
      } else {
        o.starcore = {
          title: 'Starcore',
          subtitle: 'Navigation',
          metrics: [{ label: 'Status', value: 'Online' }],
        };
      }
    }

    // Connection line target for frontier
    if (target.kind === 'frontier') {
      // Link to the nearest real node
      const frontier = target.position;
      let nearest: THREE.Vector3 | undefined;
      let best = Infinity;
      for (const n of nodes) {
        if (typeof n.x !== 'number') continue;
        const p = new THREE.Vector3(n.x!, n.y!, n.z!);
        const d = p.distanceTo(frontier);
        if (d < best) {
          best = d;
          nearest = p;
        }
      }
      if (nearest) {
        o.connectionFrom = nearest;
        o.connectionTo = frontier.clone();
      }
    }

    return o;
  }, [output, state, nodes]);

  // Merge composed with live vectors (updated each frame)
  composed.shipPos = shipPos.current;
  composed.shipQuat = shipQuat.current;
  composed.shipScale = shipScale.current;
  composed.shipThruster = shipThruster.current;
  composed.shipEnergyPulse = shipEnergyPulse.current;
  composed.cameraPos = camPos.current;
  composed.cameraTarget = camTarget.current;
  composed.target = { ...targetRef.current, position: targetRef.current.position };
  composed.frontierVisible = frontierVisible.current;
  composed.frontierProgress01 = frontierProgress.current;
  composed.relightPulse01 = relightPulse.current;

  // Attach step ref
  (composed as any).__step = stepRef;

  return composed;
}
