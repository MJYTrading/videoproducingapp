import { useState, useEffect, createContext, useContext } from 'react';
import {
  Lightbulb, Sparkles, ArrowRight, Trash2, Save, Zap, Brain,
  BarChart3, TrendingUp, Users, DollarSign, Eye, ThumbsUp,
  Video, Clock, ChevronDown, ChevronUp, ExternalLink,
  Loader2, CheckCircle2, AlertCircle, Download, RefreshCw,
  Search, MessageSquare, FileText, X, Bookmark,
  Globe, Target, Play, Plus, UserPlus,
} from 'lucide-react';
import { ideation, channels as channelsApi } from '../api';

// ── Helpers ──
function fmtNum(n: any): string {
  if (!n && n !== 0) return '—';
  // Strip "views", "subscribers", commas, etc from formatted strings
  const cleaned = String(n).replace(/,/g, '').replace(/\s*(views|subscribers|videos)\s*/gi, '').trim();
  const num = parseInt(cleaned);
  if (isNaN(num)) return String(n);
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toLocaleString();
}
function safeParse(s: any) { try { return JSON.parse(s || '{}'); } catch { return {}; } }
function extractVideoId(input: string): string {
  if (!input) return '';
  const m = input.match(/(?:v=|youtu\.be\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : input.trim();
}
function timeAgo(iso: string): string {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${mins}m geleden`;
  if (mins < 1440) return `${Math.round(mins / 60)}u geleden`;
  return `${Math.round(mins / 1440)}d geleden`;
}

// ── Research Context ──
type ResearchItem = { id: string; label: string; type: string; summary: string };
type ResearchCtx = { items: ResearchItem[]; add: (item: Omit<ResearchItem, 'id'>) => void; remove: (id: string) => void; clear: () => void; toText: () => string };
const ResearchContext = createContext<ResearchCtx>({ items: [], add: () => {}, remove: () => {}, clear: () => {}, toText: () => '' });
function useResearch() { return useContext(ResearchContext); }

// ── Tabs ──
type TabId = 'brainstorm' | 'analysis' | 'outliers' | 'competitors' | 'deepdive';
const TABS: { id: TabId; label: string; icon: any }[] = [
  { id: 'brainstorm', label: 'Brainstorm', icon: Sparkles },
  { id: 'analysis', label: 'Kanaal Analyse', icon: BarChart3 },
  { id: 'outliers', label: 'Outlier Research', icon: TrendingUp },
  { id: 'competitors', label: 'Concurrenten', icon: Target },
  { id: 'deepdive', label: 'Video Deep Dive', icon: Search },
];

// ══════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════

export default function IdeationPage() {
  const [activeTab, setActiveTab] = useState<TabId>('brainstorm');
  const [channels, setChannels] = useState<any[]>([]);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [loading, setLoading] = useState(true);
  const [researchItems, setResearchItems] = useState<ResearchItem[]>([]);

  useEffect(() => {
    channelsApi.getAll().then(data => {
      setChannels(data);
      if (data.length > 0) setSelectedChannel(data[0].id);
    }).finally(() => setLoading(false));
  }, []);

  const research: ResearchCtx = {
    items: researchItems,
    add: (item) => setResearchItems(p => [...p, { ...item, id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }]),
    remove: (id) => setResearchItems(p => p.filter(i => i.id !== id)),
    clear: () => setResearchItems([]),
    toText: () => researchItems.map(i => `[${i.type}] ${i.label}:\n${i.summary}`).join('\n\n---\n\n'),
  };

  return (
    <ResearchContext.Provider value={research}>
      <div className="p-8 max-w-7xl mx-auto animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border border-yellow-500/20 flex items-center justify-center">
              <Lightbulb className="w-5 h-5 text-yellow-400" />
            </div>
            Ideation
          </h1>
          <p className="text-zinc-500 mt-1 ml-[52px]">Research, brainstorm en ontdek virale video-ideeën</p>
        </div>

        <div className="glass rounded-2xl p-4 mb-6">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="text-sm font-medium text-zinc-400 whitespace-nowrap">Kanaal:</label>
            <select value={selectedChannel} onChange={e => setSelectedChannel(e.target.value)} className="input-base max-w-xs">
              <option value="">Selecteer kanaal...</option>
              {channels.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
            </select>
            {researchItems.length > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <Bookmark className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-amber-400 font-medium">{researchItems.length} research items</span>
                <button onClick={research.clear} className="text-xs text-zinc-600 hover:text-red-400 transition-colors">Wis</button>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-1 mb-6 bg-surface-100/40 backdrop-blur-sm rounded-xl p-1 border border-white/[0.04] overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id ? 'bg-brand-600/20 text-brand-300 border border-brand-500/20' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
                }`}><Icon className="w-4 h-4" />{tab.label}</button>
            );
          })}
        </div>

        {!selectedChannel ? (
          <EmptyState icon={AlertCircle} text="Selecteer eerst een kanaal" />
        ) : (
          <>
            {activeTab === 'brainstorm' && <BrainstormTab channelId={selectedChannel} />}
            {activeTab === 'analysis' && <ChannelAnalysisTab channelId={selectedChannel} />}
            {activeTab === 'outliers' && <OutlierResearchTab channelId={selectedChannel} />}
            {activeTab === 'competitors' && <CompetitorsTab channelId={selectedChannel} />}
            {activeTab === 'deepdive' && <VideoDeepDiveTab />}
          </>
        )}
      </div>
    </ResearchContext.Provider>
  );
}

