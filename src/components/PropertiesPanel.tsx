import { useEffect, useMemo, useRef, useState } from 'react';
import { Bomb, Copy, Crosshair, Trash2, Video, VideoOff, X, Orbit, CircleStop } from 'lucide-react';
import { engine, useWorld } from '../stores/worldStore';
import { useUI } from '../stores/uiStore';
import { IconButton, NumberField, Slider, Toggle, cx } from './ui/primitives';
import { Orb } from './Orb';
import { getCatalogEntry } from '../celestial/catalog';
import { AU_KM, AU_PER_YR_IN_KM_S, C_AU_PER_YR, EARTH_MASS_SUN, G, SOLAR_MASS_KG } from '../simulation/constants';
import { circularOrbitVelocity, dominantBody, orbitalElements } from '../simulation/orbits';
import type { BodyPatch } from '../simulation/engine';
import { formatDistanceAu, formatNumber, formatSimTime, sci } from '../utils/format';
import { effectiveRadius, sizeFactor } from '../simulation/body';

interface Live {
  speed: number;
  pos: [number, number, number];
  vel: [number, number, number];
  mass: number;
  radius: number;
  refName: string | null;
  refDist: number;
  orbit: null | { parent: string; a: number; e: number; period: number; bound: boolean };
}

function useLive(id: string | null, refId: string | null): Live | null {
  const [live, setLive] = useState<Live | null>(null);
  useEffect(() => {
    if (!id) return;
    const tick = () => {
      const b = engine.getBody(id);
      if (!b) {
        setLive(null);
        return;
      }
      const parent = dominantBody(engine.bodies, b.x, b.y, b.z, b.mass, b);
      const ref = (refId && engine.getBody(refId)) || parent;
      const el = parent ? orbitalElements(b, parent) : null;
      setLive({
        speed: Math.hypot(b.vx, b.vy, b.vz),
        pos: [b.x, b.y, b.z],
        vel: [b.vx, b.vy, b.vz],
        mass: b.mass,
        radius: b.radius,
        refName: ref?.name ?? null,
        refDist: ref ? Math.hypot(b.x - ref.x, b.y - ref.y, b.z - ref.z) : 0,
        orbit: parent && el ? { parent: parent.name, a: el.semiMajorAxis, e: el.eccentricity, period: el.period, bound: el.bound } : null,
      });
    };
    tick();
    const t = window.setInterval(tick, 160);
    return () => window.clearInterval(t);
  }, [id, refId]);
  return id ? live : null;
}

function Row({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[5px]" data-testid={testId}>
      <span className="shrink-0 text-[11.5px] text-mute">{label}</span>
      <span className="num truncate text-right text-[12px] text-ink">{children}</span>
    </div>
  );
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="border-t border-white/[0.06] px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="label-caps">{title}</span>
        {right}
      </div>
      {children}
    </section>
  );
}

const vec = (v: [number, number, number], scale: number, digits = 3) => v.map((x) => formatNumber(x * scale, digits)).join(', ');

