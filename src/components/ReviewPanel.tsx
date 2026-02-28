import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, RotateCcw, Filter, Image, Film, CheckCheck, Loader2 } from 'lucide-react';
import { Project } from '../types';
import * as api from '../api';
import { getFileUrl } from '../api';

interface ReviewPanelProps {
  project: Project;
}

type AssetType = 'all' | 'clips' | 'images';
type ReviewFilter = 'all' | 'pending' | 'approved' | 'rejected';

interface AssetItem {
  id: string;
  type: 'clip' | 'image';
  title: string;
  description: string;
  sourceUrl: string;
  localPath?: string;
  thumbnailPath?: string;
  reviewStatus: string;
  tags?: string;
  category?: string;
  startTime?: string;
  endTime?: string;
}

export default function ReviewPanel({ project }: ReviewPanelProps) {
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [assetType, setAssetType] = useState<AssetType>('all');
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('pending');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [updating, setUpdating] = useState<string | null>(null);
  const [counts, setCounts] = useState<any>({});

  const loadAssets = async () => {
    setLoading(true);
    try {
      const data = await api.assetReview.getAssets(project.id);
      const items: AssetItem[] = [
        ...(data.clips || []).map((c: any) => ({
          id: c.id, type: 'clip' as const, title: c.title, description: c.description,
          sourceUrl: c.sourceUrl, localPath: c.localPath, thumbnailPath: c.thumbnailPath,
          reviewStatus: c.reviewStatus || 'pending', tags: c.tags, category: c.category,
          startTime: c.startTime, endTime: c.endTime,
        })),
        ...(data.images || []).map((i: any) => ({
          id: i.id, type: 'image' as const, title: i.title, description: i.description,
          sourceUrl: i.sourceUrl, localPath: i.localPath, thumbnailPath: i.thumbnailPath,
          reviewStatus: i.reviewStatus || 'pending', tags: i.tags, category: i.category,
        })),
      ];
      setAssets(items);
      setCounts(data.counts || {});
    } catch (err: any) {
      console.error('Laden mislukt:', err);
    }
    setLoading(false);
  };

  useEffect(() => { loadAssets(); }, [project.id]);

  const filteredAssets = assets.filter(a => {
    if (assetType === 'clips' && a.type !== 'clip') return false;
    if (assetType === 'images' && a.type !== 'image') return false;
    if (reviewFilter !== 'all' && a.reviewStatus !== reviewFilter) return false;
    return true;
  });

  const handleReview = async (id: string, status: 'approved' | 'rejected' | 'pending', type: 'clip' | 'image') => {
    setUpdating(id);
    try {
      await api.assetReview.updateStatus(id, status, type);
      setAssets(prev => prev.map(a => a.id === id ? { ...a, reviewStatus: status } : a));
    } catch (err: any) {
      alert(err.message);
    }
    setUpdating(null);
  };

  const handleBulkAction = async (status: 'approved' | 'rejected') => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const clipIds = ids.filter(id => assets.find(a => a.id === id)?.type === 'clip');
    const imageIds = ids.filter(id => assets.find(a => a.id === id)?.type === 'image');

    try {
      if (clipIds.length > 0) await api.assetReview.bulkUpdate(clipIds, status, 'clip');
      if (imageIds.length > 0) await api.assetReview.bulkUpdate(imageIds, status, 'image');
      setAssets(prev => prev.map(a => selectedIds.has(a.id) ? { ...a, reviewStatus: status } : a));
      setSelectedIds(new Set());
      await loadAssets();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredAssets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAssets.map(a => a.id)));
    }
  };

  const getPreviewUrl = (asset: AssetItem) => {
    if (asset.thumbnailPath) return getFileUrl('', asset.thumbnailPath);
    if (asset.localPath) return getFileUrl('', asset.localPath);
    if (asset.sourceUrl) return getFileUrl(asset.sourceUrl, '');
    return '';
  };

  const totalPending = (counts.clipsPending || 0) + (counts.imagesPending || 0);
  const totalApproved = (counts.clipsApproved || 0) + (counts.imagesApproved || 0);
  const totalRejected = (counts.clipsRejected || 0) + (counts.imagesRejected || 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header met filters */}
      <div className="glass rounded-xl p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex gap-1">
            {([
              { key: 'all', label: 'Alles', icon: Filter },
              { key: 'clips', label: 'Clips', icon: Film },
              { key: 'images', label: 'Images', icon: Image },
            ] as const).map(t => (
              <button key={t.key} onClick={() => setAssetType(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  assetType === t.key ? 'bg-brand-500/20 text-brand-300' : 'bg-surface-200 text-zinc-500 hover:text-zinc-300'
                }`}>
                <t.icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            ))}
          </div>

          <div className="w-px h-6 bg-white/[0.06]" />

          <div className="flex gap-1">
            {([
              { key: 'pending', label: 'Te reviewen', count: totalPending, color: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
              { key: 'approved', label: 'Goedgekeurd', count: totalApproved, color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
              { key: 'rejected', label: 'Afgekeurd', count: totalRejected, color: 'bg-red-500/15 text-red-400 border-red-500/20' },
              { key: 'all', label: 'Alle', count: assets.length, color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20' },
            ] as const).map(s => (
              <button key={s.key} onClick={() => setReviewFilter(s.key)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                  reviewFilter === s.key ? s.color : 'bg-surface-200 text-zinc-600 border-white/[0.04] hover:text-zinc-400'
                }`}>
                {s.label} <span className="font-bold">{s.count}</span>
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-zinc-500">{selectedIds.size} geselecteerd</span>
              <button onClick={() => handleBulkAction('approved')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 text-[11px] font-medium hover:bg-emerald-500/25 transition-colors">
                <CheckCircle2 className="w-3.5 h-3.5" /> Goedkeuren
              </button>
              <button onClick={() => handleBulkAction('rejected')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/15 text-red-400 border border-red-500/20 text-[11px] font-medium hover:bg-red-500/25 transition-colors">
                <XCircle className="w-3.5 h-3.5" /> Afkeuren
              </button>
            </div>
          )}

          <button onClick={selectAll}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-200 text-zinc-500 text-[11px] font-medium hover:text-zinc-300 transition-colors">
            <CheckCheck className="w-3.5 h-3.5" /> {selectedIds.size === filteredAssets.length && filteredAssets.length > 0 ? 'Deselecteer' : 'Selecteer alles'}
          </button>
        </div>
      </div>

      {/* Assets Grid */}
      {filteredAssets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Image className="w-10 h-10 text-zinc-700 mb-3" />
          <p className="text-zinc-500 text-sm">Geen assets gevonden</p>
          <p className="text-zinc-600 text-xs mt-1">
            {reviewFilter === 'pending' ? 'Alle assets zijn al gereviewd' : 'Probeer een ander filter'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filteredAssets.map(asset => {
            const isSelected = selectedIds.has(asset.id);
            const previewUrl = getPreviewUrl(asset);
            const isClip = asset.type === 'clip';
            const statusColor = asset.reviewStatus === 'approved' ? 'border-emerald-500/40' :
                               asset.reviewStatus === 'rejected' ? 'border-red-500/40' : 'border-white/[0.06]';

            return (
              <div key={asset.id}
                className={`glass rounded-xl overflow-hidden border-2 transition-all ${statusColor} ${
                  isSelected ? 'ring-2 ring-brand-500/50' : ''
                }`}>
                <div className="relative aspect-video bg-surface-200/60 cursor-pointer" onClick={() => toggleSelect(asset.id)}>
                  {previewUrl ? (
                    <img src={previewUrl} alt={asset.title}
                      className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {isClip ? <Film className="w-8 h-8 text-zinc-700" /> : <Image className="w-8 h-8 text-zinc-700" />}
                    </div>
                  )}
                  <span className={`absolute top-2 left-2 text-[9px] px-1.5 py-0.5 rounded font-bold ${
                    isClip ? 'bg-purple-500/80 text-white' : 'bg-blue-500/80 text-white'
                  }`}>
                    {isClip ? 'CLIP' : 'IMG'}
                  </span>
                  {asset.reviewStatus !== 'pending' && (
                    <span className={`absolute top-2 right-2 text-[9px] px-1.5 py-0.5 rounded font-bold ${
                      asset.reviewStatus === 'approved' ? 'bg-emerald-500/80 text-white' : 'bg-red-500/80 text-white'
                    }`}>
                      {asset.reviewStatus === 'approved' ? '✓' : '✗'}
                    </span>
                  )}
                  <div className={`absolute bottom-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    isSelected ? 'bg-brand-500 border-brand-500' : 'bg-black/40 border-white/30'
                  }`}>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                  </div>
                  {isClip && asset.startTime && (
                    <span className="absolute bottom-2 right-2 text-[9px] bg-black/60 text-white px-1.5 py-0.5 rounded font-mono">
                      {asset.startTime} - {asset.endTime}
                    </span>
                  )}
                </div>

                <div className="p-2.5">
                  <p className="text-xs font-medium text-zinc-300 truncate">{asset.title || 'Untitled'}</p>
                  {asset.description && <p className="text-[10px] text-zinc-600 truncate mt-0.5">{asset.description}</p>}
                  {asset.category && (
                    <span className="text-[9px] text-zinc-700 bg-surface-200/80 px-1.5 py-0.5 rounded mt-1 inline-block">{asset.category}</span>
                  )}
                </div>

                <div className="flex border-t border-white/[0.04]">
                  <button onClick={() => handleReview(asset.id, 'approved', asset.type)} disabled={updating === asset.id}
                    className={`flex-1 flex items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors ${
                      asset.reviewStatus === 'approved' ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-600 hover:text-emerald-400 hover:bg-emerald-500/10'
                    }`}>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </button>
                  <div className="w-px bg-white/[0.04]" />
                  <button onClick={() => handleReview(asset.id, 'rejected', asset.type)} disabled={updating === asset.id}
                    className={`flex-1 flex items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors ${
                      asset.reviewStatus === 'rejected' ? 'bg-red-500/20 text-red-400' : 'text-zinc-600 hover:text-red-400 hover:bg-red-500/10'
                    }`}>
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                  <div className="w-px bg-white/[0.04]" />
                  <button onClick={() => handleReview(asset.id, 'pending', asset.type)} disabled={updating === asset.id}
                    className="flex-1 flex items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.02]">
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
