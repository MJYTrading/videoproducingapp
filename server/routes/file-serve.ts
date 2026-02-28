/**
 * File Serve Route — serveert lokale bestanden (images, video, audio) via de API
 * 
 * GET /api/files/serve?path=/root/.openclaw/workspace/projects/xxx/assets/image.png
 * 
 * Beveiligd: alleen bestanden in toegestane directories
 */
import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

const router = Router();

// Toegestane base directories voor file serving
const ALLOWED_BASES = [
  '/root/.openclaw',
  '/root/video-producer-app/data',
  '/tmp',
];

// MIME types op basis van extensie
const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
};

router.get('/serve', (req: Request, res: Response) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) {
      return res.status(400).json({ error: 'path query parameter is vereist' });
    }

    // Normaliseer het pad (voorkom directory traversal)
    const normalizedPath = path.resolve(filePath);

    // Check of het pad in een toegestane directory valt
    const isAllowed = ALLOWED_BASES.some(base => normalizedPath.startsWith(base));
    if (!isAllowed) {
      return res.status(403).json({ error: 'Toegang geweigerd tot dit pad' });
    }

    // Check of bestand bestaat
    if (!fs.existsSync(normalizedPath)) {
      return res.status(404).json({ error: 'Bestand niet gevonden' });
    }

    const stat = fs.statSync(normalizedPath);
    if (!stat.isFile()) {
      return res.status(400).json({ error: 'Pad is geen bestand' });
    }

    // Bepaal MIME type
    const ext = path.extname(normalizedPath).toLowerCase();
    const mimeType = MIME_MAP[ext] || 'application/octet-stream';

    // Support range requests voor video/audio streaming
    const range = req.headers.range;
    if (range && (mimeType.startsWith('video/') || mimeType.startsWith('audio/'))) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
      });

      fs.createReadStream(normalizedPath, { start, end }).pipe(res);
    } else {
      // Gewone response
      res.writeHead(200, {
        'Content-Type': mimeType,
        'Content-Length': stat.size,
        'Cache-Control': 'public, max-age=3600',
      });

      fs.createReadStream(normalizedPath).pipe(res);
    }
  } catch (err: any) {
    console.error('[FileServe] Error:', err.message);
    res.status(500).json({ error: 'Kon bestand niet laden' });
  }
});

export default router;
