import { useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { engine, useWorld } from '../stores/worldStore';
import { useUI } from '../stores/uiStore';
import { Button } from './ui/primitives';

export function ConfirmDelete() {
  const id = useUI((s) => s.confirmDelete);
  const setConfirm = useUI((s) => s.setConfirmDelete);
  const body = engine.getBody(id);

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        useWorld.getState().removeBody(id);
        setConfirm(null);
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        setConfirm(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [id, setConfirm]);

  if (!id || !body) return null;
  return (
    <div className="fixed inset-0 z-[65] grid place-items-center bg-[#03050b]/40 backdrop-blur-[2px] anim-fade" onPointerDown={(e) => e.target === e.currentTarget && setConfirm(null)}>
      <div className="glass w-[340px] rounded-2xl p-5 anim-rise" role="alertdialog" aria-label={`Delete ${body.name}`} data-testid="confirm-delete">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-danger/15 text-danger">
            <Trash2 size={17} />
          </div>
          <div>
            <div className="text-[14px] font-semibold text-ink">Delete {body.name}?</div>
            <div className="text-[12px] text-mute">Its gravity vanishes instantly. You can undo with Ctrl+Z.</div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button tone="ghost" onClick={() => setConfirm(null)}>
            Cancel
          </Button>
          <Button
            tone="danger"
            testId="confirm-delete-yes"
            onClick={() => {
              useWorld.getState().removeBody(id);
              setConfirm(null);
            }}
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