// ══════════════════════════════════════════════════
// TAB 1: BRAINSTORM
// ══════════════════════════════════════════════════

function BrainstormTab({ channelId }: { channelId: string }) {
  const research = useResearch();
  const [ideas, setIdeas] = useState<any[]>([]);
  const [savedIdeas, setSavedIdeas] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState<'quick' | 'deep'>('quick');
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  useEffect(() => { loadSaved(); }, [channelId]);
  const loadSaved = async () => { try { setSavedIdeas(await ideation.getIdeas(channelId)); } catch {} };

  const generate = async () => {
    setGenerating(true); setIdeas([]);
    try {
      const r = await ideation.brainstorm({ channelId, topic: topic || undefined, mode, researchContext: research.items.length > 0 ? research.toText() : undefined });
      setIdeas(r.ideas || []);
    } catch (e: any) { alert(e.message); }
    finally { setGenerating(false); }
  };

  const save = async (idea: any) => {
    setSavingIds(p => new Set(p).add(idea.tempId));
    try { await ideation.saveIdea({ channelId, ...idea, source: 'ai' }); loadSaved(); } catch (e: any) { alert(e.message); }
    finally { setSavingIds(p => { const n = new Set(p); n.delete(idea.tempId); return n; }); }
  };
  const del = async (id: string) => { if (confirm('Verwijderen?')) { await ideation.deleteIdea(id); loadSaved(); } };
  const convert = async (id: string) => { try { const r = await ideation.convertToProject(id); if (r.projectId) window.location.href = `/project/${r.projectId}`; } catch (e: any) { alert(e.message); } };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {research.items.length > 0 && <ResearchContextBadges />}

      <div className="glass rounded-2xl p-6">
        <h2 className="section-title mb-4"><Brain className="w-5 h-5 text-brand-400" /> AI Brainstorm</h2>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3">
          <input type="text" value={topic} onChange={e => setTopic(e.target.value)} placeholder="Optioneel: specifiek topic..." className="input-base" onKeyDown={e => e.key === 'Enter' && generate()} />
          <div className="flex gap-1 bg-surface-200/60 rounded-xl p-1 border border-white/[0.04]">
            <button onClick={() => setMode('quick')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${mode === 'quick' ? 'bg-brand-600/20 text-brand-300 border border-brand-500/20' : 'text-zinc-500'}`}><Zap className="w-3.5 h-3.5" />Quick</button>
            <button onClick={() => setMode('deep')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${mode === 'deep' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/20' : 'text-zinc-500'}`}><Brain className="w-3.5 h-3.5" />Deep</button>
          </div>
          <button onClick={generate} disabled={generating} className="btn-primary whitespace-nowrap">
            {generating ? <><Loader2 className="w-4 h-4 animate-spin" />Genereren...</> : <><Sparkles className="w-4 h-4" />Brainstorm</>}
          </button>
        </div>
        <p className="text-[10px] text-zinc-600 mt-2">Quick gebruikt cached data (0 credits als al opgehaald). Deep haalt ook analytics op.</p>
      </div>

      {generating && <LoadingBox text="AI analyseert en genereert ideeën..." />}
      {ideas.length > 0 && <div><SectionHeader text={`Nieuwe ideeën (${ideas.length})`} /><div className="grid gap-3">{ideas.map(idea => <IdeaCard key={idea.tempId} idea={idea} onSave={() => save(idea)} saving={savingIds.has(idea.tempId)} isNew />)}</div></div>}
      <div><SectionHeader text={`Opgeslagen (${savedIdeas.length})`} />
        {savedIdeas.length === 0 ? <EmptyState icon={Lightbulb} text="Nog geen opgeslagen ideeën" small /> : (
          <div className="grid gap-3">{savedIdeas.map(idea => {
            const sd = safeParse(idea.sourceData);
            return <IdeaCard key={idea.id} idea={{ ...idea, angle: sd.angle, confidence: sd.confidence, reasoning: sd.reasoning }} onDelete={() => del(idea.id)} onConvert={idea.status !== 'converted' ? () => convert(idea.id) : undefined} isSaved />;
          })}</div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// TAB 2: KANAAL ANALYSE (cached)
// ══════════════════════════════════════════════════

function ChannelAnalysisTab({ channelId }: { channelId: string }) {
  return (
    <div className="space-y-4 animate-fade-in-up">
      <p className="text-xs text-zinc-600">Data wordt opgeslagen. Ophalen = gratis als al gecached. Refresh = 1 credit.</p>
      <CachedSection channelId={channelId} endpoint="about" title="Kanaal Info" icon={Users} color="brand" render={AboutRender} />
      <CachedSection channelId={channelId} endpoint="videos" title="Recente Video's" icon={Video} color="blue" render={VideosRender} />
      <CachedSection channelId={channelId} endpoint="outliers" title="Outlier Video's" icon={TrendingUp} color="yellow" render={OutliersRender} />
      <CachedSection channelId={channelId} endpoint="analytics" title="Analytics" icon={BarChart3} color="emerald" render={RawRender} />
      <CachedSection channelId={channelId} endpoint="demographics" title="Demografie & Inkomsten" icon={DollarSign} color="purple" render={RawRender} />
      <CachedSection channelId={channelId} endpoint="short-vs-long" title="Short vs Long Views" icon={Clock} color="cyan" render={RawRender} />
      <CachedSection channelId={channelId} endpoint="similar-channels" title="Vergelijkbare Kanalen" icon={Users} color="orange" render={SimilarChannelsRender} />
      <CachedSection channelId={channelId} endpoint="niche" title="Niche Analyse" icon={Globe} color="pink" render={RawRender} />
    </div>
  );
}

// ══════════════════════════════════════════════════
// TAB 3: OUTLIER RESEARCH
// ══════════════════════════════════════════════════

function OutlierResearchTab({ channelId }: { channelId: string }) {
  return (
    <div className="space-y-6 animate-fade-in-up">
      <CachedSection channelId={channelId} endpoint="outliers" title="Jouw Outlier Video's" icon={TrendingUp} color="yellow" render={OutliersRender} />
      <SimilarVideosSearch />
    </div>
  );
}

function SimilarVideosSearch() {
  const [videoId, setVideoId] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const vid = extractVideoId(videoId);
    if (!vid) return;
    setLoading(true); setError(''); setData(null);
    try { setData((await ideation.nexlevPost('similar-videos', { videoId: vid })).data); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="section-title mb-4"><Video className="w-5 h-5 text-blue-400" /> Vergelijkbare Video's Zoeken</h3>
      <div className="flex gap-3 mb-4">
        <input type="text" value={videoId} onChange={e => setVideoId(e.target.value)} placeholder="YouTube video URL of ID" className="input-base" onKeyDown={e => e.key === 'Enter' && load()} />
        <button onClick={load} disabled={loading} className="btn-secondary whitespace-nowrap">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Zoeken (1 cr)</button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {data && <><SimilarVideosRender data={data} /><AddResearchBtn label={`Similar videos: ${extractVideoId(videoId)}`} type="similar_videos" data={data} /></>}
    </div>
  );
}

// ══════════════════════════════════════════════════
// TAB 4: CONCURRENTEN
// ══════════════════════════════════════════════════

function CompetitorsTab({ channelId }: { channelId: string }) {
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [newYtId, setNewYtId] = useState('');
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [channelId]);
  const load = async () => { setLoading(true); try { setCompetitors(await ideation.getCompetitors(channelId)); } catch {} finally { setLoading(false); } };

  const add = async () => {
    if (!newYtId.trim()) return;
    setAdding(true);
    try { await ideation.addCompetitor({ channelId, ytChannelId: newYtId.trim() }); setNewYtId(''); load(); }
    catch (e: any) { alert(e.message); }
    finally { setAdding(false); }
  };

  const remove = async (id: string) => { if (confirm('Verwijderen?')) { await ideation.deleteCompetitor(id); load(); } };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="glass rounded-2xl p-6">
        <h3 className="section-title mb-4"><UserPlus className="w-5 h-5 text-red-400" /> Concurrent Toevoegen</h3>
        <div className="flex gap-3">
          <input type="text" value={newYtId} onChange={e => setNewYtId(e.target.value)} placeholder="YouTube Channel ID (UCxxxxxx)" className="input-base" onKeyDown={e => e.key === 'Enter' && add()} />
          <button onClick={add} disabled={adding} className="btn-primary whitespace-nowrap">{adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Toevoegen (1 cr)</button>
        </div>
        <p className="text-[10px] text-zinc-600 mt-2">Bij toevoegen wordt automatisch kanaalinfo opgehaald en gecached (1 credit)</p>
      </div>

      {competitors.length === 0 && !loading ? (
        <EmptyState icon={Target} text="Nog geen concurrenten toegevoegd" small />
      ) : (
        <div className="space-y-4">
          {competitors.map(comp => <CompetitorCard key={comp.id} competitor={comp} onRemove={() => remove(comp.id)} />)}
        </div>
      )}
    </div>
  );
}

function CompetitorCard({ competitor, onRemove }: { competitor: any; onRemove: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center"><Target className="w-5 h-5 text-red-400" /></div>
          <div>
            <h3 className="font-semibold text-white">{competitor.name || competitor.ytChannelId}</h3>
            <p className="text-xs text-zinc-500 font-mono">{competitor.ytChannelId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setExpanded(!expanded)} className="btn-secondary text-xs py-1.5 px-3">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}{expanded ? 'Inklappen' : 'Analyseer'}
          </button>
          <a href={`https://youtube.com/channel/${competitor.ytChannelId}`} target="_blank" rel="noreferrer" className="btn-icon !p-1.5"><ExternalLink className="w-3.5 h-3.5" /></a>
          <button onClick={onRemove} className="btn-icon !p-1.5 text-zinc-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-white/[0.04] pt-4 animate-fade-in-down">
          <DirectSection ytChannelId={competitor.ytChannelId} endpoint="about" title="Info" icon={Users} render={AboutRender} />
          <DirectSection ytChannelId={competitor.ytChannelId} endpoint="videos" title="Video's" icon={Video} render={VideosRender} />
          <DirectSection ytChannelId={competitor.ytChannelId} endpoint="outliers" title="Outliers" icon={TrendingUp} render={OutliersRender} />
          <DirectSection ytChannelId={competitor.ytChannelId} endpoint="analytics" title="Analytics" icon={BarChart3} render={RawRender} />
        </div>
      )}
    </div>
  );
}

