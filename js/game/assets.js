// Model loading: every GLB is converted to toon materials once, then cloned.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { asset } from './paths.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { toToon, LAYER_NO_INK } from './render.js';

const manager = new THREE.LoadingManager();
manager.setURLModifier(asset);
const loader = new GLTFLoader(manager);
const cache = new Map();

export const MODEL_ROOT = '/assets/models/';

export function preload(paths, onProgress) {
  let done = 0;
  return Promise.all(paths.map((p) => load(p).finally(() => onProgress?.(++done / paths.length))));
}

export function load(path) {
  if (!cache.has(path)) {
    cache.set(path, new Promise((resolve, reject) => {
      loader.load(MODEL_ROOT + path, (gltf) => {
        gltf.scene.traverse((o) => {
          if (!o.isMesh) return;
          o.material = Array.isArray(o.material) ? o.material.map((m) => toToon(m)) : toToon(o.material);
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          if (mats.some((m) => m.userData.noInk)) o.layers.set(LAYER_NO_INK);
          o.castShadow = false;
          o.receiveShadow = false;
        });
        resolve(gltf);
      }, undefined, reject);
    }));
  }
  return cache.get(path);
}

/** A ready-to-place copy. Skinned models get a deep skeleton clone. */
export async function instance(path) {
  const gltf = await load(path);
  const skinned = gltf.animations.length > 0 || hasSkin(gltf.scene);
  const obj = skinned ? SkeletonUtils.clone(gltf.scene) : gltf.scene.clone(true);
  obj.userData.animations = gltf.animations;
  return obj;
}

function hasSkin(root) {
  let s = false;
  root.traverse((o) => { if (o.isSkinnedMesh) s = true; });
  return s;
}

/** Wrap + fit, returning a group whose origin is the model's footprint centre on the floor. */
export async function placeable(path, opts) {
  const obj = await instance(path);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  let s = 1;
  if (opts?.height) s = opts.height / Math.max(1e-4, size.y);
  else if (opts?.width) s = opts.width / Math.max(1e-4, Math.max(size.x, size.z));
  else if (opts?.scale) s = opts.scale;
  obj.scale.multiplyScalar(s);
  obj.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(obj);
  const c = b2.getCenter(new THREE.Vector3());
  obj.position.set(-c.x, -b2.min.y, -c.z);
  const g = new THREE.Group();
  g.add(obj);
  g.userData.animations = obj.userData.animations;
  g.userData.size = b2.getSize(new THREE.Vector3());
  g.userData.model = obj;
  if (opts?.recolor) applyRecolor(g, opts.recolor);
  return g;
}

function applyRecolor(root, map) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const swap = (m) => {
      if (!map[m.name]) return m;
      const n = m.clone();
      n.color = new THREE.Color(map[m.name]);
      return n;
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
}

/** Merge a static model's meshes into one InstancedMesh per material for big forests. */
export async function instanced(path, transforms, { height } = {}) {
  const src = await placeable(path, { height });
  src.updateMatrixWorld(true);
  const group = new THREE.Group();
  const parts = [];
  src.traverse((o) => { if (o.isMesh) parts.push(o); });
  const m4 = new THREE.Matrix4();
  for (const part of parts) {
    const im = new THREE.InstancedMesh(part.geometry, part.material, transforms.length);
    transforms.forEach((t, i) => {
      m4.compose(t.position, t.quaternion, t.scale).multiply(part.matrixWorld);
      im.setMatrixAt(i, m4);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.frustumCulled = false;
    group.add(im);
  }
  return group;
}
