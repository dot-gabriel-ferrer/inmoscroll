/**
 * Quality tiers drive the adaptive regression described in the architecture report:
 * 3 = SSAO + bloom + depth of field, 2 = depth of field dropped, 1 = SSAO dropped too.
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
