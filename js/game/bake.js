// Static batching: merges every mesh that never moves into one mesh per
// material, turning hundreds of draw calls into a few dozen.
// Anything under a node with userData.dynamic = true is left alone.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function normalise(geo) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

/** Split a multi-material mesh into [geometry, material] pairs. */
function parts(mesh) {
  if (!Array.isArray(mesh.material)) return [[mesh.geometry, mesh.material]];
  const out = [];
  const src = mesh.geometry;
  for (const grp of src.groups) {
    const mat = mesh.material[grp.materialIndex];
    if (!mat) continue;
    const g = src.clone();
    if (src.index) {
      g.setIndex(Array.from(src.index.array.slice(grp.start, grp.start + grp.count)));
    } else {
      for (const name of Object.keys(g.attributes)) {
        const a = src.attributes[name];
        g.setAttribute(name, new THREE.BufferAttribute(a.array.slice(grp.start * a.itemSize, (grp.start + grp.count) * a.itemSize), a.itemSize));
      }
    }
    g.clearGroups();
    out.push([g, mat]);
  }
  return out;
}

function bakeable(o) {
  if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh) return false;
  if (o.layers.mask === 4) return false;          // raycast-only hitboxes
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  return mats.every((m) => m && m.visible !== false);
}

export function bakeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const victims = [];
  const visit = (o) => {
    if (o !== root && o.userData.dynamic) return;
    if (bakeable(o) && o.visible) {
      const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      for (const [geo, mat] of parts(o)) {
        const key = mat.uuid + '|' + o.layers.mask;
        if (!buckets.has(key)) buckets.set(key, { mat, mask: o.layers.mask, geos: [] });
        const g = normalise(geo);
        g.applyMatrix4(m);
        buckets.get(key).geos.push(g);
      }
      victims.push(o);
    }
    for (const c of [...o.children]) visit(c);
  };
  visit(root);
  // detach baked meshes, keeping any children (hitboxes, lights) where they were
  for (const v of victims) {
    for (const c of [...v.children]) v.parent.attach(c);
    v.parent.remove(v);
  }
  let merged = 0;
  for (const { mat, mask, geos } of buckets.values()) {
    const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!geo) continue;
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.layers.mask = mask;
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    merged++;
  }
  return { from: victims.length, to: merged };
}
