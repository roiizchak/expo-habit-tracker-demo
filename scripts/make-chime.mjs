// Generates a short, pleasant CC0 "completion" chime as a 16-bit PCM WAV.
// Bell-like: two struck notes (C6 -> G6) built from a few decaying partials.
import { writeFileSync, mkdirSync } from 'node:fs';

const SR = 44100;
const dur = 0.9; // seconds
const n = Math.floor(SR * dur);
const buf = Buffer.alloc(44 + n * 2);

// WAV header
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + n * 2, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); // PCM
buf.writeUInt16LE(1, 22); // mono
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 2, 28);
buf.writeUInt16LE(2, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(n * 2, 40);

// Two notes: C6 (1046.5 Hz) struck at t=0, G6 (1568 Hz) struck at t=0.16s.
// Each note = fundamental + a couple of partials with exponential decay.
const notes = [
  { f: 1046.5, t0: 0.0, gain: 1.0 },
  { f: 1568.0, t0: 0.16, gain: 0.9 },
];
const partials = [
  { mult: 1.0, amp: 1.0, decay: 5.0 },
  { mult: 2.01, amp: 0.45, decay: 7.0 },
  { mult: 3.0, amp: 0.2, decay: 9.0 },
];

for (let i = 0; i < n; i++) {
  const t = i / SR;
  let s = 0;
  for (const note of notes) {
    const lt = t - note.t0;
    if (lt < 0) continue;
    for (const p of partials) {
      const env = Math.exp(-p.decay * lt);
      s += note.gain * p.amp * env * Math.sin(2 * Math.PI * note.f * p.mult * lt);
    }
  }
  // soft overall fade-in (1ms) to avoid click
  const attack = Math.min(1, t / 0.001);
  s *= attack * 0.22; // headroom
  let v = Math.max(-1, Math.min(1, s));
  buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
}

mkdirSync('assets/sounds', { recursive: true });
writeFileSync('assets/sounds/chime.wav', buf);
console.log('wrote assets/sounds/chime.wav', buf.length, 'bytes');
