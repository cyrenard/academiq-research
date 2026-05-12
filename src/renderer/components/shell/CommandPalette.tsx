import { useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';

export type CommandItem = {
  id: string;
  label: string;
  group: string;
  run: () => void;
};

type CommandPaletteProps = {
  open: boolean;
  commands: CommandItem[];
  onClose: () => void;
};

export function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) => `${command.group} ${command.label}`.toLowerCase().includes(needle));
  }, [commands, query]);

  return (
    <Modal title="Komut Paleti" open={open} onClose={onClose}>
      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="mb-3 h-10 w-full rounded-md border border-aq-line bg-white px-3 text-sm outline-none focus:border-aq-navy"
        placeholder="Komut ara..."
      />
      <div className="space-y-1">
        {filtered.map((command) => (
          <button
            type="button"
            key={command.id}
            onClick={() => {
              command.run();
              onClose();
            }}
            className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-white"
          >
            <span>{command.label}</span>
            <span className="text-[10px] uppercase tracking-[0.16em] text-aq-muted">{command.group}</span>
          </button>
        ))}
        {!filtered.length ? <div className="p-6 text-center text-sm text-aq-muted">Komut bulunamadı.</div> : null}
      </div>
    </Modal>
  );
}
