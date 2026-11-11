import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/** Grade and vignette in linear space, before OutputPass applies tone mapping and the sRGB transfer. */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.35 }, contrast: { value: 1.04 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float vignette; uniform float contrast; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float d = length((vUv - 0.5) * vec2(1.0, 0.9));
      c.rgb = (c.rgb - 0.18) * contrast + 0.18;
      c.rgb *= 1.0 - vignette * smoothstep(0.35, 0.85, d);
      gl_FragColor = vec4(max(c.rgb, 0.0), c.a);
    }`,
};

export const BLOOM = { strength: 0.6, radius: 0.5, threshold: 0.85 };

/**
 * Render pipeline: RenderPass -> UnrealBloomPass -> grade/vignette -> OutputPass (ACES tone mapping, sRGB).
 * Bloom is off on Low, half resolution on Medium, full on High.
 */
export function createPost(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  let w = 1, h = 1, bloomScale = 1;
  const layout = () => {
    composer.setSize(w, h);
    const pr = renderer.getPixelRatio();
    bloom.setSize(Math.max(1, Math.floor(w * pr * bloomScale)), Math.max(1, Math.floor(h * pr * bloomScale)));
  };
  return {
    composer, bloom, grade,
    setSize(width, height) { w = width; h = height; layout(); },
    /** Apply a quality tier's settings (pixel ratio and bloom mode). */
    apply(tier) {
      const pr = Math.min(window.devicePixelRatio || 1, tier.pixelRatio);
      renderer.setPixelRatio(pr); composer.setPixelRatio(pr);
      bloom.enabled = tier.bloom !== 'off';
      bloomScale = tier.bloom === 'half' ? 0.5 : 1;
      layout();
    },
    render() { composer.render(); },
  };
}
