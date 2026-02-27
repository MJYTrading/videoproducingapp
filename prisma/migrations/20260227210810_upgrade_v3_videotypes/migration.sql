-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "elevateApiKey" TEXT NOT NULL DEFAULT '',
    "n8nBaseUrl" TEXT NOT NULL DEFAULT 'https://n8n.srv1275252.hstgr.cloud',
    "assemblyAiApiKey" TEXT NOT NULL DEFAULT '',
    "discordWebhookUrl" TEXT NOT NULL DEFAULT '',
    "discordUserId" TEXT NOT NULL DEFAULT '1154154714699665418',
    "openClawUrl" TEXT NOT NULL DEFAULT 'http://127.0.0.1:18789',
    "openClawHooksToken" TEXT NOT NULL DEFAULT '',
    "defaultVoice" TEXT NOT NULL DEFAULT 'Brody — Crime Narrator',
    "defaultVisualStyle" TEXT NOT NULL DEFAULT 'ai-3d-render',
    "defaultLanguage" TEXT NOT NULL DEFAULT 'EN',
    "defaultScriptLength" INTEGER NOT NULL DEFAULT 5000,
    "defaultSubtitles" BOOLEAN NOT NULL DEFAULT true,
    "defaultColorGrading" TEXT NOT NULL DEFAULT 'cinematic_dark',
    "youtubeTranscriptApiKey" TEXT NOT NULL DEFAULT '',
    "anthropicApiKey" TEXT NOT NULL DEFAULT '',
    "genaiProApiKey" TEXT NOT NULL DEFAULT '',
    "genaiProEnabled" BOOLEAN NOT NULL DEFAULT false,
    "genaiProImagesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "videoDownloadApiKey" TEXT NOT NULL DEFAULT '',
    "perplexityApiKey" TEXT NOT NULL DEFAULT '',
    "twelveLabsApiKey" TEXT NOT NULL DEFAULT '',
    "nexlevApiKey" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "driveFolderId" TEXT NOT NULL DEFAULT '',
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "youtubeChannelId" TEXT NOT NULL DEFAULT '',
    "defaultVideoType" TEXT NOT NULL DEFAULT 'ai',
    "competitors" TEXT NOT NULL DEFAULT '[]',
    "maxClipDurationSeconds" INTEGER,
    "baseStyleProfile" TEXT,
    "baseResearchTemplate" TEXT,
    "styleReferenceUrls" TEXT NOT NULL DEFAULT '[]',
    "styleExtraInstructions" TEXT NOT NULL DEFAULT '',
    "usedClips" TEXT NOT NULL DEFAULT '[]',
    "overlayPresetId" TEXT,
    "sfxEnabled" BOOLEAN NOT NULL DEFAULT true,
    "specialEditsEnabled" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Channel_overlayPresetId_fkey" FOREIGN KEY ("overlayPresetId") REFERENCES "OverlayPreset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "language" TEXT NOT NULL DEFAULT 'EN',
    "scriptSource" TEXT NOT NULL DEFAULT 'new',
    "referenceVideos" TEXT NOT NULL DEFAULT '[]',
    "scriptLength" INTEGER,
    "scriptUrl" TEXT,
    "voice" TEXT NOT NULL,
    "backgroundMusic" BOOLEAN NOT NULL DEFAULT false,
    "visualStyle" TEXT NOT NULL,
    "visualStyleParent" TEXT,
    "customVisualStyle" TEXT,
    "imageSelectionMode" TEXT NOT NULL DEFAULT 'auto',
    "imagesPerScene" INTEGER NOT NULL DEFAULT 1,
    "selectedImages" TEXT NOT NULL DEFAULT '[]',
    "transitionMode" TEXT NOT NULL DEFAULT 'none',
    "uniformTransition" TEXT,
    "sceneTransitions" TEXT NOT NULL DEFAULT '[]',
    "useClips" BOOLEAN NOT NULL DEFAULT false,
    "referenceClips" TEXT NOT NULL DEFAULT '[]',
    "montageClips" TEXT NOT NULL DEFAULT '[]',
    "stockImages" BOOLEAN NOT NULL DEFAULT false,
    "checkpoints" TEXT NOT NULL DEFAULT '[]',
    "feedbackHistory" TEXT NOT NULL DEFAULT '[]',
    "colorGrading" TEXT NOT NULL DEFAULT 'Geen',
    "subtitles" BOOLEAN NOT NULL DEFAULT true,
    "output" TEXT NOT NULL DEFAULT 'YouTube 1080p',
    "status" TEXT NOT NULL DEFAULT 'config',
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "aspectRatio" TEXT NOT NULL DEFAULT 'landscape',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "queuePosition" INTEGER,
    "enabledSteps" TEXT NOT NULL DEFAULT '[]',
    "channelId" TEXT,
    "driveUrl" TEXT,
    "videoType" TEXT NOT NULL DEFAULT 'ai',
    CONSTRAINT "Project_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Step" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stepNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "executor" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "duration" INTEGER,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME,
    "firstAttemptAt" DATETIME,
    "result" TEXT,
    "aiResponse" TEXT,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "metadata" TEXT,
    "projectId" TEXT NOT NULL,
    CONSTRAINT "Step_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LogEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    CONSTRAINT "LogEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Voice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "voiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Idea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "videoType" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "sourceData" TEXT NOT NULL DEFAULT '{}',
    "referenceVideos" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'saved',
    "projectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Idea_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResearchTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "videoType" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AssetClip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceUrl" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "localPath" TEXT NOT NULL,
    "thumbnailPath" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subjects" TEXT NOT NULL DEFAULT '[]',
    "mood" TEXT,
    "quality" REAL,
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MusicTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "duration" REAL NOT NULL,
    "mood" TEXT NOT NULL DEFAULT '[]',
    "genre" TEXT NOT NULL,
    "bpm" INTEGER,
    "energyProfile" TEXT,
    "hasVocals" BOOLEAN NOT NULL DEFAULT false,
    "loopable" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ChannelMusicSelection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "musicTrackId" TEXT NOT NULL,
    CONSTRAINT "ChannelMusicSelection_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChannelMusicSelection_musicTrackId_fkey" FOREIGN KEY ("musicTrackId") REFERENCES "MusicTrack" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OverlayFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "resolution" TEXT,
    "framerate" INTEGER,
    "duration" REAL,
    "category" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "previewUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OverlayPreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "layers" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SoundEffect" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "duration" REAL NOT NULL,
    "category" TEXT NOT NULL,
    "intensity" TEXT NOT NULL DEFAULT 'medium',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "usageGuide" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SfxUsageRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sfxCategory" TEXT NOT NULL,
    "triggerCondition" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ChannelSfxSelection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "soundEffectId" TEXT NOT NULL,
    CONSTRAINT "ChannelSfxSelection_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChannelSfxSelection_soundEffectId_fkey" FOREIGN KEY ("soundEffectId") REFERENCES "SoundEffect" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SpecialEdit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scriptPath" TEXT NOT NULL,
    "parameters" TEXT NOT NULL DEFAULT '{}',
    "applicableFor" TEXT NOT NULL DEFAULT '[]',
    "usageGuide" TEXT,
    "previewUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ChannelSpecialEditSelection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "specialEditId" TEXT NOT NULL,
    CONSTRAINT "ChannelSpecialEditSelection_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChannelSpecialEditSelection_specialEditId_fkey" FOREIGN KEY ("specialEditId") REFERENCES "SpecialEdit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EditingKnowledge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "videoType" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "directorsCut" TEXT NOT NULL,
    "userFeedback" TEXT,
    "effectsUsed" TEXT NOT NULL DEFAULT '[]',
    "score" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EditingKnowledge_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_name_key" ON "Channel"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Step_projectId_stepNumber_key" ON "Step"("projectId", "stepNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Voice_voiceId_key" ON "Voice"("voiceId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelMusicSelection_channelId_musicTrackId_key" ON "ChannelMusicSelection"("channelId", "musicTrackId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelSfxSelection_channelId_soundEffectId_key" ON "ChannelSfxSelection"("channelId", "soundEffectId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelSpecialEditSelection_channelId_specialEditId_key" ON "ChannelSpecialEditSelection"("channelId", "specialEditId");
