/**
 * Quality tiers drive the adaptive regression described in the architecture report.
 * Meshes: 3 = SSAO + bloom + depth of field, 2 = depth of field dropped, 1 = no
 * post-processing at all (the scene is drawn straight to the canvas). Every tier also
 * lowers the resolution ceiling, which is the only lever for splat scenes.
 */
export type QualityTier = 1 | 2 | 3;

export interface DeviceProfile {
  tier: QualityTier;
  /** Entry-level phones fall back to unfiltered shadow maps. */
  basicShadows: boolean;
  shadowMapSize: 1024 | 2048;
}

export function detectDeviceProfile(): DeviceProfile {
  if (typeof navigator === 'undefined') return { tier: 3, basicShadows: false, shadowMapSize: 2048 };
  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  if (coarse && (cores <= 4 || memory <= 2)) return { tier: 1, basicShadows: true, shadowMapSize: 1024 };
  if (coarse || cores <= 4 || memory <= 4) return { tier: 2, basicShadows: false, shadowMapSize: 1024 };
  return { tier: 3, basicShadows: false, shadowMapSize: 2048 };
}

/**
 * Device pixel ratio ceiling per tier. Fill rate and every screen-sized buffer scale
 * with its square, so resolution is the first thing to give: splats in particular are
 * pure overdraw. After a lost WebGL context the scene stays at CSS resolution.
 */
export function pixelRatioCap(tier: QualityTier, scene: 'gltf' | 'splat', lowMemory = false): number {
  if (lowMemory) return 1;
  if (tier === 3) return 2;
  if (tier === 2) return 1.5;
  return scene === 'splat' ? 1.25 : 1.5;
}

/** Frame budget (ms) above which a frame counts as dropped, and how long that may last. */
export const FRAME_BUDGET_MS = 1000 / 60;
export const OVER_BUDGET_TOLERANCE_MS = 1000;

/**
 * Tracks sustained over-budget rendering. Feed it consecutive frame deltas; it returns
 * true once the budget has been exceeded continuously for longer than the tolerance.
 * Idle gaps (on-demand rendering pauses) must be reported through `reset()`.
 */
export class FrameBudgetMonitor {
  private overBudgetMs = 0;
  private readonly budgetMs: number;
  private readonly toleranceMs: number;

  constructor(budgetMs = FRAME_BUDGET_MS * 1.2, toleranceMs = OVER_BUDGET_TOLERANCE_MS) {
    this.budgetMs = budgetMs;
    this.toleranceMs = toleranceMs;
  }

  reset() {
    this.overBudgetMs = 0;
  }

  sample(deltaMs: number): boolean {
    if (deltaMs > this.budgetMs) {
      this.overBudgetMs += deltaMs;
      if (this.overBudgetMs > this.toleranceMs) {
        this.overBudgetMs = 0;
        return true;
      }
    } else {
      this.overBudgetMs = 0;
    }
    return false;
  }
}
