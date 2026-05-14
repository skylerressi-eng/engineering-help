/**
 * CircuitSim preset circuits. Returns a list of components plus wires expressed
 * as CompType + position + pin connections by id. The store accepts these via
 * its add/connect methods.
 */
import type { CompType } from './types';

export interface PresetComp {
  id: string;
  type: CompType;
  x: number;
  y: number;
  value: number;
  freq?: number;
}

export interface CircuitPreset {
  id: string;
  name: string;
  description: string;
  components: PresetComp[];
  /** wire endpoints as `${id}.${pin}` pairs */
  wires: Array<[string, string]>;
  /** node names to auto-probe on the scope after load */
  probes?: string[];
}

export const CIRCUIT_PRESETS: CircuitPreset[] = [
  {
    id: 'voltage-divider',
    name: 'Voltage Divider',
    description: 'Two resistors split a 10 V source.',
    components: [
      { id: 'v1', type: 'vsource', x: 80, y: 100, value: 10 },
      { id: 'r1', type: 'resistor', x: 220, y: 60, value: 1000 },
      { id: 'r2', type: 'resistor', x: 220, y: 140, value: 1000 },
      { id: 'gnd', type: 'ground', x: 220, y: 220, value: 0 },
    ],
    wires: [
      ['v1.p', 'r1.a'],
      ['r1.b', 'r2.a'],
      ['r2.b', 'v1.n'],
      ['v1.n', 'gnd.p'],
    ],
  },
  {
    id: 'rc-lowpass',
    name: 'RC Low-Pass',
    description: 'Series R + shunt C. Probe the cap node for the filtered output.',
    components: [
      { id: 'v1', type: 'vsource_ac', x: 80, y: 100, value: 5, freq: 1000 },
      { id: 'r1', type: 'resistor', x: 220, y: 80, value: 1000 },
      { id: 'c1', type: 'capacitor', x: 320, y: 160, value: 1e-6 },
      { id: 'gnd', type: 'ground', x: 320, y: 240, value: 0 },
    ],
    wires: [
      ['v1.p', 'r1.a'],
      ['r1.b', 'c1.a'],
      ['c1.b', 'v1.n'],
      ['v1.n', 'gnd.p'],
    ],
  },
  {
    id: 'rl-highpass',
    name: 'RL High-Pass',
    description: 'Series L + shunt R. Inductor blocks DC, passes high frequencies.',
    components: [
      { id: 'v1', type: 'vsource_ac', x: 80, y: 100, value: 5, freq: 1000 },
      { id: 'l1', type: 'inductor', x: 220, y: 80, value: 10e-3 },
      { id: 'r1', type: 'resistor', x: 320, y: 160, value: 1000 },
      { id: 'gnd', type: 'ground', x: 320, y: 240, value: 0 },
    ],
    wires: [
      ['v1.p', 'l1.a'],
      ['l1.b', 'r1.a'],
      ['r1.b', 'v1.n'],
      ['v1.n', 'gnd.p'],
    ],
  },
  {
    id: 'rlc-tank',
    name: 'RLC Series Resonator',
    description: 'Try sweeping the AC source frequency around 1/(2π·√LC) ≈ 5 kHz.',
    components: [
      { id: 'v1', type: 'vsource_ac', x: 80, y: 100, value: 5, freq: 5000 },
      { id: 'r1', type: 'resistor', x: 200, y: 80, value: 100 },
      { id: 'l1', type: 'inductor', x: 320, y: 80, value: 1e-3 },
      { id: 'c1', type: 'capacitor', x: 440, y: 160, value: 1e-6 },
      { id: 'gnd', type: 'ground', x: 440, y: 240, value: 0 },
    ],
    wires: [
      ['v1.p', 'r1.a'],
      ['r1.b', 'l1.a'],
      ['l1.b', 'c1.a'],
      ['c1.b', 'v1.n'],
      ['v1.n', 'gnd.p'],
    ],
  },
  {
    id: 'half-wave-rect',
    name: 'Half-Wave Rectifier',
    description: 'Diode + load. Negative half-cycles get clipped.',
    components: [
      { id: 'v1', type: 'vsource_ac', x: 80, y: 100, value: 5, freq: 60 },
      { id: 'd1', type: 'diode', x: 220, y: 80, value: 0 },
      { id: 'r1', type: 'resistor', x: 340, y: 160, value: 1000 },
      { id: 'gnd', type: 'ground', x: 340, y: 240, value: 0 },
    ],
    wires: [
      ['v1.p', 'd1.a'],
      ['d1.k', 'r1.a'],
      ['r1.b', 'v1.n'],
      ['v1.n', 'gnd.p'],
    ],
  },
  {
    id: 'rc-charge',
    name: 'RC Charging',
    description: 'DC step charging a capacitor through R. τ = RC.',
    components: [
      { id: 'v1', type: 'vsource', x: 80, y: 100, value: 5 },
      { id: 'r1', type: 'resistor', x: 220, y: 80, value: 1000 },
      { id: 'c1', type: 'capacitor', x: 340, y: 160, value: 100e-6 },
      { id: 'gnd', type: 'ground', x: 340, y: 240, value: 0 },
    ],
    wires: [
      ['v1.p', 'r1.a'],
      ['r1.b', 'c1.a'],
      ['c1.b', 'v1.n'],
      ['v1.n', 'gnd.p'],
    ],
  },
  {
    id: 'parallel-rl',
    name: 'Parallel RL Across DC',
    description: 'A resistor and inductor in parallel across a DC source.',
    components: [
      { id: 'v1', type: 'vsource', x: 80, y: 100, value: 12 },
      { id: 'r1', type: 'resistor', x: 220, y: 100, value: 100 },
      { id: 'l1', type: 'inductor', x: 320, y: 100, value: 50e-3 },
      { id: 'gnd', type: 'ground', x: 220, y: 220, value: 0 },
    ],
    wires: [
      ['v1.p', 'r1.a'],
      ['r1.a', 'l1.a'],
      ['r1.b', 'v1.n'],
      ['l1.b', 'v1.n'],
      ['v1.n', 'gnd.p'],
    ],
  },
];
