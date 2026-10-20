export type MiniMaxModelId = 'MiniMax-M3.1-Flash' | 'MiniMax-M3' | 'MiniMax-M2.7';

export interface MiniMaxModelDefinition {
  id: MiniMaxModelId;
  /** User facing display name */
  name: string;
  /** Longer description shown in pickers */
  description?: string;
  /** Whether the model accepts image input */
  supportsImages?: boolean;
  /** Alias strings that should resolve to this model */
  aliases: string[];
}

export const MINIMAX_MODEL_DEFINITIONS: MiniMaxModelDefinition[] = [
  {
    id: 'MiniMax-M3.1-Flash',
    name: 'MiniMax M3.1 Flash',
    description: 'MiniMax M3.1 Flash with 1M context, multimodal input and adaptive thinking',
    supportsImages: true,
    aliases: ['minimax-m3.1-flash', 'minimax m3.1 flash', 'm3.1-flash', 'minimax-latest', 'minimax'],
  },
  {
    id: 'MiniMax-M3',
    name: 'MiniMax M3',
    description: 'MiniMax M3 with 1M context, multimodal input and Claude Code compatible agent runtime',
    supportsImages: true,
    aliases: ['minimax-m3', 'minimaxm3', 'minimax m3', 'minimax_m3', 'm3'],
  },
];

// Keep saved legacy selections and aliases without advertising them in the catalog.
const MINIMAX_LEGACY_MODEL_DEFINITIONS: MiniMaxModelDefinition[] = [
  {
    id: 'MiniMax-M2.7',
    name: 'MiniMax M2.7',
    supportsImages: false,
    aliases: ['minimax-m2.7', 'minimaxm2.7', 'minimax m2.7', 'minimax_m2_7', 'm2.7', 'm27'],
  },
];

export const MINIMAX_DEFAULT_MODEL: MiniMaxModelId = 'MiniMax-M3.1-Flash';

const ALL_MINIMAX_MODEL_DEFINITIONS = [...MINIMAX_MODEL_DEFINITIONS, ...MINIMAX_LEGACY_MODEL_DEFINITIONS];
const MINIMAX_MODEL_ALIAS_MAP: Record<string, MiniMaxModelId> = ALL_MINIMAX_MODEL_DEFINITIONS.reduce(
  (map, definition) => {
    definition.aliases.forEach((alias) => {
      const key = alias.trim().toLowerCase();
      map[key] = definition.id;
    });
    map[definition.id.toLowerCase()] = definition.id;
    return map;
  },
  {} as Record<string, MiniMaxModelId>,
);

export function normalizeMiniMaxModelId(model?: string | null): string {
  const trimmed = model?.trim();
  if (!trimmed) {
    return MINIMAX_DEFAULT_MODEL;
  }
  return MINIMAX_MODEL_ALIAS_MAP[trimmed.toLowerCase()] ?? trimmed;
}

export function getMiniMaxModelDefinition(id: string): MiniMaxModelDefinition | undefined {
  const normalized = normalizeMiniMaxModelId(id);
  return ALL_MINIMAX_MODEL_DEFINITIONS.find((definition) => definition.id === normalized);
}

export function getMiniMaxModelDisplayName(id?: string | null): string {
  const normalized = normalizeMiniMaxModelId(id);
  return getMiniMaxModelDefinition(normalized)?.name ?? normalized;
}
