/**
 * StepCatalog — Sidebar met beschikbare stappen om toe te voegen
 */

import { useState, useEffect } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { apiJson, CATEGORY_COLORS, type StepDefinitionData } from './types';

interface Props {
  onAdd: (stepDefId: number, x: number, y: number) => void;
  existingStepDefIds: number[];
  onClose: () => void;
}

const CATEGORIES = [
  { id: 'all', label: 'Alles' },
  { id: 'setup', label: 'Setup' },
  { id: 'research', label: 'Research' },
  { id: 'script', label: 'Script' },
  { id: 'audio', label: 'Audio' },
  { id: 'visual', label: 'Visueel' },
  { id: 'post', label: 'Post-productie' },
  { id: 'output', label: 'Output' },
];

export default function StepCatalog({ onAdd, existingStepDefIds, onClose }: Props) {
  const [defs, setDefs] = useState<StepDefinitionData[]>([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiJson('/step-definitions').then(setDefs).catch(() => {});
  }, []);

  const filtered = defs.filter(d => {
    if (filter !== 'all' && d.category !== filter) return false;
    if (search && !d.name.toLowerCase().includes(search.toLowerCase()) && !d.slug.includes(search.toLowerCase())) return false;
    return true;
  });

  const alreadyUsed = (id: number) => existingStepDefIds.includes(id);

  return (
    <div className="w-[280px] shrink-0 bg-surface-50/90 backdrop-blur-xl border-r border-white/[0.06] flex flex-col h-full">
      <div className="p-3 border-b border-white/[0.06]">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-white">Stap Catalogus</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2" />
          <input className="input-base text-xs !pl-8" placeholder="Zoek stap..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-white/[0.04]">
        {CATEGORIES.map(cat => (
          <button key={cat.id} onClick={() => setFilter(cat.id)}
            className={`text-[9px] px-2 py-0.5 rounded-full transition ${filter === cat.id ? 'bg-brand-600/20 text-brand-300' : 'text-zinc-500 hover:text-zinc-300'}`}>
            {cat.label}
          </button>
        ))}
      </div>

      {/* Step list */}
      <div className="flex-1 overflow-auto p-2 space-y-0.5">
        {filtered.map(def => {
          const used = alreadyUsed(def.id);
          const cat = CATEGORY_COLORS[def.category] || CATEGORY_COLORS.general;
          return (
            <div key={def.id} className={`rounded-lg p-2.5 transition ${used ? 'opacity-40' : 'hover:bg-white/[0.04] cursor-pointer'}`}>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full shrink-0 ${def.isReady ? cat.dot : 'bg-amber-400'}`} />
                <span className="text-[11px] font-medium text-zinc-200 flex-1 truncate">{def.name}</span>
                {!used && (
                  <button onClick={() => onAdd(def.id, 400, 200)} className="text-zinc-500 hover:text-brand-400 p-0.5">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
                {used && <span className="text-[8px] text-zinc-600">in gebruik</span>}
              </div>
              <p className="text-[9px] text-zinc-500 mt-0.5 ml-4">{def.description.slice(0, 60)}</p>
              <div className="flex items-center gap-1 mt-1 ml-4">
                <span className={`text-[8px] px-1 py-0 rounded ${cat.bg} ${cat.text}`}>{def.category}</span>
                <span className="text-[8px] text-zinc-600">{def.inputSchema.length}→{def.outputSchema.length}</span>
                {!def.isReady && <span className="text-[8px] text-amber-400">skeleton</span>}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-zinc-600 text-xs">Geen stappen gevonden</div>
        )}
      </div>
    </div>
  );
}
