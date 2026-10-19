import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { useSettings } from '../stores/settingsStore';
import { useWorld } from '../stores/worldStore';
import { QUALITY } from '../rendering/quality';
import { SimulationDriver } from './SimulationDriver';
import { Background } from '../rendering/Background';
import { BodiesLayer } from '../rendering/BodiesLayer';
import { Trails } from '../rendering/Trails';
import { PredictionLine } from '../rendering/PredictionLine';
import { Markers } from '../rendering/Markers';
import { GravityGrid } from '../rendering/GravityGrid';
import { Galaxy } from '../rendering/Galaxy';
import { PostFX } from '../rendering/PostFX';
import { ScreenshotHelper } from '../rendering/Screenshot';
import { CameraRig } from '../camera/CameraRig';
import { PointerController } from '../controls/PointerController';
import { PlacementController } from '../controls/PlacementController';

export function Scene() {
  const quality = useSettings((s) => s.quality);
  const showGrid = useSettings((s) => s.showGravityGrid);
  const galaxy = useWorld((s) => s.galaxy);
  const galaxyCenter = useWorld((s) => (s.galaxy ? s.camera.target : null));
  const profile = QUALITY[quality];

  return (
    <Canvas
      className="!absolute inset-0"
      flat
      dpr={[1, profile.maxPixelRatio]}
      camera={{ fov: 50, near: 0.001, far: 5e6, position: [0, 200, 600] }}
      gl={{ logarithmicDepthBuffer: true, antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false }}
      onCreated={({ gl, scene, camera }) => {
        gl.setClearColor(new THREE.Color('#03050b'));
        gl.domElement.setAttribute('data-testid', 'universe-canvas');
        // Debug / automated-test handle.
        (window as unknown as { __GODMODE_THREE__: unknown }).__GODMODE_THREE__ = { gl, scene, camera };
      }}
    >
      <SimulationDriver />
      <Background />
      <BodiesLayer />
      <Trails />
      <PredictionLine />
      <Markers />
      {galaxy && <Galaxy centerId={galaxyCenter} />}
      {showGrid && <GravityGrid />}
      <CameraRig />
      <PointerController />
      <PlacementController />
      <ScreenshotHelper />
      <PostFX />
    </Canvas>
  );
}
