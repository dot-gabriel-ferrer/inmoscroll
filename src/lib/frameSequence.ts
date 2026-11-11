import { nearestLoaded, refinementOrder } from './prerender';

const CONCURRENCY = 3;
/** Frames requested ahead of and behind the scroll position before anything else. */
const AHEAD = 6;
const BEHIND = 2;

/**
 * Downloads one pre-rendered sequence: the frames around the scroll position first,
 * then the rest from coarse to fine. Loaded images stay referenced so the browser can
 * show any of them again without a network round trip.
 */
export class FrameSequence {
  private readonly loaded: Uint8Array;
  private readonly requested: Uint8Array;
  private readonly images: HTMLImageElement[] = [];
  private readonly background: number[];
  private cursor = 0;
  private focus = 0;
  private active = 0;
  private disposed = false;
  private failures = 0;
  private anyLoaded = false;

  constructor(
    private readonly count: number,
    private readonly urlFor: (index: number) => string,
    private readonly onLoad: () => void,
    /** When false only the frames around the scroll position are fetched (data saver). */
    private readonly eager = true,
    /** Called once if the first requests all fail: the sequence is unreachable. */
    private readonly onUnavailable?: () => void,
  ) {
    this.loaded = new Uint8Array(count);
    this.requested = new Uint8Array(count);
    this.background = refinementOrder(count);
  }

  /** Loaded frame closest to `target`, or -1 while nothing has arrived. */
  nearest(target: number): number {
    return nearestLoaded(this.loaded, target);
  }

  url(index: number): string {
    return this.urlFor(index);
  }

  /** Moves the download priority to the frames around `index`. */
  prioritise(index: number) {
    this.focus = index;
    this.pump();
  }

  private next(): number {
    const candidates = [this.focus];
    for (let i = 1; i <= AHEAD; i++) {
      candidates.push(this.focus + i);
      if (i <= BEHIND) candidates.push(this.focus - i);
    }
    for (const index of candidates) {
      if (index >= 0 && index < this.count && !this.requested[index]) return index;
    }
    if (!this.eager) return -1;
    while (this.cursor < this.background.length) {
      const index = this.background[this.cursor++];
      if (!this.requested[index]) return index;
    }
    return -1;
  }

  private pump() {
    while (!this.disposed && this.active < CONCURRENCY) {
      const index = this.next();
      if (index < 0) return;
      this.requested[index] = 1;
      this.active++;
      const image = new Image();
      image.decoding = 'async';
      const done = (ok: boolean) => {
        this.active--;
        if (this.disposed) return;
        if (!ok && !this.anyLoaded && ++this.failures === CONCURRENCY) this.onUnavailable?.();
        if (ok) {
          this.anyLoaded = true;
          this.loaded[index] = 1;
          this.images[index] = image;
          this.onLoad();
        }
        this.pump();
      };
      image.onload = () => done(true);
      // A missing frame is skipped: its neighbours stand in for it.
      image.onerror = () => done(false);
      image.src = this.urlFor(index);
    }
  }

  dispose() {
    this.disposed = true;
    for (const image of this.images) if (image) image.onload = image.onerror = null;
    this.images.length = 0;
  }
}
