import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import { audio } from '../../effects/audio';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  tone?: 'default' | 'danger' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  tooltipSide?: 'right' | 'bottom' | 'top' | 'left';
  testId?: string;
}

/** Icon-only button with an accessible label and a styled tooltip. */
export function IconButton({ icon: Icon, label, shortcut, onClick, active, disabled, tone = 'default', size = 'md', tooltipSide = 'bottom', testId }: IconButtonProps) {
  const dims = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-11 w-11' : 'h-9 w-9';
  const iconSize = size === 'sm' ? 15 : size === 'lg' ? 19 : 17;
  const tip = {
    right: 'left-full top-1/2 ml-3 -translate-y-1/2',
    left: 'right-full top-1/2 mr-3 -translate-y-1/2',
    bottom: 'top-full left-1/2 mt-2.5 -translate-x-1/2',
    top: 'bottom-full left-1/2 mb-2.5 -translate-x-1/2',
  }[tooltipSide];
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      data-testid={testId}
      disabled={disabled}
      onClick={() => {
        audio.start();
        audio.click(active ? 0.9 : 1.1);
        onClick?.();
      }}
      className={cx(
        'group relative grid place-items-center rounded-xl transition-all duration-200 outline-none',
        'focus-visible:ring-2 focus-visible:ring-cyan/60',
        dims,
        disabled && 'cursor-not-allowed opacity-35',
        !disabled && !active && tone === 'default' && 'text-mute hover:bg-white/[0.07] hover:text-ink',
        !disabled && !active && tone === 'danger' && 'text-mute hover:bg-danger/15 hover:text-danger',
        !disabled && !active && tone === 'accent' && 'text-cyan hover:bg-cyan/10',
        active && 'bg-cyan/[0.14] text-cyan shadow-[inset_0_0_0_1px_rgb(65_217_255/0.35),0_0_18px_-4px_rgb(65_217_255/0.55)]',
      )}
    >
      <Icon size={iconSize} strokeWidth={1.7} />
      <span
        role="tooltip"
        className={cx(
          'pointer-events-none absolute z-50 whitespace-nowrap rounded-lg border border-white/10 bg-[#0b1020]/95 px-2.5 py-1.5 text-[11.5px] font-medium text-ink opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-hover:delay-300',
          tip,
        )}
      >
        {label}
        {shortcut && <kbd className="ml-2 rounded border border-white/15 bg-white/5 px-1.5 py-px font-mono text-[10px] text-mute">{shortcut}</kbd>}
      </span>
    </button>
  );
}

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  label?: string;
  testId?: string;
}

export function Slider({ value, min, max, step = 0.001, onChange, onCommit, label, testId }: SliderProps) {
  const fill = `${((value - min) / (max - min)) * 100}%`;
  return (
    <input
      type="range"
      className="gm-range w-full"
      aria-label={label}
      data-testid={testId}
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ ['--fill' as string]: fill }}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
    />
  );
}

export function Toggle({ checked, onChange, label, description, testId }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; testId?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-4 rounded-xl px-1 py-2 transition-colors hover:bg-white/[0.03]">
      <span className="min-w-0">
        <span className="block text-[13px] text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[11.5px] leading-snug text-mute">{description}</span>}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        data-testid={testId}
        onClick={() => {
          audio.click(checked ? 0.85 : 1.15);
          onChange(!checked);
        }}
        className={cx('relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200', checked ? 'bg-cyan/80' : 'bg-white/12')}
      >
        <span className={cx('absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-transform duration-200', checked ? 'translate-x-[19px]' : 'translate-x-[3px]')} />
      </button>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, testId, size = 'md' }: { value: T; options: { value: T; label: string; title?: string }[]; onChange: (v: T) => void; testId?: string; size?: 'sm' | 'md' }) {
  return (
    <div className="flex rounded-xl bg-black/30 p-1 ring-1 ring-white/[0.06]" role="radiogroup" data-testid={testId}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => {
            audio.click(1);
            onChange(o.value);
          }}
          className={cx(
            'flex-1 rounded-lg font-medium transition-all duration-200',
            size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-[12px]',
            value === o.value ? 'bg-white/[0.1] text-ink shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]' : 'text-mute hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Dialog({ title, subtitle, onClose, children, width = 'max-w-lg', testId }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; width?: string; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-[#03050b]/55 p-4 backdrop-blur-[3px] anim-fade" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} data-testid={testId} className={cx('glass anim-rise flex max-h-[86vh] w-full flex-col rounded-2xl outline-none', width)}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight text-ink">{title}</h2>
            {subtitle && <p className="mt-1 text-[12.5px] text-mute">{subtitle}</p>}
          </div>
          <IconButton icon={X} label="Close" shortcut="Esc" onClick={onClose} size="sm" tooltipSide="left" />
        </div>
        <div className="gm-scroll overflow-y-auto px-6 pb-6">{children}</div>
      </div>
    </div>
  );
}

export function Button({ children, onClick, tone = 'default', disabled, testId, icon: Icon, className }: { children: ReactNode; onClick?: () => void; tone?: 'default' | 'primary' | 'danger' | 'ghost'; disabled?: boolean; testId?: string; icon?: LucideIcon; className?: string }) {
  return (
    <button
      type="button"
      disabled={disabled}
      data-testid={testId}
      onClick={() => {
        audio.start();
        audio.click(1);
        onClick?.();
      }}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-[12.5px] font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40',
        tone === 'primary' && 'bg-gradient-to-r from-cyan/90 to-[#6aa8ff]/90 text-[#03101a] shadow-[0_0_24px_-6px_rgb(65_217_255/0.8)] hover:brightness-110',
        tone === 'default' && 'bg-white/[0.06] text-ink ring-1 ring-white/[0.08] hover:bg-white/[0.1]',
        tone === 'danger' && 'bg-danger/15 text-[#ff8a96] ring-1 ring-danger/30 hover:bg-danger/25',
        tone === 'ghost' && 'text-mute hover:bg-white/[0.06] hover:text-ink',
        className,
      )}
    >
      {Icon && <Icon size={15} strokeWidth={1.8} />}
      {children}
    </button>
  );
}

/** Editable number with unit; commits on Enter/blur, ignores invalid input. */
export function NumberField({ value, onCommit, unit, testId, min, max, format }: { value: number; onCommit: (v: number) => void; unit?: string; testId?: string; min?: number; max?: number; format?: (v: number) => string }) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (format ? format(value) : String(Number(value.toPrecision(6))));
  const commit = () => {
    if (text === null) return;
    const v = Number(text.replace(/[,\s]/g, '').replace('×10^', 'e').replace(/×\s*10/, 'e'));
    setText(null);
    if (!Number.isFinite(v)) return;
    if (min !== undefined && v < min) return;
    if (max !== undefined && v > max) return;
    onCommit(v);
  };
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-black/30 px-2 ring-1 ring-white/[0.06] focus-within:ring-cyan/40">
      <input
        data-testid={testId}
        className="num h-7 w-full min-w-0 bg-transparent text-[12px] text-ink outline-none"
        value={shown}
        inputMode="decimal"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(null);
            (e.target as HTMLInputElement).blur();
          }
          e.stopPropagation();
        }}
      />
      {unit && <span className="shrink-0 text-[10.5px] text-mute">{unit}</span>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex min-w-[22px] items-center justify-center rounded-md border border-white/15 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10.5px] text-ink/90 shadow-[inset_0_-1px_0_rgb(255_255_255/0.08)]">{children}</kbd>;
}
