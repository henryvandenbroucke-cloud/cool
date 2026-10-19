import { getCatalogEntry } from '../celestial/catalog';
import { blackbodyHex, mixHex } from '../utils/color';

/** Tiny CSS-rendered preview sphere for a catalog entry (lit from the upper left). */
export function Orb({ type, size = 26 }: { type: string; size?: number }) {
  const e = getCatalogEntry(type);
  const [c0, c1, c2] = e.appearance.colors;
  let background: string;
  let shadow = 'none';
  if (e.kind === 'star') {
    const c = blackbodyHex(e.appearance.temperature);
    background = `radial-gradient(circle at 40% 38%, #ffffff 0%, ${mixHex(c, '#ffffff', 0.5)} 30%, ${c} 62%, ${mixHex(c, '#ff5a00', 0.4)} 100%)`;
    shadow = `0 0 ${size * 0.55}px ${size * 0.08}px ${c}88`;
  } else if (e.kind === 'blackHole') {
    background = `radial-gradient(circle, #000 34%, #ffe1b5 41%, #ff9a3c 52%, #a03a0a 66%, transparent 72%)`;
    shadow = `0 0 ${size * 0.5}px 0 #ff9a3c66`;
  } else if (e.kind === 'gasGiant') {
    background = `radial-gradient(circle at 34% 30%, ${mixHex(c2, '#ffffff', 0.3)} 0%, transparent 46%), repeating-linear-gradient(170deg, ${c0} 0 ${size * 0.11}px, ${c1} ${size * 0.11}px ${size * 0.18}px, ${c2} ${size * 0.18}px ${size * 0.23}px), ${c0}`;
  } else if (e.appearance.style === 'terran') {
    background = `radial-gradient(circle at 34% 30%, #ffffff55 0%, transparent 40%), radial-gradient(circle at 62% 58%, ${c1} 0 18%, transparent 19%), radial-gradient(circle at 30% 64%, ${c2} 0 12%, transparent 13%), radial-gradient(circle at 50% 50%, #2a6fd6 0%, ${c0} 70%)`;
  } else {
    background = `radial-gradient(circle at 34% 30%, ${mixHex(c2, '#ffffff', 0.25)} 0%, ${c0} 42%, ${c1} 100%)`;
  }
  const ring = e.appearance.rings;
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <span
        className="block rounded-full"
        style={{
          width: size * (ring ? 0.66 : 0.86),
          height: size * (ring ? 0.66 : 0.86),
          background,
          boxShadow: `${shadow}, inset ${-size * 0.12}px ${-size * 0.12}px ${size * 0.22}px rgb(0 0 0 / 0.55)`,
        }}
      />
      {ring && <span className="absolute left-0 right-0 top-1/2 h-[28%] -translate-y-1/2 rounded-[50%] border-[1.5px]" style={{ borderColor: `${ring.color}cc`, transform: 'translateY(-50%) rotate(-16deg)' }} />}
    </span>
  );
}
