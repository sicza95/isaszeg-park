const FRAME_INTERVAL = 1000 / 24;
const PRESENTATION_WAIT = 150;

// Seeking updates currentTime before the decoded picture reaches the screen.
// Wait for both seek completion and presentation before asking for another one.
export class ReversePlayback {
  constructor(video) {
    this.video = video;
    this.pending = null; this.frameCallback = null; this.nextSeekAt = 0;
    this.onSeeked = () => {
      if (!this.pending) return;
      this.pending.seekedAt = performance.now();
      this.finish(performance.now());
    };
    video.addEventListener('seeked', this.onSeeked);
  }
  seek(target, now) {
    // Hidden windows and seeks within the same source frame may never produce
    // a compositor callback. Release only a completed seek after a bounded wait.
    const expired = this.pending?.seekedAt != null && now - this.pending.seekedAt >= PRESENTATION_WAIT;
    this.finish(now, expired);
    if (this.pending || now < this.nextSeekAt || this.video.seeking || this.video.readyState < 1 || !Number.isFinite(target)) return;
    if (Math.abs(this.video.currentTime - target) < .025) return;
    const pending = this.pending = { target, startedAt: now, seekedAt: null, presented: false };
    this.waitForFrame(pending);
    this.video.currentTime = target;
  }
  waitForFrame(pending) {
    if (!this.video.requestVideoFrameCallback) return;
    this.frameCallback = this.video.requestVideoFrameCallback((now, metadata) => {
      if (this.pending !== pending) return;
      this.frameCallback = null;
      // A callback already queued before the seek can still contain the old
      // picture. Wait again while that seek is decoding its requested frame.
      if (Math.abs(metadata.mediaTime - pending.target) > .1) { this.waitForFrame(pending); return; }
      pending.presented = true;
      this.finish(now);
    });
  }
  finish(now, expired = false) {
    const pending = this.pending;
    if (!pending || pending.seekedAt === null || this.video.seeking) return;
    if (this.video.requestVideoFrameCallback && !pending.presented && !expired) return;
    if (this.frameCallback !== null) this.video.cancelVideoFrameCallback(this.frameCallback);
    this.frameCallback = null; this.pending = null;
    // Keep a presented picture for at least one display refresh; slow decoding
    // drops obsolete targets because seek() always receives the latest clock.
    this.nextSeekAt = Math.max(pending.startedAt + FRAME_INTERVAL, now + 1000 / 60);
  }
  reset() {
    if (this.frameCallback !== null) this.video.cancelVideoFrameCallback(this.frameCallback);
    this.frameCallback = null; this.pending = null; this.nextSeekAt = 0;
  }
  destroy() { this.reset(); this.video.removeEventListener('seeked', this.onSeeked); }
}
