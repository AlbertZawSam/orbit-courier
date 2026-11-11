// A small fake Web Audio implementation: enough to test graph wiring, voice counts, scheduling and params.
class Param {
  constructor(v = 0) { this.value = v; this.calls = []; }
  setValueAtTime(v, t) { this.calls.push(['set', v, t]); this.value = v; return this; }
  linearRampToValueAtTime(v, t) { this.calls.push(['lin', v, t]); this.value = v; return this; }
  exponentialRampToValueAtTime(v, t) { this.calls.push(['exp', v, t]); this.value = v; return this; }
  setTargetAtTime(v, t, tc) { this.calls.push(['target', v, t, tc]); this.value = v; return this; }
  cancelScheduledValues() { return this; }
}
class Node {
  constructor(ctx, kind) { this.ctx = ctx; this.kind = kind; this.outs = []; this.started = null; this.stopped = null; ctx.nodes.push(this); }
  connect(n) { this.outs.push(n); return n; }
  disconnect() { this.outs = []; }
  start(t = this.ctx.currentTime) { this.started = t; }
  stop(t = this.ctx.currentTime) { this.stopped = t; }
}
export class MockAudioContext {
  constructor() {
    this.nodes = []; this.currentTime = 0; this.sampleRate = 8000; this.state = 'suspended'; this.resumed = 0;
    this.destination = new Node(this, 'destination');
  }
  resume() { this.state = 'running'; this.resumed++; return Promise.resolve(); }
  advance(s) { this.currentTime += s; }
  createGain() { const n = new Node(this, 'gain'); n.gain = new Param(1); return n; }
  createOscillator() { const n = new Node(this, 'osc'); n.type = 'sine'; n.frequency = new Param(440); n.detune = new Param(0); return n; }
  createBiquadFilter() { const n = new Node(this, 'filter'); n.type = 'lowpass'; n.frequency = new Param(350); n.Q = new Param(1); return n; }
  createBufferSource() { const n = new Node(this, 'buffer'); n.buffer = null; n.loop = false; return n; }
  createBuffer(ch, len) { const data = new Float32Array(len); return { getChannelData: () => data, length: len }; }
  createAnalyser() { const n = new Node(this, 'analyser'); n.fftSize = 1024; n.getFloatTimeDomainData = (a) => a.fill(0); return n; }
  // helpers for assertions
  all(kind) { return this.nodes.filter((n) => n.kind === kind); }
  activeSources(at = this.currentTime) { return this.nodes.filter((n) => (n.kind === 'osc' || n.kind === 'buffer') && n.started !== null && (n.stopped === null || n.stopped > at)); }
  /** Can `node` reach the destination by following connections? */
  reaches(node, target = this.destination, seen = new Set()) {
    if (node === target) return true;
    if (seen.has(node)) return false;
    seen.add(node);
    return node.outs.some((o) => this.reaches(o, target, seen));
  }
}
