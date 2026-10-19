import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { SimBody } from '../../simulation/body';
import { SIMPLE_VERTEX } from '../../shaders/planet';
import { BILLBOARD_VERTEX, GLOW_FRAGMENT, ROCK_FRAGMENT, TAIL_FRAGMENT, TAIL_VERTEX } from '../../shaders/star';
import { lightUniforms } from '../lighting';
import { frame, updateSpin } from '../frameState';
import { rockGeometry, unitQuad } from '../geometries';
import { engine, useWorld } from '../../stores/worldStore';
import { hexToRgb } from '../../utils/color';
import { RENDER_SCALE } from '../../simulation/constants';
import { surfaceMeshes } from '../registry';

const tmp = new THREE.Vector3();
const tmpVel = new THREE.Vector3();

/** Asteroids, fragments and comet nuclei: lumpy lit rocks (comets add coma + tails). */
export function RockBody({ body, version }: { body: SimBody; version: number }) {
  const camera = useThree((s) => s.camera);
  const group = useRef<THREE.Group>(null);
  const rock = useRef<THREE.Mesh>(null);
  const coma = useRef<THREE.Mesh>(null);
  const ionTail = useRef<THREE.Mesh>(null);
  const dustTail = useRef<THREE.Mesh>(null);
  const isComet = body.kind === 'comet';

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SIMPLE_VERTEX,
        fragmentShader: ROCK_FRAGMENT,
        uniforms: {
          ...lightUniforms,
          uC0: { value: new THREE.Vector3() },
          uC1: { value: new THREE.Vector3() },
          uC2: { value: new THREE.Vector3() },
          uHeat: { value: 0 },
          uSeed: { value: 0 },
          uIcy: { value: 0 },
          uHighlight: { value: 0 },
        },
      }),
    [],
  );

  const comet = useMemo(() => {
    if (!isComet) return null;
    const tail = (color: THREE.Vector3, intensity: number, streak: number) =>
      new THREE.ShaderMaterial({
        vertexShader: TAIL_VERTEX,
        fragmentShader: TAIL_FRAGMENT,
        uniforms: {
          uAxis: { value: new THREE.Vector3(1, 0, 0) },
          uBend: { value: new THREE.Vector3() },
          uLength: { value: 1 },
          uWidth: { value: 0.1 },
          uColor: { value: color },
          uIntensity: { value: intensity },
          uTime: { value: 0 },
          uStreak: { value: streak },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
    return {
      ion: tail(new THREE.Vector3(0.35, 0.75, 1.6), 1.2, 2.5),
      dust: tail(new THREE.Vector3(1.4, 1.2, 0.9), 0.9, 1),
      coma: new THREE.ShaderMaterial({
        vertexShader: BILLBOARD_VERTEX,
        fragmentShader: GLOW_FRAGMENT,
        uniforms: { uSize: { value: 1 }, uColor: { value: new THREE.Vector3(0.7, 0.9, 1.3) }, uIntensity: { value: 1 }, uFalloff: { value: 5 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      tailGeometry: new THREE.PlaneGeometry(1, 1, 1, 24).translate(0.5, 0.5, 0),
    };
  }, [isComet]);

  useEffect(
    () => () => {
      material.dispose();
      if (comet) {
        comet.ion.dispose();
        comet.dust.dispose();
        comet.coma.dispose();
        comet.tailGeometry.dispose();
      }
    },
    [material, comet],
  );

  useEffect(() => {
    const a = body.appearance;
    // The rock shader mixes in sRGB and linearises afterwards.
    material.uniforms.uC0.value.set(...hexToRgb(a.colors[0]));
    material.uniforms.uC1.value.set(...hexToRgb(a.colors[1]));
    material.uniforms.uC2.value.set(...hexToRgb(a.colors[2]));
    material.uniforms.uSeed.value = (a.seed % 1000) * 0.013;
    material.uniforms.uIcy.value = isComet ? 1 : 0;
  }, [version, body, material, isComet]);

  useEffect(() => {
    if (rock.current) surfaceMeshes.set(body.id, rock.current);
    return () => {
      surfaceMeshes.delete(body.id);
    };
  }, [body.id]);

  const axis = useMemo(() => new THREE.Vector3(Math.sin(body.appearance.seed), 1, Math.cos(body.appearance.seed * 1.7)).normalize(), [body.appearance.seed]);

  useFrame(() => {
    const pos = frame.positions.get(body.id);
    const r = frame.radii.get(body.id);
    if (!pos || r === undefined || !group.current || !rock.current) return;
    group.current.position.copy(pos);
    const world = useWorld.getState();
    const spin = updateSpin(body, world.timeScale, frame.delta, world.paused);
    rock.current.quaternion.setFromAxisAngle(axis, spin);
    rock.current.scale.setScalar(r);
    if (body.heat > 0) body.heat = Math.max(0, body.heat - frame.delta * 0.07);
    material.uniforms.uHeat.value = body.heat;
    material.uniforms.uHighlight.value = world.selectedId === body.id ? 1 : world.hoveredId === body.id ? 0.5 : 0;

    if (comet && ionTail.current && dustTail.current && coma.current) {
      // Tail points away from the brightest nearby star; length grows as the comet nears it.
      let best: { p: THREE.Vector3; score: number } | null = null;
      for (const s of engine.bodies) {
        if (s.kind !== 'star') continue;
        const sp = frame.positions.get(s.id);
        if (!sp) continue;
        const d2 = sp.distanceToSquared(pos) / (RENDER_SCALE * RENDER_SCALE);
        const score = Math.sqrt(Math.max(s.luminosity, 1e-3)) / Math.max(d2, 1e-6);
        if (!best || score > best.score) best = { p: sp, score };
      }
      const visible = Boolean(best);
      ionTail.current.visible = visible;
      dustTail.current.visible = visible;
      if (best) {
        tmp.copy(pos).sub(best.p);
        const dAu = tmp.length() / RENDER_SCALE;
        tmp.normalize();
        const activity = Math.min(1.6, 1.8 / Math.pow(Math.max(dAu, 0.15), 1.4));
        const length = RENDER_SCALE * 0.22 * activity;
        tmpVel.set(body.vx, body.vy, body.vz).normalize().multiplyScalar(-0.45);
        const iu = comet.ion.uniforms;
        iu.uAxis.value.copy(tmp);
        iu.uBend.value.set(0, 0, 0);
        iu.uLength.value = length;
        iu.uWidth.value = length * 0.05;
        iu.uTime.value = frame.time;
        iu.uIntensity.value = 0.9 * Math.min(1, activity);
        const du = comet.dust.uniforms;
        du.uAxis.value.copy(tmp);
        du.uBend.value.copy(tmpVel);
        du.uLength.value = length * 0.75;
        du.uWidth.value = length * 0.12;
        du.uTime.value = frame.time;
        du.uIntensity.value = 0.7 * Math.min(1, activity);
        const dist = camera.position.distanceTo(pos);
        comet.coma.uniforms.uSize.value = Math.max(length * 0.06, dist * 0.012);
        comet.coma.uniforms.uIntensity.value = 0.5 + Math.min(1, activity) * 0.9;
      }
    }
  });

  return (
    <group ref={group}>
      <mesh ref={rock} geometry={rockGeometry(body.appearance.seed)} material={material} />
      {comet && (
        <>
          <mesh ref={coma} geometry={unitQuad()} material={comet.coma} renderOrder={3} frustumCulled={false} />
          <mesh ref={ionTail} geometry={comet.tailGeometry} material={comet.ion} renderOrder={3} frustumCulled={false} />
          <mesh ref={dustTail} geometry={comet.tailGeometry} material={comet.dust} renderOrder={3} frustumCulled={false} />
        </>
      )}
    </group>
  );
}

