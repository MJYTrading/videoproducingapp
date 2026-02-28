import { useState, useEffect, useCallback } from 'react';
import { Copy, CheckCircle2, AlertTriangle, Loader2, Sparkles, ThumbsUp, ThumbsDown, ExternalLink, Play, ChevronRight, RotateCcw, Check, X as XIcon, Search, Plus, MessageSquare, ArrowRight, Pencil, RefreshCw } from 'lucide-react';
import { Project } from '../types';
import * as api from '../api';

interface ScriptTabProps { project: Project; onRefresh?: () => void; }
interface ScriptCheckResult { overall_score: number; categories: Record<string, { score: number; feedback: string }>; top_strengths: string[]; top_improvements: string[]; rewrite_suggestions: { original: string; suggested: string; reason: string }[]; }
interface ClipData { index: number; url: string; videoId: string | null; startTime: string; endTime: string; status: 'pending' | 'approved' | 'rejected'; feedback: string; replacement: { url: string; startTime: string; endTime: string; title?: string; reason?: string } | null; searchResults: any[] | null; searching: boolean; showFeedback: boolean; showManualInput: boolean; manualUrl: string; manualStart: string; manualEnd: string; }
interface ParagraphData { index: number; text: string; originalText: string; status: 'approved' | 'rejected' | 'pending' | 'editing'; feedback: string; isEditing: boolean; editText: string; rewriting: boolean; showFeedback: boolean; history: string[]; }
interface ScriptBlock { type: 'narration' | 'clip'; clipIndex?: number; paragraphIndex?: number; }

const CATEGORY_LABELS: Record<string, string> = { hook: 'Hook', pacing: 'Pacing', retention: 'Retentie', structure: 'Structuur', language: 'Taalgebruik', cta: 'CTA', engagement: 'Engagement' };
const QUICK_FEEDBACK = [
  { label: 'Korter', value: 'Maak deze alinea korter en bondiger' },
  { label: 'Dramatischer', value: 'Maak dit dramatischer en impactvoller' },
  { label: 'Meer data', value: 'Voeg meer statistieken of cijfers toe' },
  { label: 'Simpeler', value: 'Maak de taal simpeler en toegankelijker' },
  { label: 'Sterker begin', value: 'Begin met een sterkere opening zin' },
  { label: 'Meer urgentie', value: 'Verhoog het gevoel van urgentie' },
];

function extractVideoId(url: string): string | null { if (!url) return null; const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/); return m ? m[1] : null; }
function timeToSeconds(t: string): number { const p = t.split(':').map(Number); return p.length === 3 ? p[0]*3600+p[1]*60+p[2] : p.length === 2 ? p[0]*60+p[1] : p[0]||0; }

