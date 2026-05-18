/**
 * Engineering materials shared by MechSim (beam) and FEAForge (truss).
 * E = Young's modulus (Pa), yield = yield/proof stress (Pa),
 * density (kg/m³), alpha = linear thermal-expansion coefficient (1/K).
 * Values are typical handbook figures.
 */
export interface EngMaterial {
  id: string;
  label: string;
  E: number;
  yield: number;
  density: number;
  /** linear coefficient of thermal expansion (1/K) */
  alpha: number;
  color: string;
}

export const ENG_MATERIALS: EngMaterial[] = [
  { id: 'steel-mild', label: 'Mild Steel (A36)', E: 200e9, yield: 250e6, density: 7850, alpha: 12e-6, color: '#9aa6b8' },
  { id: 'steel-hs', label: 'High-Strength Steel', E: 205e9, yield: 690e6, density: 7850, alpha: 12e-6, color: '#7c8aa0' },
  { id: 'stainless', label: 'Stainless 304', E: 193e9, yield: 215e6, density: 8000, alpha: 17e-6, color: '#c0c8d4' },
  { id: 'aluminum', label: 'Aluminum 6061-T6', E: 69e9, yield: 276e6, density: 2700, alpha: 23e-6, color: '#cbd5e1' },
  { id: 'titanium', label: 'Titanium Ti-6Al-4V', E: 114e9, yield: 880e6, density: 4430, alpha: 8.6e-6, color: '#b8c0c8' },
  { id: 'copper', label: 'Copper', E: 117e9, yield: 70e6, density: 8960, alpha: 17e-6, color: '#d98a5b' },
  { id: 'brass', label: 'Brass', E: 100e9, yield: 200e6, density: 8500, alpha: 19e-6, color: '#d4af37' },
  { id: 'cast-iron', label: 'Cast Iron (gray)', E: 110e9, yield: 130e6, density: 7200, alpha: 11e-6, color: '#5b6472' },
  { id: 'oak', label: 'Oak (wood)', E: 11e9, yield: 40e6, density: 750, alpha: 5e-6, color: '#a16207' },
  { id: 'pine', label: 'Pine (wood)', E: 9e9, yield: 33e6, density: 500, alpha: 4e-6, color: '#c79a4b' },
  { id: 'concrete', label: 'Concrete', E: 30e9, yield: 30e6, density: 2400, alpha: 12e-6, color: '#8a8f98' },
  { id: 'abs', label: 'ABS Plastic', E: 2.3e9, yield: 40e6, density: 1050, alpha: 90e-6, color: '#60a5fa' },
  { id: 'nylon', label: 'Nylon', E: 3e9, yield: 75e6, density: 1150, alpha: 80e-6, color: '#93c5fd' },
  { id: 'cfrp', label: 'Carbon Fiber (CFRP)', E: 135e9, yield: 1500e6, density: 1600, alpha: 2e-6, color: '#1f2937' },
  { id: 'gfrp', label: 'Fiberglass (GFRP)', E: 25e9, yield: 480e6, density: 1900, alpha: 9e-6, color: '#34d399' },
  { id: 'acrylic', label: 'Acrylic (PMMA)', E: 3.2e9, yield: 70e6, density: 1180, alpha: 70e-6, color: '#cffafe' },
  { id: 'magnesium', label: 'Magnesium AZ31', E: 45e9, yield: 200e6, density: 1770, alpha: 26e-6, color: '#aeb6c2' },
  { id: 'bamboo', label: 'Bamboo', E: 18e9, yield: 60e6, density: 700, alpha: 30e-6, color: '#84cc16' },
];

export function getEngMaterial(id: string): EngMaterial {
  return ENG_MATERIALS.find((m) => m.id === id) ?? ENG_MATERIALS[0];
}
