/**
 * Browser-side audio hooks: unlock on the first gesture, a click sound for every button, pause while the tab is
 * hidden, and keep the audio in step with the saved settings.
 */
export function installBrowserAudio({ audio, settings, mainBus }) {
  const gestures = ['pointerdown', 'keydown'];
  // Browsers only start audio after a real activation, and modifier keys (Shift, Ctrl...) do not count. So keep
  // listening until the context is actually running, instead of giving up after the first event.
  const unlock = () => {
    audio.unlock();
    audio.engine.resumed.then(() => { if (audio.engine.running) gestures.forEach((t) => window.removeEventListener(t, unlock)); });
  };
  gestures.forEach((t) => window.addEventListener(t, unlock));
  document.addEventListener('click', (e) => { if (e.target.closest?.('button')) mainBus.emit('ui_click'); });
  document.addEventListener('visibilitychange', () => (document.hidden ? audio.engine.suspend() : audio.engine.resume()));
  settings.onChange(() => audio.applySettings(settings.all()));
  audio.applySettings(settings.all());
}
