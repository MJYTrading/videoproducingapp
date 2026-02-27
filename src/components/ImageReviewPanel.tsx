import { useState, useEffect } from "react";
import { CheckCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Project, Step } from "../types";
import { useStore } from "../store";
import { imageOptions } from "../api";

interface ImageReviewPanelProps { project: Project; step: Step; }

export default function ImageReviewPanel({ project, step }: ImageReviewPanelProps) {
  const [scenes, setScenes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsedScenes, setCollapsedScenes] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const selectImage = useStore((s) => s.selectImage);
  const approveStep = useStore((s) => s.approveStep);

  useEffect(() => { loadImageOptions(); }, [project.id]);

  const loadImageOptions = async () => {
    try {
      setLoading(true); setError(null);
      const data = await imageOptions.getOptions(project.id);
      setScenes(data.scenes || []);
      (data.scenes || []).forEach((scene: any) => {
        const sid = String(scene.scene_id);
        const ex = project.selectedImages.find((s) => s.sceneId === sid);
        if (!ex && scene.options && scene.options.length > 0) {
          selectImage(project.id, sid, 1, scene.options[0]?.path, "natural");
        }
      });
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleSelectAll = (n: number) => {
    scenes.forEach((sc) => {
      const sid = String(sc.scene_id);
      const opt = sc.options?.[n - 1];
      if (opt) selectImage(project.id, sid, n, opt.path, undefined);
    });
  };

  const handleApproveAll = async () => {
    setSaving(true);
    try {
      const sels = project.selectedImages.map((s) => ({
        scene_id: parseInt(s.sceneId), chosen_option: s.chosenOption,
        chosen_path: s.chosenPath || "",
      }));
      await imageOptions.saveSelections(project.id, sels);
      approveStep(project.id, step.id);
    } catch (e: any) { setError("Opslaan mislukt: " + e.message); }
    finally { setSaving(false); }
  };

  const toggleScene = (id: number) => {
    setCollapsedScenes((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const selectedCount = project.selectedImages.length;
  const totalCount = scenes.length;

  if (loading) return (<div className="bg-violet-500/10 border-2 border-violet-500/50 rounded-lg p-6 mb-6"><p className="text-violet-300">Image opties laden...</p></div>);
  if (error) return (<div className="bg-red-500/10 border-2 border-red-500/50 rounded-lg p-6 mb-6"><p className="text-red-400">{error}</p><button onClick={loadImageOptions} className="mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm">Opnieuw</button></div>);
  if (scenes.length === 0) return (<div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 mb-6"><p className="text-zinc-400">Geen image opties. Voer eerst stap 13 (Images Genereren) uit.</p></div>);

  return (
    <div className="bg-violet-500/10 border-2 border-violet-500/50 rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xl font-semibold text-violet-400">Image Selectie</h3>
          <p className="text-sm text-violet-300 mt-1">{selectedCount}/{totalCount} scenes</p>
        </div>
        <div className="flex gap-2">
          {[1, 2, 3].map((n) => (<button key={n} onClick={() => handleSelectAll(n)} className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-sm">Alle Optie {n}</button>))}
        </div>
      </div>
      <div className="w-full bg-zinc-800 rounded-full h-2 mb-6">
        <div className="bg-violet-500 h-2 rounded-full transition-all" style={{ width: (totalCount > 0 ? (selectedCount / totalCount) * 100 : 0) + "%" }} />
      </div>
      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
        {scenes.map((scene) => {
          const sceneId = String(scene.scene_id);
          const sel = project.selectedImages.find((s) => s.sceneId === sceneId);
          const selOpt = sel?.chosenOption || 1;
          const selClip = sel?.clipOption || "natural";
          const collapsed = collapsedScenes.has(scene.scene_id);
          return (
            <div key={scene.scene_id} className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
              <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-zinc-800/50" onClick={() => toggleScene(scene.scene_id)}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-zinc-500 font-mono text-sm w-8">#{scene.scene_id}</span>
                  <p className="text-sm text-zinc-300 truncate">{scene.text || scene.visual_prompt}</p>
                  {sel && <span className="text-green-400 text-xs">Optie {selOpt}</span>}
                </div>
                {collapsed ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronUp className="w-4 h-4 text-zinc-500" />}
              </div>
              {!collapsed && (
                <div className="p-3 pt-0 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    {(scene.options || []).map((opt: any) => {
                      const isSel = selOpt === opt.option;
                      const url = imageOptions.getImageUrl(project.id, `scene${scene.scene_id}_option${opt.option}.jpg`);
                      return (
                        <button key={opt.option} onClick={() => selectImage(project.id, sceneId, opt.option, opt.path, undefined)}
                          className={`relative aspect-video rounded-lg border-2 overflow-hidden transition-all ${isSel ? "border-blue-500 shadow-lg shadow-blue-500/20" : "border-zinc-700 hover:border-zinc-500"}`}>
                          <img src={url} alt="Scene option" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                          <div className="absolute bottom-1 left-2 right-2 flex items-center justify-between">
                            <span className="text-xs text-white">{opt.name}</span>
                            {isSel && <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center"><CheckCircle className="w-3 h-3 text-white" /></div>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="sticky bottom-0 mt-4 pt-4 border-t border-violet-500/30 flex items-center justify-between">
        <p className="text-sm text-zinc-400">{selectedCount}/{totalCount} scenes</p>
        <button onClick={handleApproveAll} disabled={selectedCount < totalCount || saving}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors ${selectedCount >= totalCount && !saving ? "bg-green-600 hover:bg-green-700 text-white" : "bg-zinc-700 text-zinc-500 cursor-not-allowed"}`}>
          {saving ? "Opslaan..." : "Bevestig & ga door"}
        </button>
      </div>
    </div>
  );
}