export function PropertiesPanel() {
  const selectedId = useWorld((s) => s.selectedId);
  const followId = useWorld((s) => s.followId);
  const version = useWorld((s) => s.propertyVersion);
  const [refId, setRefId] = useState<string | null>(null);
  const live = useLive(selectedId, refId);
  const body = engine.getBody(selectedId);
  const editStart = useRef<BodyPatch | null>(null);
  void version;

  useEffect(() => setRefId(null), [selectedId]);

  const others = useMemo(() => engine.bodies.filter((b) => b.id !== selectedId && b.kind !== 'asteroid').slice(0, 40), [selectedId, version]);

  if (!body || !live || !selectedId) return null;
  const world = useWorld.getState();
  const entry = getCatalogEntry(body.type);
  const isStar = body.kind === 'star';
  const isBH = body.kind === 'blackHole';
  const scale = sizeFactor(body.kind, engine.settings.sizeScale);
  const massInEarth = !isStar && !isBH;
  const massValue = massInEarth ? live.mass / EARTH_MASS_SUN : live.mass;
  const massUnit = massInEarth ? 'M⊕' : 'M☉';
  const logMass = Math.log10(live.mass);
  const radiusKm = live.radius * AU_KM;

  const begin = (patch: BodyPatch) => {
    if (!editStart.current) editStart.current = patch;
  };
  const commit = (after: BodyPatch, label: string) => {
    const before = editStart.current;
    editStart.current = null;
    if (before) world.recordEdit(selectedId, before, after, label);
  };
  const edit = (patch: BodyPatch, before: BodyPatch, label: string) => {
    world.updateBody(selectedId, patch);
    world.recordEdit(selectedId, before, patch, label);
  };

  const parent = dominantBody(engine.bodies, body.x, body.y, body.z, body.mass, body);
  const a = body.appearance;
  /** Mass edits keep black-hole radii ∝ M and stellar luminosity ∝ M^3.5. */
  const massPatch = (m: number): BodyPatch => {
    const patch: BodyPatch = { mass: m };
    if (isBH) patch.radius = body.radius * (m / body.mass);
    if (isStar) patch.luminosity = body.luminosity * Math.pow(m / body.mass, 3.5);
    return patch;
  };

  return (
    <aside className="pointer-events-auto absolute bottom-24 right-4 top-[76px] flex w-[312px] anim-slide-left" data-testid="properties-panel">
      <div className="glass flex w-full flex-col overflow-hidden rounded-2xl" data-ui-panel>
        <header className="flex items-center gap-3 px-4 pb-3 pt-4">
          <Orb type={body.type} size={40} />
          <div className="min-w-0 flex-1">
            <input
              className="w-full truncate rounded-md bg-transparent text-[16px] font-semibold tracking-tight text-ink outline-none ring-cyan/40 focus:bg-black/30 focus:px-1.5 focus:ring-1"
              value={body.name}
              maxLength={40}
              aria-label="Name"
              data-testid="body-name"
              onFocus={() => begin({ name: body.name })}
              onChange={(e) => world.updateBody(selectedId, { name: e.target.value || 'Unnamed' })}
              onBlur={(e) => commit({ name: e.target.value || 'Unnamed' }, 'Rename')}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
            />
            <div className="mt-0.5 text-[11.5px] text-mute" data-testid="body-type">
              {entry.label} · {body.kind === 'gasGiant' ? 'Gas giant' : body.kind === 'blackHole' ? 'Black hole' : body.kind[0].toUpperCase() + body.kind.slice(1)}
            </div>
          </div>
          <IconButton icon={X} label="Deselect" shortcut="Esc" size="sm" onClick={() => world.select(null)} tooltipSide="left" />
        </header>

        <div className="flex items-center gap-1 px-3 pb-3">
          <IconButton icon={Crosshair} label="Focus camera" shortcut="F" onClick={() => world.focus(selectedId)} testId="focus-body" />
          <IconButton icon={followId === selectedId ? VideoOff : Video} label={followId === selectedId ? 'Stop following' : 'Follow with camera'} active={followId === selectedId} onClick={() => (followId === selectedId ? world.follow(null) : world.focus(selectedId))} testId="follow-body" />
          <IconButton icon={Copy} label="Duplicate (same orbit, opposite side)" onClick={() => world.duplicateBody(selectedId)} testId="duplicate-body" />
          {!isBH && <IconButton icon={Bomb} label="Shatter — creative effect, not a physical model" tone="danger" onClick={() => world.shatterBody(selectedId)} testId="shatter-body" />}
          <div className="flex-1" />
          <IconButton icon={Trash2} label="Delete" shortcut="Del" tone="danger" onClick={() => useUI.getState().setConfirmDelete(selectedId)} tooltipSide="left" testId="delete-body" />
        </div>

        <div className="gm-scroll flex-1 overflow-y-auto">
          <Section title="State">
            <Row label="Mass" testId="prop-mass">
              {massInEarth ? `${formatNumber(massValue)} M⊕` : `${formatNumber(massValue)} M☉`}
              <span className="ml-1.5 text-mute">{sci(live.mass * SOLAR_MASS_KG, 3)} kg</span>
            </Row>
            <Row label={isBH ? 'Absorption radius' : 'Radius'} testId="prop-radius">
              {formatNumber(radiusKm)} km{scale !== 1 && <span className="ml-1.5 text-mute">shown ×{scale}</span>}
            </Row>
            {isBH && <Row label="Schwarzschild radius">{formatNumber(((2 * G * live.mass) / (C_AU_PER_YR * C_AU_PER_YR)) * AU_KM)} km</Row>}
            <Row label="Speed" testId="prop-speed">{formatNumber(live.speed * AU_PER_YR_IN_KM_S)} km/s</Row>
            <Row label="Position (AU)" testId="prop-position">{vec(live.pos, 1)}</Row>
            <Row label="Velocity (km/s)" testId="prop-velocity">{vec(live.vel, AU_PER_YR_IN_KM_S, 3)}</Row>
            <div className="flex items-center justify-between gap-2 py-[5px]">
              <span className="flex items-center gap-1 text-[11.5px] text-mute">
                Distance to
                <select
                  className="max-w-[110px] cursor-pointer truncate rounded-md bg-black/30 px-1 py-0.5 text-[11.5px] text-ink outline-none ring-1 ring-white/10"
                  value={refId ?? ''}
                  onChange={(e) => setRefId(e.target.value || null)}
                  data-testid="ref-select"
                >
                  <option value="">{parent ? `${parent.name} (auto)` : 'auto'}</option>
                  {others.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </span>
              <span className="num text-[12px] text-ink" data-testid="prop-distance">{live.refName ? formatDistanceAu(live.refDist) : '—'}</span>
            </div>
            {live.orbit && (
              <div className="mt-1 rounded-lg bg-black/25 px-2.5 py-1.5 text-[11px] text-mute ring-1 ring-white/[0.05]" data-testid="prop-orbit">
                {live.orbit.bound ? (
                  <>
                    Orbiting <span className="text-ink">{live.orbit.parent}</span> · a <span className="num text-ink">{formatDistanceAu(live.orbit.a)}</span> · e <span className="num text-ink">{live.orbit.e.toFixed(3)}</span> · P <span className="num text-ink">{formatSimTime(live.orbit.period)}</span>
                  </>
                ) : (
                  <>
                    <span className="text-ember">Unbound</span> — escaping {live.orbit.parent} (e {live.orbit.e.toFixed(2)})
                  </>
                )}
              </div>
            )}
          </Section>

          <Section title="Physics" right={<span className="text-[10.5px] text-faint">changes affect gravity</span>}>
            <div className="flex items-center justify-between py-1">
              <span className="text-[11.5px] text-mute">Mass</span>
              <div className="w-[130px]">
                <NumberField value={Number(massValue.toPrecision(4))} unit={massUnit} min={1e-12} max={1e9} testId="edit-mass" onCommit={(v) => edit(massPatch(massInEarth ? v * EARTH_MASS_SUN : v), { mass: body.mass, radius: body.radius, luminosity: body.luminosity }, `Change ${body.name} mass`)} />
              </div>
            </div>
            <Slider
              value={logMass}
              min={-13}
              max={isBH ? 4 : 2}
              step={0.01}
              label="Mass (log scale)"
              testId="mass-slider"
              onChange={(v) => {
                begin({ mass: body.mass, radius: body.radius, luminosity: body.luminosity });
                world.updateBody(selectedId, massPatch(10 ** v));
              }}
              onCommit={() => commit({ mass: body.mass, radius: body.radius, luminosity: body.luminosity }, `Change ${body.name} mass`)}
            />
            {!isBH && (
              <>
                <div className="mt-2 flex items-center justify-between py-1">
                  <span className="text-[11.5px] text-mute">Radius</span>
                  <div className="w-[130px]">
                    <NumberField value={Number(radiusKm.toPrecision(5))} unit="km" min={0.01} max={1e9} testId="edit-radius" onCommit={(v) => edit({ radius: v / AU_KM }, { radius: live.radius }, `Change ${body.name} radius`)} />
                  </div>
                </div>
                <Slider
                  value={Math.log10(radiusKm)}
                  min={0}
                  max={7.5}
                  step={0.01}
                  label="Radius (log scale)"
                  onChange={(v) => {
                    begin({ radius: live.radius });
                    world.updateBody(selectedId, { radius: 10 ** v / AU_KM });
                  }}
                  onCommit={(v) => commit({ radius: 10 ** v / AU_KM }, `Change ${body.name} radius`)}
                />
              </>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!parent}
                data-testid="make-circular"
                onClick={() => {
                  if (!parent) return;
                  const v = circularOrbitVelocity(parent, { x: body.x, y: body.y, z: body.z }, body.mass);
                  edit({ velocity: v }, { velocity: { x: body.vx, y: body.vy, z: body.vz } }, `Circularise ${body.name}`);
                }}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-white/[0.05] px-2 py-1.5 text-[11.5px] text-ink ring-1 ring-white/[0.07] transition-colors hover:bg-white/[0.09] disabled:opacity-40"
              >
                <Orbit size={13} /> Circular orbit
              </button>
              <button
                type="button"
                data-testid="make-still"
                onClick={() => {
                  const v = parent ? { x: parent.vx, y: parent.vy, z: parent.vz } : { x: 0, y: 0, z: 0 };
                  edit({ velocity: v }, { velocity: { x: body.vx, y: body.vy, z: body.vz } }, `Stop ${body.name}`);
                }}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-white/[0.05] px-2 py-1.5 text-[11.5px] text-ink ring-1 ring-white/[0.07] transition-colors hover:bg-white/[0.09]"
              >
                <CircleStop size={13} /> Stop (relative)
              </button>
            </div>
            <p className="mt-2 text-[10.5px] leading-snug text-faint">
              Collision radius {formatNumber(effectiveRadius(body, engine.settings.sizeScale) * AU_KM)} km.
            </p>
          </Section>

          {!isBH && (
            <Section title="Appearance">
              <div className="flex items-center gap-2 py-1">
                {a.colors.map((c, i) => (
                  <label key={i} className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-lg ring-1 ring-white/15" style={{ background: c }} title={['Primary', 'Secondary', 'Accent'][i]}>
                    <input
                      type="color"
                      className="absolute inset-0 cursor-pointer opacity-0"
                      value={c}
                      onChange={(e) => {
                        const colors = [...a.colors] as [string, string, string];
                        colors[i] = e.target.value;
                        edit({ appearance: { ...a, colors } }, { appearance: { ...a } }, `Recolour ${body.name}`);
                      }}
                    />
                  </label>
                ))}
                <button
                  type="button"
                  className="ml-auto rounded-lg px-2 py-1 text-[11px] text-mute ring-1 ring-white/10 transition-colors hover:text-cyan"
                  onClick={() => edit({ appearance: { ...a, seed: Math.floor(Math.random() * 1e6) } }, { appearance: { ...a } }, `Regenerate ${body.name}`)}
                >
                  New surface
                </button>
              </div>
              {isStar && (
                <>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11.5px] text-mute">Temperature</span>
                    <span className="num text-[11.5px] text-ink">{Math.round(a.temperature)} K</span>
                  </div>
                  <Slider value={a.temperature} min={2400} max={30000} step={50} label="Star temperature" onChange={(v) => world.updateBody(selectedId, { appearance: { ...a, temperature: v } })} />
                </>
              )}
              {!isStar && (
                <>
                  <Toggle
                    label="Atmosphere"
                    checked={Boolean(a.atmosphereColor)}
                    onChange={(on) => edit({ appearance: { ...a, atmosphereColor: on ? a.atmosphereColor ?? '#7fb6ff' : null, atmosphereDensity: on ? Math.max(a.atmosphereDensity, 0.5) : a.atmosphereDensity } }, { appearance: { ...a } }, 'Toggle atmosphere')}
                  />
                  {a.atmosphereColor && (
                    <div className="flex items-center gap-3 pb-1">
                      <label className="relative h-6 w-6 shrink-0 cursor-pointer overflow-hidden rounded-md ring-1 ring-white/15" style={{ background: a.atmosphereColor }}>
                        <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={a.atmosphereColor} onChange={(e) => world.updateBody(selectedId, { appearance: { ...a, atmosphereColor: e.target.value } })} />
                      </label>
                      <Slider value={a.atmosphereDensity} min={0.05} max={1} step={0.01} label="Atmosphere thickness" onChange={(v) => world.updateBody(selectedId, { appearance: { ...a, atmosphereDensity: v } })} />
                    </div>
                  )}
                  {(a.style === 'terran' || a.style === 'ice' || a.style === 'desert' || a.style === 'mars') && (
                    <>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-[11.5px] text-mute">Clouds</span>
                        <span className="num text-[11.5px] text-ink">{Math.round(a.clouds * 100)}%</span>
                      </div>
                      <Slider value={a.clouds} min={0} max={1} step={0.01} label="Cloud cover" onChange={(v) => world.updateBody(selectedId, { appearance: { ...a, clouds: v } })} />
                    </>
                  )}
                  {body.kind === 'gasGiant' && (
                    <Toggle
                      label="Rings"
                      checked={Boolean(a.rings)}
                      onChange={(on) => edit({ appearance: { ...a, rings: on ? { inner: 1.3, outer: 2.3, color: '#d8c7a0', opacity: 0.85 } : null } }, { appearance: { ...a } }, 'Toggle rings')}
                    />
                  )}
                </>
              )}
            </Section>
          )}
        </div>
        <div className={cx('border-t border-white/[0.06] px-4 py-2.5 text-[10.5px] leading-snug text-faint')}>
          Newtonian gravity{isBH ? ' · stylised black-hole visuals' : ''}
        </div>
      </div>
    </aside>
  );
}
