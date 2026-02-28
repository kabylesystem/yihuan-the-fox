import * as THREE from 'three';
import type { Neuron } from '../../types';

export type NavigationFlightState =
  | 'hidden'
  | 'appear'
  | 'idle'
  | 'hold'
  | 'assess'
  | 'relightTravel'
  | 'exploreTravel'
  | 'focus'
  | 'starcoreOpen'
  | 'awaitVoice'
  | 'relightAction'
  | 'frontierGrow'
  | 'done';

export type NavigationIntent = 'relight' | 'explore';

export type TargetKind = 'none' | 'dimmingNode' | 'frontier';

export interface NavigationTarget {
  kind: TargetKind;
  node?: Neuron;
  position: THREE.Vector3;
}

export interface StarcoreData {
  title: string;
  subtitle: string;
  metrics: Array<{ label: string; value: string }>;
  hint?: string;
}
