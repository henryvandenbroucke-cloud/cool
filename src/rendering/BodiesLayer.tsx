import { useMemo } from 'react';
import { engine, useWorld } from '../stores/worldStore';
import type { SimBody } from '../simulation/body';
import { PlanetBody } from './bodies/PlanetBody';
import { StarBody } from './bodies/StarBody';
import { BlackHoleBody } from './bodies/BlackHoleBody';
import { RockBody } from './bodies/RockBody';

function BodyVisual({ body, version }: { body: SimBody; version: number }) {
  switch (body.kind) {
    case 'star':
      return <StarBody body={body} version={version} />;
    case 'blackHole':
      return <BlackHoleBody body={body} version={version} />;
    case 'asteroid':
    case 'comet':
      return <RockBody body={body} version={version} />;
    default:
      return <PlanetBody body={body} version={version} />;
  }
}

/** Mirrors the engine's body list into React, re-rendering only when bodies are added/removed or edited. */
export function BodiesLayer() {
  const structure = useWorld((s) => s.structureVersion);
  const properties = useWorld((s) => s.propertyVersion);
  const epoch = useWorld((s) => s.epoch);
  const bodies = useMemo(() => [...engine.bodies], [structure, epoch]);
  return (
    <>
      {bodies.map((b) => (
        <BodyVisual key={`${epoch}:${b.id}:${b.kind}`} body={b} version={properties} />
      ))}
    </>
  );
}