/** Section that fetches by ytChannelId directly */
function DirectSection({ ytChannelId, endpoint, title, icon: Icon, render: Render }: {
  ytChannelId: string; endpoint: string; title: string; icon: any; render: React.FC<{ data: any }>;
}) {
  const [data, setData] = useState<any>(null);
  const [cached, setCached] = useState(false);
  const [fetchedAt, setFetchedAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(true);

  const load = async (refresh = false) => {
    setLoading(true); setError('');
    try {
      const r = await ideation.directChannel(ytChannelId, endpoint, refresh);
      setData(r.data); setCached(r.cached); setFetchedAt(r.fetchedAt); setCollapsed(false);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="rounded-xl bg-surface-200/30 border border-white/[0.04] overflow-hidden">
      <div className="flex items-center justify-between p-3 cursor-pointer" onClick={() => data && setCollapsed(!collapsed)}>
        <span className="flex items-center gap-2 text-sm font-medium text-zinc-300"><Icon className="w-4 h-4 text-zinc-500" />{title}
          {data && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
          {cached && fetchedAt && <span className="text-[10px] text-zinc-600">(cached · {timeAgo(fetchedAt)})</span>}
        </span>
        <div className="flex items-center gap-1.5">
          {!data && !loading && <button onClick={e => { e.stopPropagation(); load(); }} className="text-xs text-brand-400 hover:text-brand-300">Ophalen</button>}
          {data && <button onClick={e => { e.stopPropagation(); load(true); }} className="text-xs text-zinc-600 hover:text-zinc-400 flex items-center gap-1"><RefreshCw className="w-3 h-3" />Refresh</button>}
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />}
        </div>
      </div>
      {data && !collapsed && <div className="px-3 pb-3 animate-fade-in-down"><Render data={data} /><AddResearchBtn label={`${title} (${ytChannelId.slice(0, 10)})`} type={`competitor_${endpoint}`} data={data} /></div>}
      {error && <p className="text-xs text-red-400 px-3 pb-2">{error}</p>}
    </div>
  );
}

// ══════════════════════════════════════════════════
// TAB 5: VIDEO DEEP DIVE
// ══════════════════════════════════════════════════

function VideoDeepDiveTab() {
  const [url, setUrl] = useState('');
  const vid = extractVideoId(url);

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="glass rounded-2xl p-6">
        <h3 className="section-title mb-4"><Search className="w-5 h-5 text-cyan-400" /> Video Analyseren</h3>
        <input type="text" value={url} onChange={e => setUrl(e.target.value)} placeholder="Plak YouTube video URL..." className="input-base" />
        {vid && vid.length === 11 && <p className="text-xs text-zinc-600 mt-2">Video ID: <span className="text-zinc-400 font-mono">{vid}</span></p>}
      </div>
      {vid && vid.length === 11 && (
        <>
          <PostSection videoId={vid} endpoint="video-details" title="Video Details" icon={Play} render={VideoDetailsRender} />
          <PostSection videoId={vid} endpoint="video-comments" title="Comments" icon={MessageSquare} render={RawRender} />
          <PostSection videoId={vid} endpoint="video-transcript" title="Transcript" icon={FileText} render={TranscriptRender} />
        </>
      )}
    </div>
  );
}

function PostSection({ videoId, endpoint, title, icon: Icon, render: Render }: {
  videoId: string; endpoint: string; title: string; icon: any; render: React.FC<{ data: any }>;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => { setData(null); setError(''); setCollapsed(true); }, [videoId]);
  const load = async () => {
    setLoading(true); setError('');
    try { setData((await ideation.nexlevPost(endpoint, { videoId })).data); setCollapsed(false); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between p-5 cursor-pointer" onClick={() => data && setCollapsed(!collapsed)}>
        <h3 className="flex items-center gap-2 font-semibold text-white"><Icon className="w-5 h-5 text-zinc-400" />{title}{data && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}</h3>
        <div className="flex items-center gap-2">
          {!data && !loading && <button onClick={e => { e.stopPropagation(); load(); }} className="btn-secondary text-xs py-1.5 px-3"><Download className="w-3.5 h-3.5" />Ophalen (1 cr)</button>}
          {loading && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />}
          {error && <span className="text-xs text-red-400">{error}</span>}
          {data && (collapsed ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronUp className="w-4 h-4 text-zinc-500" />)}
        </div>
      </div>
      {data && !collapsed && <div className="px-5 pb-5 animate-fade-in-down"><Render data={data} /><AddResearchBtn label={`${title}: ${videoId}`} type={`video_${endpoint}`} data={data} /></div>}
    </div>
  );
}

// ══════════════════════════════════════════════════
// CACHED SECTION (for own channel)
// ══════════════════════════════════════════════════

function CachedSection({ channelId, endpoint, title, icon: Icon, color, render: Render }: {
  channelId: string; endpoint: string; title: string; icon: any; color: string; render: React.FC<{ data: any }>;
}) {
  const [data, setData] = useState<any>(null);
  const [cached, setCached] = useState(false);
  const [fetchedAt, setFetchedAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => { setData(null); setCached(false); setError(''); setCollapsed(true); loadCached(); }, [channelId]);

  // Auto-load cached data (0 credits — cache-only check)
  const loadCached = async () => {
    try {
      const r = await ideation.nexlevCacheOnly(endpoint, channelId);
      if (r && r.data) { setData(r.data); setCached(true); setFetchedAt(r.fetchedAt); }
    } catch {} // No cache exists — that's fine
  };

  const load = async (refresh = false) => {
    setLoading(true); setError('');
    try {
      const r = await ideation.nexlev(endpoint, channelId, refresh);
      setData(r.data); setCached(r.cached); setFetchedAt(r.fetchedAt); setCollapsed(false);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const colorMap: Record<string, string> = {
    brand: 'text-brand-400', blue: 'text-blue-400', yellow: 'text-yellow-400', emerald: 'text-emerald-400',
    purple: 'text-purple-400', cyan: 'text-cyan-400', orange: 'text-orange-400', pink: 'text-pink-400',
  };

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between p-5 cursor-pointer" onClick={() => data && setCollapsed(!collapsed)}>
        <h3 className="flex items-center gap-2 font-semibold text-white">
          <Icon className={`w-5 h-5 ${colorMap[color] || ''}`} />{title}
          {data && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
          {cached && fetchedAt && <span className="text-[10px] text-zinc-600 font-normal">(cached · {timeAgo(fetchedAt)})</span>}
        </h3>
        <div className="flex items-center gap-2">
          {!data && !loading && <button onClick={e => { e.stopPropagation(); load(); }} className="btn-secondary text-xs gap-1.5 py-1.5 px-3"><Download className="w-3.5 h-3.5" />Ophalen</button>}
          {data && !loading && <button onClick={e => { e.stopPropagation(); load(true); }} className="text-xs text-zinc-600 hover:text-zinc-400 flex items-center gap-1"><RefreshCw className="w-3 h-3" />Refresh (1 cr)</button>}
          {loading && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />}
          {error && <span className="text-xs text-red-400">{error}</span>}
          {data && (collapsed ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronUp className="w-4 h-4 text-zinc-500" />)}
        </div>
      </div>
      {data && !collapsed && (
        <div className="px-5 pb-5 animate-fade-in-down">
          <Render data={data} />
          <AddResearchBtn label={title} type={endpoint} data={data} />
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════
// RENDER FUNCTIONS
// ══════════════════════════════════════════════════

function AboutRender({ data }: { data: any }) {
  const d = Array.isArray(data) ? data[0] : data;
  if (!d) return <p className="text-zinc-500 text-sm">Geen data</p>;
  const avatar = d.avatar?.[0]?.url || d.thumbnail?.[0]?.url;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {avatar && <img src={avatar} alt="" className="w-16 h-16 rounded-full bg-surface-300" />}
        <div>
          <h3 className="text-lg font-bold text-white">{d.title || d.channelName}</h3>
          {d.channelHandle && <p className="text-sm text-zinc-500">{d.channelHandle}</p>}
          {d.country && <p className="text-xs text-zinc-600">{d.country} · Joined {d.joinedDate || d.joinedDateText}</p>}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <MetricBox label="Subscribers" value={fmtNum(d.subscriberCount)} />
        <MetricBox label="Views" value={fmtNum(d.viewCount)} />
        <MetricBox label="Video's" value={fmtNum(d.videosCount || d.videoCount)} />
      </div>
      {d.description && <p className="text-xs text-zinc-500 leading-relaxed whitespace-pre-line max-h-32 overflow-y-auto">{d.description}</p>}
      <RawToggle data={d} />
    </div>
  );
}

function VideosRender({ data }: { data: any }) {
  const videos = Array.isArray(data) ? data : data?.data || [];
  if (videos.length === 0) return <p className="text-zinc-500 text-sm">Geen video's</p>;
  return <VideoList videos={videos.slice(0, 20)} />;
}

function OutliersRender({ data }: { data: any }) {
  const d = Array.isArray(data) ? data[0] : data;
  const outliers = d?.outliers || [];
  const avgViews = d?.avgViews;
  if (outliers.length === 0) return <div><p className="text-zinc-500 text-sm">{d?.msg || 'Geen outliers'}</p><RawToggle data={d} /></div>;
  return <div className="space-y-3">{avgViews && <p className="text-xs text-zinc-500">Gem. views: {fmtNum(avgViews)} · {outliers.length} outliers</p>}<VideoList videos={outliers} /><RawToggle data={d} /></div>;
}

function SimilarChannelsRender({ data }: { data: any }) {
  const channels = data?.data || (Array.isArray(data) ? data : []);
  if (channels.length === 0) return <p className="text-zinc-500 text-sm">Geen vergelijkbare kanalen</p>;
  return (
    <div className="space-y-2">
      {channels.map((ch: any, i: number) => {
        const about = ch.about || ch;
        const avatar = about.thumbnail?.[0]?.url;
        return (
          <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-surface-200/40 hover:bg-surface-200/70 transition-colors">
            {avatar && <img src={avatar} alt="" className="w-10 h-10 rounded-full bg-surface-300 shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{about.channelName || about.title}</p>
              <div className="flex gap-3 text-xs text-zinc-500"><span>{fmtNum(about.subscriberCount)} subs</span><span>{fmtNum(about.viewCount)} views</span></div>
            </div>
            {ch.similarityScore && <span className="badge badge-info text-[10px]">{ch.similarityScore}%</span>}
          </div>
        );
      })}
      <RawToggle data={data} />
    </div>
  );
}

function SimilarVideosRender({ data }: { data: any }) {
  const videos = Array.isArray(data) ? data : data?.data || [];
  if (videos.length === 0) return <p className="text-zinc-500 text-sm">Geen vergelijkbare video's</p>;
  return <div className="space-y-2"><VideoList videos={videos.slice(0, 15)} /><RawToggle data={data} /></div>;
}

function VideoDetailsRender({ data }: { data: any }) {
  const d = Array.isArray(data) ? data[0] : data;
  if (!d) return <p className="text-zinc-500 text-sm">Geen data</p>;
  const thumb = Array.isArray(d.thumbnail) ? d.thumbnail[d.thumbnail.length - 1]?.url : d.thumbnail;
  return (
    <div className="space-y-3">
      {thumb && <img src={thumb} alt="" className="w-full max-w-md rounded-xl bg-surface-300" />}
      <h4 className="text-lg font-bold text-white">{d.title}</h4>
      <div className="flex gap-4 text-sm text-zinc-400">
        {d.viewCount && <span><Eye className="w-4 h-4 inline" /> {fmtNum(d.viewCount)}</span>}
        {d.likeCount && <span><ThumbsUp className="w-4 h-4 inline" /> {fmtNum(d.likeCount)}</span>}
        {d.lengthSeconds && <span><Clock className="w-4 h-4 inline" /> {Math.round(parseInt(d.lengthSeconds) / 60)}m</span>}
      </div>
      {d.description && <p className="text-xs text-zinc-500 whitespace-pre-line max-h-40 overflow-y-auto">{d.description}</p>}
      {d.keywords?.length > 0 && <div className="flex flex-wrap gap-1">{d.keywords.slice(0, 15).map((k: string, i: number) => <span key={i} className="badge badge-neutral text-[10px]">{k}</span>)}</div>}
      <RawToggle data={d} />
    </div>
  );
}

function TranscriptRender({ data }: { data: any }) {
  const text = typeof data === 'string' ? data : (data?.transcript || data?.text || JSON.stringify(data, null, 2));
  return <div><pre className="p-4 rounded-xl bg-surface-200/60 border border-white/[0.04] text-xs text-zinc-400 overflow-auto max-h-96 font-mono whitespace-pre-wrap">{text}</pre><RawToggle data={data} /></div>;
}

function RawRender({ data }: { data: any }) { return <RawToggle data={data} defaultOpen />; }

// ══════════════════════════════════════════════════
// SHARED COMPONENTS
// ══════════════════════════════════════════════════

function MetricBox({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl p-3 bg-surface-200/50 border border-white/[0.04]"><p className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</p><p className="text-xl font-bold text-white mt-0.5">{value}</p></div>;
}

function RawToggle({ data, defaultOpen }: { data: any; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen || false);
  return (
    <div className="mt-3">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}{open ? 'Verberg' : 'Toon'} ruwe data
      </button>
      {open && <pre className="mt-2 p-4 rounded-xl bg-surface-200/60 border border-white/[0.04] text-xs text-zinc-400 overflow-auto max-h-96 font-mono">{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}

function VideoList({ videos }: { videos: any[] }) {
  const research = useResearch();
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? videos : videos.slice(0, 5);
  return (
    <div className="space-y-2">
      {displayed.map((v: any, i: number) => {
        const title = v.title || v.video_title || 'Untitled';
        const views = v.viewCount || v.views;
        const videoId = v.videoId || v.video_id || v.id;
        const thumb = Array.isArray(v.thumbnail) ? v.thumbnail[0]?.url : v.thumbnail;
        const score = v.outlierScore;
        const isAdded = research.items.some(r => r.label === title);
        return (
          <div key={videoId || i} className="flex items-center gap-3 p-3 rounded-xl bg-surface-200/40 hover:bg-surface-200/70 transition-colors group">
            {thumb && <img src={thumb} alt="" className="w-24 h-14 rounded-lg object-cover shrink-0 bg-surface-300" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{title}</p>
              <div className="flex gap-3 mt-0.5">
                {views && <span className="text-xs text-zinc-500"><Eye className="w-3 h-3 inline" /> {fmtNum(views)}</span>}
                {score && <span className="text-xs text-amber-400">{score}</span>}
                {v.publishedTimeText && <span className="text-xs text-zinc-600">{v.publishedTimeText}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!isAdded ? (
                <button onClick={() => research.add({ label: title, type: 'video', summary: `Video: ${title}\nViews: ${views || '?'}\nOutlier: ${score || 'n/a'}\nID: ${videoId}` })}
                  className="btn-icon !p-1.5 opacity-0 group-hover:opacity-100 text-amber-500 hover:text-amber-400" title="Toevoegen aan research">
                  <Bookmark className="w-3.5 h-3.5" />
                </button>
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              )}
              {videoId && <a href={`https://youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer" className="btn-icon !p-1.5 opacity-0 group-hover:opacity-100"><ExternalLink className="w-3.5 h-3.5" /></a>}
            </div>
          </div>
        );
      })}
      {videos.length > 5 && <button onClick={() => setShowAll(!showAll)} className="text-xs text-zinc-600 hover:text-zinc-400 flex items-center gap-1 mx-auto">{showAll ? 'Minder' : `Alle ${videos.length}`}</button>}
    </div>
  );
}

function IdeaCard({ idea, onSave, onDelete, onConvert, saving, isNew, isSaved }: any) {
  const [expanded, setExpanded] = useState(false);
  const cb = (c: string) => c === 'high' ? 'badge-success' : c === 'medium' ? 'badge-warning' : 'badge-neutral';
  return (
    <div className={`glass rounded-xl p-5 glass-hover ${isNew ? 'border-brand-500/20' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold text-white">{idea.title}</h3>
            {idea.confidence && <span className={`badge text-[10px] ${cb(idea.confidence)}`}>{idea.confidence}</span>}
            {idea.status === 'converted' && <span className="badge badge-success text-[10px]">Omgezet</span>}
          </div>
          <p className="text-zinc-400 text-sm">{idea.description}</p>
          {(idea.angle || idea.reasoning) && <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 mt-2">{expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}{expanded ? 'Minder' : 'Meer'}</button>}
          {expanded && <div className="mt-2 space-y-1 text-sm animate-fade-in-down">{idea.angle && <p className="text-zinc-300"><span className="text-zinc-600">Hook: </span>{idea.angle}</p>}{idea.reasoning && <p className="text-zinc-300"><span className="text-zinc-600">Reden: </span>{idea.reasoning}</p>}</div>}
          <span className="badge badge-info text-[10px] mt-2">{idea.videoType}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isNew && onSave && <button onClick={onSave} disabled={saving} className="btn-ghost text-xs gap-1 text-emerald-400">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Opslaan</button>}
          {onConvert && <button onClick={onConvert} className="btn-ghost text-xs gap-1 text-brand-400"><ArrowRight className="w-3.5 h-3.5" />Project</button>}
          {onDelete && <button onClick={onDelete} className="btn-icon !p-1.5 text-zinc-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
        </div>
      </div>
    </div>
  );
}

function AddResearchBtn({ label, type, data }: { label: string; type: string; data: any }) {
  const research = useResearch();
  const exists = research.items.some(i => i.label === label);
  if (exists) return <p className="text-xs text-emerald-500 mt-3 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Toegevoegd aan research</p>;
  return <button onClick={() => research.add({ label, type, summary: JSON.stringify(data, null, 2).slice(0, 3000) })} className="mt-3 flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors"><Bookmark className="w-3.5 h-3.5" />Toevoegen aan brainstorm</button>;
}

function ResearchContextBadges() {
  const research = useResearch();
  return (
    <div className="glass rounded-xl p-4 border-amber-500/20">
      <div className="flex items-center gap-2 mb-2"><Bookmark className="w-4 h-4 text-amber-400" /><span className="text-sm font-medium text-amber-300">Research context ({research.items.length})</span></div>
      <div className="flex flex-wrap gap-2">
        {research.items.map(item => <span key={item.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-amber-500/10 text-amber-300 border border-amber-500/20">{item.label}<button onClick={() => research.remove(item.id)} className="hover:text-red-400"><X className="w-3 h-3" /></button></span>)}
      </div>
      <p className="text-[10px] text-zinc-600 mt-2">Deze data wordt meegegeven aan de AI brainstorm</p>
    </div>
  );
}

function LoadingBox({ text }: { text: string }) {
  return <div className="glass rounded-2xl p-16 text-center"><Loader2 className="w-10 h-10 mx-auto mb-4 text-brand-400 animate-spin" /><p className="text-zinc-400">{text}</p></div>;
}

function EmptyState({ icon: Icon, text, small }: { icon: any; text: string; small?: boolean }) {
  return <div className={`glass rounded-2xl ${small ? 'p-12' : 'p-20'} text-center`}><Icon className={`${small ? 'w-10 h-10' : 'w-12 h-12'} mx-auto mb-4 text-zinc-600`} /><p className="text-zinc-500">{text}</p></div>;
}

function SectionHeader({ text }: { text: string }) {
  return <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">{text}</h3>;
}
