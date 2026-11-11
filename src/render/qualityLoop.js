import { AutoQuality, tierSettings, nextChoice } from './quality.js';

/** Owns the current quality tier: auto-downgrade from frame times, the Q key, and the HUD readout. */
export function createQualityLoop({ settings, hud, apply }) {
  let auto = new AutoQuality('high');
  let tierName = settings.get('quality') === 'auto' ? 'high' : settings.get('quality');
  let frameMs = 16, shown = 0;
  const applyNow = () => apply(tierSettings(tierName));
  return {
    get tier() { return tierName; },
    get settings() { return tierSettings(tierName); },
    apply: applyNow,
    cycle() {
      const choice = nextChoice(settings.get('quality'));
      settings.set('quality', choice);
      if (choice === 'auto') { auto = new AutoQuality('high'); tierName = 'high'; } else tierName = choice;
      applyNow();
      hud.notice(`Graphics quality: ${choice}${choice === 'auto' ? ' (adjusts to your device)' : ''}`, 3000);
    },
    /** Call once per frame with the timestamp and raw frame time in ms. */
    frame(now, rawMs) {
      if (rawMs > 0 && rawMs < 250) frameMs += (rawMs - frameMs) * 0.05;
      if (settings.get('quality') === 'auto') {
        const drop = auto.push(rawMs);
        if (drop) { tierName = drop.to; applyNow(); hud.notice(`Lowered graphics to ${drop.to} to keep play smooth. Press Q to choose a quality.`); }
      }
      if (now - shown > 500) {
        shown = now;
        const q = settings.get('quality');
        hud.set({ quality: `${q}${q === 'auto' ? ` (${tierName})` : ''}, ${frameMs.toFixed(1)} ms` });
      }
    },
  };
}
