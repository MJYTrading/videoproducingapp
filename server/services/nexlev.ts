/**
 * NexLev Service — communiceert met NexLev API via N8N webhook
 * 
 * De N8N workflow "NexLev - All-in-One API Gateway v3" draait op:
 * POST {n8nBaseUrl}/webhook/nexlev
 * Body: { operation: "...", channel_id: "...", ... }
 */

interface NexLevConfig {
  n8nBaseUrl: string;
  nexlevApiKey: string; // Wordt niet direct gebruikt (zit in N8N credentials), maar voor toekomstige directe calls
}

interface NexLevResponse {
  success: boolean;
  data: any;
  error?: string;
}

export class NexLevService {
  private webhookUrl: string;
  private apiKey: string;

  constructor(config: NexLevConfig) {
    this.webhookUrl = `${config.n8nBaseUrl}/webhook/nexlev`;
    this.apiKey = config.nexlevApiKey;
  }

  private async call(operation: string, params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation, ...params }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`NexLev ${operation} failed (${response.status}): ${text}`);
      }

      const data = await response.json();
      return data;
    } catch (error: any) {
      console.error(`NexLev ${operation} error:`, error.message);
      throw error;
    }
  }

  // ── Channel Info ──

  async getChannelAbout(channelId: string): Promise<any> {
    return this.call('channel_about', { channel_id: channelId });
  }

  async resolveHandle(username: string): Promise<any> {
    return this.call('resolve_handle', { username });
  }

  // ── Channel Content ──

  async getChannelVideos(channelId: string): Promise<any> {
    return this.call('channel_videos', { channel_id: channelId });
  }

  async getChannelShorts(channelId: string): Promise<any> {
    return this.call('channel_shorts', { channel_id: channelId });
  }

  async getChannelOutliers(channelId: string): Promise<any> {
    return this.call('channel_outliers', { channel_id: channelId });
  }

  // ── Analytics ──

  async getAnalytics(channelId: string): Promise<any> {
    return this.call('analytics_get', { channel_id: channelId });
  }

  // ── Discovery ──

  async getSimilarChannels(channelId: string): Promise<any> {
    return this.call('similar_channels', { channel_id: channelId });
  }

  async getNicheAnalysis(channelId: string): Promise<any> {
    return this.call('niche_analyze', { channel_id: channelId });
  }

  async getSimilarVideos(videoId: string): Promise<any> {
    return this.call('similar_videos', { video_id: videoId });
  }

  // ── Video Details ──

  async getVideoDetails(videoId: string): Promise<any> {
    return this.call('video_details', { video_id: videoId });
  }

  async getVideoComments(videoId: string): Promise<any> {
    return this.call('video_comments', { video_id: videoId });
  }

  async getVideoTranscript(videoId: string): Promise<any> {
    return this.call('video_transcript', { video_id: videoId });
  }
}

/**
 * Bouwt een samenvatting van NexLev kanaaldata voor de AI brainstorm prompt
 */
export function buildChannelSummary(data: {
  about?: any;
  videos?: any;
  outliers?: any;
  analytics?: any;
  competitorOutliers?: any[];
}): string {
  const parts: string[] = [];

  if (data.about) {
    parts.push(`KANAAL INFO:\n${JSON.stringify(data.about, null, 2)}`);
  }

  if (data.analytics) {
    parts.push(`ANALYTICS:\n${JSON.stringify(data.analytics, null, 2)}`);
  }

  if (data.videos) {
    // Neem top 20 recente videos
    const vids = Array.isArray(data.videos) ? data.videos.slice(0, 20) : data.videos;
    parts.push(`RECENTE VIDEOS (top 20):\n${JSON.stringify(vids, null, 2)}`);
  }

  if (data.outliers) {
    // Outlier = bovengemiddeld presterende videos
    const outliers = Array.isArray(data.outliers) ? data.outliers.slice(0, 15) : data.outliers;
    parts.push(`OUTLIER VIDEOS (bovengemiddeld):\n${JSON.stringify(outliers, null, 2)}`);
  }

  if (data.competitorOutliers && data.competitorOutliers.length > 0) {
    parts.push(`COMPETITOR OUTLIERS:\n${JSON.stringify(data.competitorOutliers, null, 2)}`);
  }

  return parts.join('\n\n---\n\n');
}
