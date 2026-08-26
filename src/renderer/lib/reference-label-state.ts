import type { AcademiqAppState, AcademiqReference } from './app-state';

export type ReferenceLabel = {
  name: string;
  color?: string;
};

export const REFERENCE_LABEL_COLORS = [
  '#4caf50',
  '#f44336',
  '#2196f3',
  '#9c27b0',
  '#ff9800',
  '#e91e63',
  '#00bcd4',
  '#795548'
] as const;

export function referenceLabelName(label: unknown) {
  return typeof label === 'string'
    ? label.trim()
    : String((label as { name?: unknown } | null)?.name || '').trim();
}

function sameLabel(left: unknown, right: unknown) {
  return referenceLabelName(left).toLowerCase() === referenceLabelName(right).toLowerCase();
}

export function referenceHasManagedLabel(state: AcademiqAppState, name: string, exceptName = '') {
  const labels = Array.isArray(state.customLabels) ? state.customLabels : [];
  return labels.some((label) => sameLabel(label, name) && (!exceptName || !sameLabel(label, exceptName)));
}

export function addManagedReferenceLabel(state: AcademiqAppState, label: ReferenceLabel): AcademiqAppState {
  const name = referenceLabelName(label);
  if (!name || referenceHasManagedLabel(state, name)) return state;
  const labels = Array.isArray(state.customLabels) ? state.customLabels : [];
  return {
    ...state,
    customLabels: [...labels, { name, color: label.color || '#9ca3af' }]
  };
}

export function updateManagedReferenceLabel(
  state: AcademiqAppState,
  currentName: string,
  nextLabel: ReferenceLabel
): AcademiqAppState {
  const from = referenceLabelName(currentName);
  const name = referenceLabelName(nextLabel);
  if (!from || !name || referenceHasManagedLabel(state, name, from)) return state;
  const color = nextLabel.color || '#9ca3af';
  const labels = Array.isArray(state.customLabels) ? state.customLabels : [];
  let changed = false;
  const customLabels = labels.map((label) => {
    if (!sameLabel(label, from)) return label;
    changed = true;
    return { name, color };
  });
  const wss = state.wss.map((workspace) => ({
    ...workspace,
    lib: (workspace.lib || []).map((reference) => {
      if (!Array.isArray(reference.labels) || !reference.labels.some((label) => sameLabel(label, from))) return reference;
      changed = true;
      return {
        ...reference,
        labels: reference.labels.map((label) => {
          if (!sameLabel(label, from)) return label;
          return typeof label === 'object' && label
            ? { ...label, name, color }
            : { name, color };
        })
      };
    })
  }));
  return changed ? { ...state, customLabels, wss } : state;
}

export function deleteManagedReferenceLabel(state: AcademiqAppState, name: string): AcademiqAppState {
  const target = referenceLabelName(name);
  if (!target) return state;
  const labels = Array.isArray(state.customLabels) ? state.customLabels : [];
  return {
    ...state,
    customLabels: labels.filter((label) => !sameLabel(label, target)),
    wss: state.wss.map((workspace) => ({
      ...workspace,
      lib: (workspace.lib || []).map((reference) => ({
        ...reference,
        labels: Array.isArray(reference.labels)
          ? reference.labels.filter((label) => !sameLabel(label, target))
          : []
      }))
    }))
  };
}

export function countReferencesWithLabel(references: AcademiqReference[], name: string) {
  return references.filter((reference) => (
    Array.isArray(reference.labels) && reference.labels.some((label) => sameLabel(label, name))
  )).length;
}
