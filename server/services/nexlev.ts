/**
 * NexLev Service — communiceert met NexLev API via N8N webhook
 * 
 * N8N workflow: "NexLev - All-in-One API Gateway v3"
 * POST {n8nBaseUrl}/webhook/nexlev
 * Body: { operation: "...", channel_id: "...", ... }
 * 
 * CREDIT SYSTEEM: Elke call = 1 credit (200/maand)
 * Gebruik zuinig — alleen ophalen wat nodig is!
 */

// Extract channel ID uit URL of geef raw ID terug
function extractChannelId(input: string): string {
  if (!input) return input;
  const match = input.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (input.startsWith('UC') && !input.includes('/')) return input;
  return input.trim().replace(/\/+$/, '');
}

// Extract video ID uit URL of geef raw ID terug
function extractVideoId(input: string): string {
  if (!input) return input;
  const match = input.match(/(?:v=|youtu\.be\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
  if (match) return match[1];
  if (input.length === 11 && !input.includes('/')) return input;
  return input.trim();
}

interface NexLevConfig {
  n8nBaseUrl: string;
  nexlevApiKey: string;
}

export class NexLevService {
  private webhookUrl: string;

  constructor(config: NexLevConfig) {
    this.webhookUrl = `${config.n8nBaseUrl}/webhook/nexlev`;
  }

  private async call(operation: string, params: Record<string, any> = {}): Promise<any> {
    try {
      console.log(`[NexLev] Calling: ${operation}`, JSON.stringify(params).substring(0, 100));
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation, ...params }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`NexLev ${operation} failed (${response.status}): ${text}`);
      }

      // Sommige endpoints geven lege response
      const text = await response.text();
      if (!text || text.trim() === '') {
        throw new Error(`NexLev ${operation}: lege response`);
      }

      return JSON.parse(text);
    } catch (error: any) {
      console.error(`[NexLev] ${operation} error:`, error.message);
      throw error;
    }
  }

  // ══════════════════════════════════════════════
  // Channel Content (Resource: Channel Content)
  // ══════════════════════════════════════════════

  /** Get About — kanaal metadata, subscribers, views, links */
  async getChannelAbout(channelId: string) {
    return this.call('channel_about', { channel_id: extractChannelId(channelId) });
  }

  /** Get Videos — alle long-form videos (met pagination) */
  async getChannelVideos(channelId: string) {
    return this.call('channel_videos', { channel_id: extractChannelId(channelId) });
  }

  /** Get Shorts — alle short-form videos */
  async getChannelShorts(channelId: string) {
    return this.call('channel_shorts', { channel_id: extractChannelId(channelId) });
  }

  /** Get Playlists — alle playlists */
  async getChannelPlaylists(channelId: string) {
    return this.call('channel_playlists', { channel_id: extractChannelId(channelId) });
  }

  /** Get Outliers — videos met bovengemiddelde views */
  async getChannelOutliers(channelId: string) {
    return this.call('channel_outliers', { channel_id: extractChannelId(channelId) });
  }

  // ══════════════════════════════════════════════
  // Channel Analytics (Resource: Channel Analytic)
  // ══════════════════════════════════════════════

  /** Get Analytics — subscribers, views, video count, social links, upload history */
  async getAnalytics(channelId: string) {
    return this.call('analytics_get', { channel_id: extractChannelId(channelId) });
  }

  /** Get Geography Demographics Revenue — demografie, locatie, inkomsten */
  async getDemographics(channelId: string) {
    return this.call('analytics_demographics', { channel_id: extractChannelId(channelId) });
  }

  /** Get Short vs Long Views — vergelijking kort vs lang formaat */
  async getShortVsLong(channelId: string) {
    return this.call('analytics_short_vs_long', { channel_id: extractChannelId(channelId) });
  }

  // ══════════════════════════════════════════════
  // Channel Analysis (Resource: Channel Analysis) — Async job
  // ══════════════════════════════════════════════

  /** Create Analysis Job — start diepe analyse (30-60s wachttijd) */
  async createAnalysisJob(channelId: string) {
    return this.call('analysis_create_job', { channel_id: extractChannelId(channelId) });
  }

  /** Get Analysis Result — haal resultaat op met job_id */
  async getAnalysisResult(jobId: string) {
    return this.call('analysis_get_result', { job_id: jobId });
  }

  // ══════════════════════════════════════════════
  // Video Content (Resource: Video Content)
  // ══════════════════════════════════════════════

  /** Video Details */
  async getVideoDetails(videoId: string) {
    return this.call('video_details', { video_id: extractVideoId(videoId) });
  }

  /** Video Comments */
  async getVideoComments(videoId: string) {
    return this.call('video_comments', { video_id: extractVideoId(videoId) });
  }

  /** Video Transcript */
  async getVideoTranscript(videoId: string) {
    return this.call('video_transcript', { video_id: extractVideoId(videoId) });
  }

  /** Video Subtitle */
  async getVideoSubtitle(videoId: string) {
    return this.call('video_subtitle', { video_id: extractVideoId(videoId) });
  }

  /** Video RPM */
  async getVideoRPM(videoId: string) {
    return this.call('video_rpm', { video_id: extractVideoId(videoId) });
  }

  /** Shorts Details */
  async getShortsDetails(shortId: string) {
    return this.call('shorts_details', { video_id: extractVideoId(shortId) });
  }

  /** Download Thumbnail */
  async downloadThumbnail(videoId: string) {
    return this.call('download_thumbnail', { video_id: extractVideoId(videoId) });
  }

  // ══════════════════════════════════════════════
  // Discovery
  // ══════════════════════════════════════════════

  /** Similar Channels */
  async getSimilarChannels(channelId: string) {
    return this.call('similar_channels', { channel_id: extractChannelId(channelId) });
  }

  /** Niche Analysis */
  async getNicheAnalysis(channelId: string) {
    return this.call('niche_analyze', { channel_id: extractChannelId(channelId) });
  }

  /** Similar Videos */
  async getSimilarVideos(videoId: string) {
    return this.call('similar_videos', { video_id: extractVideoId(videoId) });
  }

  /** Resolve Handle → Channel ID */
  async resolveHandle(username: string) {
    return this.call('resolve_handle', { username });
  }

  // ══════════════════════════════════════════════
  // Bulk
  // ══════════════════════════════════════════════

  async getBulkTranscript(videoIds: string[]) {
    return this.call('video_bulk_transcript', { video_ids: videoIds.map(extractVideoId) });
  }

  async getBulkSubtitle(videoIds: string[]) {
    return this.call('video_bulk_subtitle', { video_ids: videoIds.map(extractVideoId) });
  }
}