function parseScriptToBlocks(scriptText: string) {
  const clipRegex = /\[CLIP:\s*(https?:\/\/[^\s\]]+)\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*\]/g;
  const blocks: ScriptBlock[] = []; const clips: ClipData[] = []; const paragraphs: ParagraphData[] = [];
  let lastIndex = 0, clipIdx = 0, paraIdx = 0, match;
  while ((match = clipRegex.exec(scriptText)) !== null) {
    const nar = scriptText.slice(lastIndex, match.index).trim();
    if (nar) { paragraphs.push({ index: paraIdx, text: nar, originalText: nar, status: 'approved', feedback: '', isEditing: false, editText: nar, rewriting: false, showFeedback: false, history: [] }); blocks.push({ type: 'narration', paragraphIndex: paraIdx++ }); }
    clips.push({ index: clipIdx, url: match[1], videoId: extractVideoId(match[1]), startTime: match[2], endTime: match[3], status: 'approved', feedback: '', replacement: null, searchResults: null, searching: false, showFeedback: false, showManualInput: false, manualUrl: '', manualStart: '', manualEnd: '' });
    blocks.push({ type: 'clip', clipIndex: clipIdx++ }); lastIndex = match.index + match[0].length;
  }
  const rem = scriptText.slice(lastIndex).trim();
  if (rem) { paragraphs.push({ index: paraIdx, text: rem, originalText: rem, status: 'approved', feedback: '', isEditing: false, editText: rem, rewriting: false, showFeedback: false, history: [] }); blocks.push({ type: 'narration', paragraphIndex: paraIdx }); }
  return { blocks, clips, paragraphs };
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  const color = score >= 8 ? 'bg-emerald-500' : score >= 6 ? 'bg-amber-500' : 'bg-red-500';
  const tc = score >= 8 ? '#10b981' : score >= 6 ? '#f59e0b' : '#ef4444';
  return (<div className="flex items-center gap-3"><span className="text-[11px] text-zinc-400 w-20 shrink-0">{label}</span><div className="flex-1 h-2 bg-surface-200/60 rounded-full overflow-hidden"><div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score*10}%` }} /></div><span className="text-[11px] font-mono font-bold w-6 text-right" style={{ color: tc }}>{score}</span></div>);
}

function ParagraphCard({ para, onUpdate, onRewrite }: { para: ParagraphData; onUpdate: (u: Partial<ParagraphData>) => void; onRewrite: (f: string) => void; }) {
  const wc = para.text.split(/\s+/).filter(Boolean).length;
  const border = { approved: 'border-l-emerald-500/40', rejected: 'border-l-red-500/40', pending: 'border-l-amber-500/40', editing: 'border-l-blue-500/40' };
  return (
    <div className={`group relative rounded-lg border-l-2 ${border[para.status]} transition-all my-2`}>
      <div className="absolute -top-3 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        {!para.isEditing && (<>
          <button onClick={() => onUpdate({ isEditing: true, editText: para.text, status: 'editing' })} title="Bewerken" className="p-1 rounded bg-surface-100 border border-white/[0.08] text-zinc-400 hover:text-blue-400"><Pencil className="w-3 h-3" /></button>
          <button onClick={() => onUpdate({ status: 'approved', showFeedback: false })} title="Goedkeuren" className={`p-1 rounded border ${para.status === 'approved' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-surface-100 border-white/[0.08] text-zinc-400 hover:text-emerald-400'}`}><ThumbsUp className="w-3 h-3" /></button>
          <button onClick={() => onUpdate({ status: 'rejected', showFeedback: true })} title="Herschrijven" className={`p-1 rounded border ${para.status === 'rejected' ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-surface-100 border-white/[0.08] text-zinc-400 hover:text-red-400'}`}><ThumbsDown className="w-3 h-3" /></button>
          {para.history.length > 0 && <button onClick={() => { const prev = para.history[para.history.length-1]; onUpdate({ text: prev, editText: prev, history: para.history.slice(0,-1) }); }} title="Ongedaan maken" className="p-1 rounded bg-surface-100 border border-white/[0.08] text-zinc-400 hover:text-amber-400"><RotateCcw className="w-3 h-3" /></button>}
        </>)}
      </div>
      <div className="pl-4 pr-2 py-2">
        {para.isEditing ? (
          <div>
            <textarea value={para.editText} onChange={e => onUpdate({ editText: e.target.value })} className="w-full bg-surface-200/50 border border-white/[0.08] rounded-lg p-3 text-sm text-zinc-300 leading-relaxed resize-y min-h-[100px] focus:border-blue-500/40 focus:outline-none" rows={Math.max(3, para.editText.split('\n').length)} />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-zinc-600">{para.editText.split(/\s+/).filter(Boolean).length} woorden</span>
              <div className="flex gap-1.5">
                <button onClick={() => onUpdate({ isEditing: false, editText: para.text, status: 'approved' })} className="btn-secondary text-[11px] py-1 px-2.5 gap-1"><XIcon className="w-3 h-3" /> Annuleer</button>
                <button onClick={() => { if (para.editText.trim() !== para.text) { onUpdate({ history: [...para.history, para.text], text: para.editText.trim(), isEditing: false, status: 'approved' }); } else { onUpdate({ isEditing: false, status: 'approved' }); } }} className="btn-primary text-[11px] py-1 px-2.5 gap-1"><Check className="w-3 h-3" /> Opslaan</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-zinc-300 leading-relaxed whitespace-pre-line text-sm">
            {para.text}
            {para.text !== para.originalText && <span className="text-[9px] text-blue-400/50 ml-2">(bewerkt)</span>}
          </div>
        )}
        <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"><span className="text-[9px] text-zinc-700">{wc} woorden</span></div>
        {para.showFeedback && para.status === 'rejected' && !para.isEditing && (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {QUICK_FEEDBACK.map(qf => (<button key={qf.label} onClick={() => { onUpdate({ feedback: qf.value }); onRewrite(qf.value); }} disabled={para.rewriting} className="text-[10px] px-2 py-1 rounded-md bg-surface-200 text-zinc-400 border border-white/[0.04] hover:border-brand-500/30 hover:text-brand-300 transition-colors disabled:opacity-40">{qf.label}</button>))}
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1"><MessageSquare className="absolute left-2 top-2 w-3.5 h-3.5 text-zinc-600" /><input type="text" value={para.feedback} onChange={e => onUpdate({ feedback: e.target.value })} onKeyDown={e => { if (e.key === 'Enter' && para.feedback) onRewrite(para.feedback); }} placeholder="Aangepaste instructie..." className="input-base pl-8 w-full text-xs" disabled={para.rewriting} /></div>
              <button onClick={() => onRewrite(para.feedback)} disabled={para.rewriting || !para.feedback} className="btn-primary text-[11px] py-1.5 gap-1.5 disabled:opacity-40">{para.rewriting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}{para.rewriting ? 'Herschrijven...' : 'Herschrijf'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ClipCard({ clip, onUpdate, onSearchReplacement }: { clip: ClipData; onUpdate: (u: Partial<ClipData>) => void; onSearchReplacement: () => void; }) {
  const ac = clip.replacement || { url: clip.url, startTime: clip.startTime, endTime: clip.endTime };
  const vid = extractVideoId(ac.url); const thumb = vid ? `https://img.youtube.com/vi/${vid}/mqdefault.jpg` : null;
  const ytUrl = vid ? `https://www.youtube.com/watch?v=${vid}&t=${timeToSeconds(ac.startTime)}` : ac.url;
  const dur = timeToSeconds(ac.endTime) - timeToSeconds(ac.startTime);
  const st = { approved: 'border-emerald-500/30 bg-emerald-500/[0.05]', rejected: clip.replacement ? 'border-blue-500/30 bg-blue-500/[0.05]' : 'border-red-500/30 bg-red-500/[0.05]', pending: 'border-amber-500/30 bg-amber-500/[0.05]' };
  return (
    <div className={`rounded-xl border transition-all my-3 ${st[clip.status]}`}>
      <div className="flex gap-0">
        <a href={ytUrl} target="_blank" rel="noopener noreferrer" className="w-48 shrink-0 relative group block">
          {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover rounded-l-xl min-h-[90px]" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <div className="w-full h-full min-h-[90px] bg-surface-200 rounded-l-xl flex items-center justify-center"><Play className="w-6 h-6 text-zinc-600" /></div>}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-l-xl"><ExternalLink className="w-5 h-5 text-white" /></div>
          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 rounded text-[10px] text-white font-mono">{ac.startTime} - {ac.endTime}</div>
        </a>
        <div className="flex-1 p-3 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono text-zinc-500">Clip {clip.index+1}</span>
                {clip.replacement && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20">Vervangen</span>}
                <span className="text-[10px] text-zinc-600">{dur}s</span>
              </div>
              <p className="text-xs text-zinc-400 truncate">{ac.url}</p>
              {clip.replacement?.reason && <p className="text-[10px] text-blue-400/70 mt-1 line-clamp-1">{clip.replacement.reason}</p>}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {clip.replacement && <button onClick={() => onUpdate({ replacement: null, status: 'approved', searchResults: null })} className="p-1.5 rounded-lg bg-surface-200 text-zinc-500 hover:text-amber-400"><RotateCcw className="w-3.5 h-3.5" /></button>}
              <button onClick={() => onUpdate({ status: 'approved', showFeedback: false, feedback: '' })} className={`p-1.5 rounded-lg transition-all ${clip.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30' : 'bg-surface-200 text-zinc-500 hover:text-emerald-400'}`}><ThumbsUp className="w-3.5 h-3.5" /></button>
              <button onClick={() => onUpdate({ status: 'rejected', showFeedback: true })} className={`p-1.5 rounded-lg transition-all ${clip.status === 'rejected' && !clip.replacement ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/30' : 'bg-surface-200 text-zinc-500 hover:text-red-400'}`}><ThumbsDown className="w-3.5 h-3.5" /></button>
            </div>
          </div>
          {clip.showFeedback && clip.status === 'rejected' && !clip.replacement && (
            <div className="mt-2 space-y-2">
              <textarea value={clip.feedback} onChange={e => onUpdate({ feedback: e.target.value })} placeholder="Waarom is deze clip niet goed?" className="input-base w-full text-xs resize-none" rows={2} />
              <div className="flex gap-2">
                <button onClick={onSearchReplacement} disabled={clip.searching || !clip.feedback} className="btn-primary text-[11px] py-1.5 gap-1.5 disabled:opacity-40">{clip.searching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}{clip.searching ? 'Zoeken...' : 'Zoek vervanging'}</button>
                <button onClick={() => onUpdate({ showManualInput: !clip.showManualInput })} className="btn-secondary text-[11px] py-1.5 gap-1.5"><Plus className="w-3 h-3" /> Handmatig</button>
              </div>
            </div>
          )}
          {clip.showManualInput && (
            <div className="mt-2 p-2.5 rounded-lg bg-surface-200/50 border border-white/[0.04] space-y-2">
              <input type="text" value={clip.manualUrl} onChange={e => onUpdate({ manualUrl: e.target.value })} placeholder="YouTube URL" className="input-base w-full text-xs" />
              <div className="flex gap-2">
                <input type="text" value={clip.manualStart} onChange={e => onUpdate({ manualStart: e.target.value })} placeholder="Start (MM:SS)" className="input-base flex-1 text-xs" />
                <input type="text" value={clip.manualEnd} onChange={e => onUpdate({ manualEnd: e.target.value })} placeholder="Eind (MM:SS)" className="input-base flex-1 text-xs" />
                <button onClick={() => { if (clip.manualUrl && clip.manualStart && clip.manualEnd) onUpdate({ replacement: { url: clip.manualUrl, startTime: clip.manualStart, endTime: clip.manualEnd }, status: 'approved', showManualInput: false }); }} disabled={!clip.manualUrl || !clip.manualStart || !clip.manualEnd} className="btn-primary text-[11px] py-1.5 gap-1 disabled:opacity-40"><Check className="w-3 h-3" /> Gebruik</button>
              </div>
            </div>
          )}
          {clip.searchResults && clip.searchResults.length > 0 && (
            <div className="mt-2 space-y-1.5">
              <p className="text-[10px] text-zinc-500 font-medium">Gevonden alternatieven:</p>
              {clip.searchResults.map((r: any, i: number) => { const rv = extractVideoId(r.url); const rt = rv ? `https://img.youtube.com/vi/${rv}/default.jpg` : null; return (
                <div key={i} className="flex items-center gap-2.5 p-2 rounded-lg bg-surface-200/40 border border-white/[0.04] hover:bg-surface-200/60 cursor-pointer group/r" onClick={() => onUpdate({ replacement: { url: r.url, startTime: r.startTime, endTime: r.endTime, title: r.title, reason: r.reason }, status: 'approved', searchResults: null })}>
                  {rt && <img src={rt} alt="" className="w-16 h-10 rounded object-cover shrink-0" />}
                  <div className="min-w-0 flex-1"><p className="text-[11px] font-medium truncate">{r.title || r.url}</p><p className="text-[10px] text-zinc-600">{r.startTime} - {r.endTime}{r.channel ? ` · ${r.channel}` : ''}</p>{r.reason && <p className="text-[10px] text-zinc-500 line-clamp-1 mt-0.5">{r.reason}</p>}</div>
                  <ArrowRight className="w-3.5 h-3.5 text-brand-400 opacity-0 group-hover/r:opacity-100 shrink-0" />
                </div>); })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ScriptTab({ project, onRefresh }: ScriptTabProps) {
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<ScriptCheckResult | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [clips, setClips] = useState<ClipData[]>([]);
  const [paragraphs, setParagraphs] = useState<ParagraphData[]>([]);
  const [blocks, setBlocks] = useState<ScriptBlock[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const scriptStep = project.steps.find((s: any) => s.id === 7);
  const isScriptReady = scriptStep?.status === 'completed' || scriptStep?.status === 'review';
  const isReviewMode = scriptStep?.status === 'review';

  let scriptText = '';
  if (scriptStep?.result) { try { const p = typeof scriptStep.result === 'string' ? JSON.parse(scriptStep.result) : scriptStep.result; scriptText = p?.script || p?.text || (typeof p === 'string' ? p : ''); } catch { scriptText = typeof scriptStep.result === 'string' ? scriptStep.result : ''; } }

  useEffect(() => { if (scriptText) { const { blocks: b, clips: c, paragraphs: p } = parseScriptToBlocks(scriptText); setBlocks(b); setClips(c); setParagraphs(p); } }, [scriptText]);

  const totalWords = paragraphs.reduce((s, p) => s + p.text.split(/\s+/).filter(Boolean).length, 0);
  const totalClipDur = clips.reduce((s, c) => { const a = c.replacement || c; return s + timeToSeconds(a.endTime) - timeToSeconds(a.startTime); }, 0);
  const narMin = Math.round(totalWords / 150 * 10) / 10;
  const totalMin = Math.round((narMin + totalClipDur / 60) * 10) / 10;
  const approvedClips = clips.filter(c => c.status === 'approved').length;
  const rejectedClips = clips.filter(c => c.status === 'rejected' && !c.replacement).length;
  const approvedParas = paragraphs.filter(p => p.status === 'approved').length;
  const editedParas = paragraphs.filter(p => p.text !== p.originalText).length;

  const updateClip = useCallback((i: number, u: Partial<ClipData>) => { setClips(p => p.map(c => c.index === i ? { ...c, ...u } : c)); setSaved(false); }, []);
  const updateParagraph = useCallback((i: number, u: Partial<ParagraphData>) => { setParagraphs(p => p.map(x => x.index === i ? { ...x, ...u } : x)); setSaved(false); }, []);

  const searchReplacement = useCallback(async (ci: number) => {
    const c = clips[ci]; if (!c?.feedback) return;
    updateClip(ci, { searching: true, searchResults: null });
    const bi = blocks.findIndex(b => b.type === 'clip' && b.clipIndex === ci);
    let ctx = '';
    if (bi > 0) { const pb = blocks[bi-1]; if (pb.type === 'narration' && pb.paragraphIndex !== undefined) ctx += paragraphs[pb.paragraphIndex]?.text?.slice(-500) || ''; }
    if (bi < blocks.length-1) { const nb = blocks[bi+1]; if (nb.type === 'narration' && nb.paragraphIndex !== undefined) ctx += '\n' + (paragraphs[nb.paragraphIndex]?.text?.slice(0,500) || ''); }
    try { const res = await (api as any).clipSearch.search(project.id, { clipUrl: c.url, startTime: c.startTime, endTime: c.endTime, feedback: c.feedback, scriptContext: ctx, language: project.language }); updateClip(ci, { searching: false, searchResults: res.clips || [] }); } catch { updateClip(ci, { searching: false, searchResults: [] }); }
  }, [clips, blocks, paragraphs, project.id, project.language, updateClip]);

  const rewriteParagraph = useCallback(async (pi: number, feedback: string) => {
    const para = paragraphs[pi]; if (!para) return;
    updateParagraph(pi, { rewriting: true });
    let ctx = ''; const idx = paragraphs.findIndex(p => p.index === pi);
    if (idx > 0) ctx += paragraphs[idx-1].text.slice(-300) + '\n\n';
    if (idx < paragraphs.length-1) ctx += '\n\n' + paragraphs[idx+1].text.slice(0,300);
    try { const res = await (api as any).scriptRewrite.rewrite(project.id, { paragraph: para.text, feedback, context: ctx, language: project.language }); updateParagraph(pi, { rewriting: false, history: [...para.history, para.text], text: res.rewritten, editText: res.rewritten, status: 'approved', showFeedback: false, feedback: '' }); } catch { updateParagraph(pi, { rewriting: false }); }
  }, [paragraphs, project.id, project.language, updateParagraph]);

  const handleSaveReview = async () => {
    setSaving(true);
    try {
      await (api as any).clipReview.save(project.id, {
        clips: clips.map(c => ({ index: c.index, url: c.url, startTime: c.startTime, endTime: c.endTime, status: c.status, feedback: c.feedback, replacement: c.replacement })),
        paragraphs: paragraphs.map(p => ({ index: p.index, text: p.text, originalText: p.originalText, status: p.status, wasEdited: p.text !== p.originalText })),
      });
      setSaved(true); if (onRefresh) onRefresh();
    } catch (e: any) { console.error(e); }
    setSaving(false);
  };

  const handleCheck = async () => { setChecking(true); setCheckError(null); try { setCheckResult(await (api as any).scriptChecker.check(project.id)); } catch (e: any) { setCheckError(e.message); } setChecking(false); };
  const handleCopy = () => { const full = blocks.map(b => { if (b.type === 'narration' && b.paragraphIndex !== undefined) return paragraphs[b.paragraphIndex]?.text || ''; if (b.type === 'clip' && b.clipIndex !== undefined) { const c = clips[b.clipIndex]; const a = c?.replacement || c; return `[CLIP: ${a.url} ${a.startTime} - ${a.endTime}]`; } return ''; }).join('\n\n'); navigator.clipboard.writeText(full); };
  const handleApproveAll = () => { setClips(p => p.map(c => ({ ...c, status: 'approved' as const, showFeedback: false }))); setParagraphs(p => p.map(x => ({ ...x, status: 'approved' as const, showFeedback: false }))); setSaved(false); };

  if (!isScriptReady || !scriptText) return (<div className="flex items-center justify-center min-h-[400px]"><div className="text-center"><p className="text-zinc-500 text-lg">Script is nog niet gegenereerd</p><p className="text-zinc-600 text-sm mt-2">Wacht tot het script is geschreven</p></div></div>);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-wrap gap-2">
          <span className="px-2.5 py-1 bg-blue-600 text-white text-xs font-medium rounded">{totalWords.toLocaleString()} woorden</span>
          <span className="px-2.5 py-1 bg-purple-600 text-white text-xs font-medium rounded">~{narMin} min narration</span>
          <span className="px-2.5 py-1 bg-cyan-700 text-white text-xs font-medium rounded">{clips.length} clips ({Math.round(totalClipDur)}s)</span>
          <span className="px-2.5 py-1 bg-emerald-700 text-white text-xs font-bold rounded">~{totalMin} min totaal</span>
          <span className="px-2.5 py-1 bg-zinc-700 text-white text-xs font-medium rounded">{project.language}</span>
          {editedParas > 0 && <span className="px-2.5 py-1 bg-blue-700 text-white text-xs font-medium rounded">{editedParas} bewerkt</span>}
          {checkResult && <span className={`px-2.5 py-1 text-white text-xs font-bold rounded ${checkResult.overall_score >= 8 ? 'bg-emerald-600' : checkResult.overall_score >= 6 ? 'bg-amber-600' : 'bg-red-600'}`}>Score: {checkResult.overall_score}/10</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={handleCheck} disabled={checking} className="flex items-center gap-2 px-3 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 rounded-lg text-xs font-medium">{checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}{checking ? 'Checken...' : 'AI Check'}</button>
          <button onClick={handleCopy} className="flex items-center gap-2 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-xs font-medium"><Copy className="w-3.5 h-3.5" /> Kopieer</button>
        </div>
      </div>

      {isReviewMode && (
        <div className="mb-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3"><AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" /><div><p className="text-sm font-medium text-amber-300">Script Review</p><p className="text-xs text-amber-400/70 mt-0.5">Hover over alinea's om te bewerken of herschrijven. {approvedClips}/{clips.length} clips goedgekeurd.</p></div></div>
            <div className="flex gap-2">
              <button onClick={handleApproveAll} className="btn-secondary text-xs gap-1.5"><CheckCircle2 className="w-3 h-3" /> Alles goedkeuren</button>
              <button onClick={handleSaveReview} disabled={saving || rejectedClips > 0} className="btn-primary text-xs gap-1.5 disabled:opacity-40" title={rejectedClips > 0 ? 'Zoek eerst vervangingen voor afgekeurde clips' : ''}>{saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-3 h-3" />}{saving ? 'Opslaan...' : saved ? 'Opgeslagen!' : 'Goedkeuren & Doorgaan'}</button>
            </div>
          </div>
        </div>
      )}

      {!isReviewMode && !saved && (editedParas > 0 || clips.some(c => c.replacement)) && (
        <div className="mb-4 p-3 rounded-xl bg-surface-100 border border-white/[0.06] flex items-center justify-between">
          <p className="text-xs text-zinc-500">{editedParas} alinea's bewerkt · {clips.filter(c => c.replacement).length} clips vervangen</p>
          <button onClick={handleSaveReview} disabled={saving} className="btn-primary text-xs gap-1.5">{saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Wijzigingen opslaan</button>
        </div>
      )}

      {checkError && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {checkError}</div>}

      {checkResult && (
        <div className="mb-6 glass rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-3"><CheckCircle2 className="w-5 h-5 text-brand-400" /><h3 className="text-sm font-semibold">AI Script Analyse</h3></div>
          <div className="space-y-2">{Object.entries(checkResult.categories || {}).map(([k, c]) => (<div key={k}><ScoreBar score={c.score} label={CATEGORY_LABELS[k] || k} />{c.feedback && <p className="text-[10px] text-zinc-600 ml-[92px] mt-0.5">{c.feedback}</p>}</div>))}</div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            {checkResult.top_strengths?.length > 0 && <div><p className="text-[11px] text-emerald-400 font-medium mb-2">Sterktes</p>{checkResult.top_strengths.map((s,i) => <p key={i} className="text-xs text-zinc-400 mb-1">{s}</p>)}</div>}
            {checkResult.top_improvements?.length > 0 && <div><p className="text-[11px] text-amber-400 font-medium mb-2">Verbeterpunten</p>{checkResult.top_improvements.map((s,i) => <p key={i} className="text-xs text-zinc-400 mb-1">{s}</p>)}</div>}
          </div>
        </div>
      )}

      <div className="bg-zinc-800 rounded-lg border border-zinc-700 overflow-hidden">
        <div className="p-4">
          {blocks.map((block, i) => {
            if (block.type === 'narration' && block.paragraphIndex !== undefined) { const p = paragraphs[block.paragraphIndex]; if (!p) return null; return <ParagraphCard key={`p-${p.index}`} para={p} onUpdate={u => updateParagraph(p.index, u)} onRewrite={f => rewriteParagraph(p.index, f)} />; }
            if (block.type === 'clip' && block.clipIndex !== undefined) { const c = clips[block.clipIndex]; if (!c) return null; return <ClipCard key={`c-${c.index}`} clip={c} onUpdate={u => updateClip(c.index, u)} onSearchReplacement={() => searchReplacement(c.index)} />; }
            return null;
          })}
        </div>
      </div>

      {isReviewMode && (
        <div className="mt-4 p-4 rounded-xl glass flex items-center justify-between">
          <div className="text-xs text-zinc-500"><span className="text-emerald-400 font-medium">{approvedParas}</span>/{paragraphs.length} alinea's · <span className="text-emerald-400 font-medium">{approvedClips}</span>/{clips.length} clips · <span className="text-blue-400 font-medium">{editedParas}</span> bewerkt · ~{totalMin} min totaal</div>
          <button onClick={handleSaveReview} disabled={saving || rejectedClips > 0} className="btn-primary gap-1.5 disabled:opacity-40">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}{saving ? 'Opslaan...' : saved ? 'Opgeslagen!' : 'Goedkeuren & Doorgaan'}</button>
        </div>
      )}
    </div>
  );
}
