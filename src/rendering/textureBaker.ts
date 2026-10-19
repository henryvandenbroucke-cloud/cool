import * as THREE from 'three';
import { BAKE_FRAGMENT, BAKE_VERTEX, STYLE_CODE } from '../shaders/planetBake';
import type { Appearance } from '../simulation/types';
import { hexToRgb } from '../utils/color';

export interface BakedSurface {
  mapA: THREE.Texture;
  mapB: THREE.Texture;
}

interface CacheEntry {
  surface: BakedSurface;
  targets: THREE.WebGLRenderTarget[];
  refs: number;
}

/**
 * Renders procedural planet surfaces into equirectangular textures on the
 * GPU (milliseconds per planet), with reference-counted caching so identical
 * appearances share textures and unused ones are disposed.
 */
export class PlanetTextureBaker {
  private cache = new Map<string, CacheEntry>();
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  private renderer: THREE.WebGLRenderer;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.material = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERTEX,
      fragmentShader: BAKE_FRAGMENT,
      uniforms: {
        uPass: { value: 0 },
        uStyle: { value: 0 },
        uSeed: { value: 0 },
        uC0: { value: new THREE.Vector3() },
        uC1: { value: new THREE.Vector3() },
        uC2: { value: new THREE.Vector3() },
        uOcean: { value: 0.6 },
        uClouds: { value: 0.5 },
        uCity: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  static key(a: Appearance, size: number): string {
    return [a.style, a.seed, a.colors.join(','), a.oceanLevel.toFixed(2), a.clouds.toFixed(2), a.cityLights ? 1 : 0, size].join('|');
  }

  acquire(a: Appearance, size: number): BakedSurface {
    const key = PlanetTextureBaker.key(a, size);
    const hit = this.cache.get(key);
    if (hit) {
      hit.refs++;
      return hit.surface;
    }
    const targets = [0, 1].map((pass) => this.bakePass(a, size, pass));
    const entry: CacheEntry = { surface: { mapA: targets[0].texture, mapB: targets[1].texture }, targets, refs: 1 };
    this.cache.set(key, entry);
    return entry.surface;
  }

  release(a: Appearance, size: number): void {
    const key = PlanetTextureBaker.key(a, size);
    const hit = this.cache.get(key);
    if (!hit) return;
    hit.refs--;
    if (hit.refs <= 0) {
      for (const t of hit.targets) t.dispose();
      this.cache.delete(key);
    }
  }

  private bakePass(a: Appearance, size: number, pass: number): THREE.WebGLRenderTarget {
    const rt = new THREE.WebGLRenderTarget(size, size / 2, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      anisotropy: Math.min(8, this.renderer.capabilities.getMaxAnisotropy()),
    });
    const u = this.material.uniforms;
    u.uPass.value = pass;
    u.uStyle.value = STYLE_CODE[a.style] ?? 2;
    u.uSeed.value = a.seed % 10007;
    u.uC0.value.fromArray(hexToRgb(a.colors[0]));
    u.uC1.value.fromArray(hexToRgb(a.colors[1]));
    u.uC2.value.fromArray(hexToRgb(a.colors[2]));
    u.uOcean.value = a.oceanLevel;
    u.uClouds.value = a.clouds;
    u.uCity.value = a.cityLights ? 1 : 0;
    const prev = this.renderer.getRenderTarget();
    const prevAutoClear = this.renderer.autoClear;
    this.renderer.autoClear = true;
    this.renderer.setRenderTarget(rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(prev);
    this.renderer.autoClear = prevAutoClear;
    return rt;
  }

  dispose(): void {
    for (const e of this.cache.values()) for (const t of e.targets) t.dispose();
    this.cache.clear();
    this.material.dispose();
  }
}

let shared: PlanetTextureBaker | null = null;

export function getBaker(renderer: THREE.WebGLRenderer): PlanetTextureBaker {
  if (!shared) shared = new PlanetTextureBaker(renderer);
  return shared;
}
