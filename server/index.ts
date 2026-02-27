import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { authMiddleware } from './auth.js';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import settingsRoutes from './routes/settings.js';
import pipelineRoutes from './routes/pipeline.js';
import pipelineEngineRoutes from './routes/pipeline-engine-routes.js';
import stylesRoutes from './routes/styles.js';
import channelRoutes from './routes/channels.js';
import voiceRoutes from './routes/voices.js';
import ideationRoutes from './routes/ideation.js';
import assetClipRoutes from './routes/asset-clips.js';
import mediaLibraryRoutes from './routes/media-library.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);

app.use(authMiddleware);

app.use('/api/projects', projectRoutes);
app.use('/api/projects', pipelineRoutes);
app.use('/api/pipeline', pipelineEngineRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/styles', stylesRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/voices', voiceRoutes);
app.use('/api/ideation', ideationRoutes);
app.use('/api/asset-clips', assetClipRoutes);
app.use('/api/media', mediaLibraryRoutes);

const frontendPath = path.join(__dirname, '..', 'dist-frontend');
app.use(express.static(frontendPath));

app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log('Video Producer API draait op poort ' + PORT);
});
