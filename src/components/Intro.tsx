import { useEffect, useState } from 'react';
import { useUI } from '../stores/uiStore';
import { audio } from '../effects/audio';
import { cx } from './ui/primitives';

/** Short cinematic title card over the camera fly-in. Skippable; auto-dismisses. */
export function Intro() {
  const done = useUI((s) => s.introDone);
  const setDone = useUI((s) => s.setIntroDone);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (done) return;
    const t1 = window.setTimeout(() => setLeaving(true), 3900);
    const t2 = window.setTimeout(() => setDone(true), 4900);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [done, setDone]);

  if (done) return null;
  const skip = () => {
    audio.start();
    setLeaving(true);
    window.setTimeout(() => setDone(true), 450);
  };

  return (
    <div
      data-testid="intro"
      className={cx('fixed inset-0 z-[70] flex flex-col items-center justify-center transition-opacity duration-1000', leaving ? 'pointer-events-none opacity-0' : 'opacity-100')}
      style={{ background: 'radial-gradient(ellipse at center, rgb(3 5 11 / 0.2) 0%, rgb(3 5 11 / 0.75) 70%, rgb(3 5 11 / 0.95) 100%)' }}
      onPointerDown={skip}
    >
      <div className="text-center">
        <h1
          className="bg-gradient-to-b from-white via-[#e6f7ff] to-[#7fdfff] bg-clip-text pl-[0.32em] text-[clamp(40px,8vw,104px)] font-semibold leading-none text-transparent"
          style={{ animation: 'gm-logo-in 2.4s cubic-bezier(0.16,1,0.3,1) both', letterSpacing: '0.32em' }}
        >
          GOD MODE
        </h1>
        <div className="mx-auto mt-6 h-px w-[min(520px,70vw)] origin-center bg-gradient-to-r from-transparent via-cyan/70 to-transparent" style={{ animation: 'gm-line 1.6s 0.6s cubic-bezier(0.16,1,0.3,1) both' }} />
        <p className="mt-5 pl-[0.5em] text-[13px] font-medium tracking-[0.5em] text-mute" style={{ animation: 'gm-rise 1s 1.1s cubic-bezier(0.16,1,0.3,1) both' }}>
          CREATE<span className="text-cyan"> · </span>CONTROL<span className="text-violet"> · </span>DESTROY
        </p>
      </div>
      <button
        type="button"
        data-testid="skip-intro"
        onClick={skip}
        className="absolute bottom-10 rounded-full px-5 py-2 text-[12px] tracking-[0.2em] text-mute ring-1 ring-white/15 transition-all hover:bg-white/5 hover:text-ink"
        style={{ animation: 'gm-fade 0.8s 0.9s both' }}
      >
        SKIP
      </button>
    </div>
  );
}
