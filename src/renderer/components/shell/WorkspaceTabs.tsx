import { useEffect, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { AcademiqWorkspace } from '../../lib/app-state';

type WorkspaceTabsProps = {
  workspaces: AcademiqWorkspace[];
  activeWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onAddWorkspace: () => void;
  onRenameWorkspace: (id?: string) => void;
  onDeleteWorkspace: (id?: string) => void;
};

export function WorkspaceTabs({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onAddWorkspace,
  onRenameWorkspace,
  onDeleteWorkspace
}: WorkspaceTabsProps) {
  const [menu, setMenu] = useState<{ workspaceId: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [menu]);

  const openWorkspaceMenu = (event: ReactMouseEvent, workspaceId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ workspaceId, x: event.clientX, y: event.clientY });
  };

  return (
    <div className="relative flex h-[38px] items-center gap-4 px-5 text-xs">
      <span className="font-semibold uppercase tracking-[0.32em] text-aq-muted">Çalışma Alanı</span>
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        {workspaces.map((workspace) => {
          const active = workspace.id === activeWorkspaceId;
          return (
            <button
              type="button"
              key={workspace.id}
              onClick={() => onSelectWorkspace(workspace.id)}
              onContextMenu={(event) => openWorkspaceMenu(event, workspace.id)}
              className={active
                ? 'group flex max-w-28 items-center gap-1 rounded-md bg-[#171b22] px-3 py-1.5 font-semibold text-white shadow-sm'
                : 'group flex max-w-28 items-center gap-1 rounded-md px-2 py-1.5 text-aq-muted hover:bg-aq-panel hover:text-aq-ink'}
              title={workspace.name}
            >
              <span className="truncate">{workspace.name}</span>
              <span
                role="button"
                tabIndex={-1}
                className={active
                  ? 'ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded text-[11px] text-white/70 opacity-0 transition hover:bg-white/15 hover:text-white group-hover:opacity-100'
                  : 'ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded text-[11px] text-aq-muted opacity-0 transition hover:bg-white hover:text-red-600 group-hover:opacity-100'}
                title="Çalışma alanını sil"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onDeleteWorkspace(workspace.id);
                }}
              >
                ×
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onAddWorkspace}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-lg text-aq-muted hover:bg-white hover:text-aq-ink"
          title="Yeni çalışma alanı"
          aria-label="Yeni çalışma alanı"
        >
          +
        </button>
      </div>
      <button type="button" onClick={() => onRenameWorkspace()} className="sr-only">Workspace yeniden adlandir</button>
      <button type="button" onClick={() => onDeleteWorkspace()} className="sr-only">Workspace sil</button>
      {menu ? (
        <div
          className="fixed z-[2300] w-48 rounded-[13px] border border-aq-line/90 bg-white/95 p-1.5 text-[11px] shadow-[0_24px_64px_rgba(22,27,34,0.20)] backdrop-blur-xl"
          style={{
            left: Math.min(menu.x, window.innerWidth - 204),
            top: Math.min(menu.y, window.innerHeight - 112)
          }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            className="block w-full rounded-md px-2.5 py-2 text-left font-medium text-aq-ink hover:bg-aq-panel"
            onClick={() => {
              onRenameWorkspace(menu.workspaceId);
              setMenu(null);
            }}
          >
            Yeniden adlandır
          </button>
          <button
            type="button"
            className="mt-1 block w-full rounded-md px-2.5 py-2 text-left font-semibold text-red-700 hover:bg-red-50"
            onClick={() => {
              onDeleteWorkspace(menu.workspaceId);
              setMenu(null);
            }}
          >
            Çalışma alanını sil
          </button>
        </div>
      ) : null}
    </div>
  );
}
