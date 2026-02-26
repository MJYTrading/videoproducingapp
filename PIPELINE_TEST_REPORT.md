# Pipeline Test Report — Eerste Volledige Run

**Datum:** 26 februari 2026
**Project:** `3d_video_1`
**Stijl:** 3D Render (Cinematic Mannequins)
**Resultaat:** Pipeline voltooid ✅ (met handmatige fixes onderweg)

---

## Samenvatting

De volledige pipeline is voor het eerst end-to-end doorgelopen. Alle 15 stappen (0-14, plus 65) zijn uitgevoerd. De uiteindelijke video is 10 seconden lang (3 scenes) en geupload naar Google Drive. De korte duur is een bekend bug — zie "Openstaande Issues" onderaan.

---

## Stappen Resultaat

| Stap | Naam | Status | Notities |
|------|------|--------|----------|
| 0 | Config validatie | ✅ | - |
| 1 | Transcripts ophalen | ✅ | - |
| 2 | Style profile maken | ✅ | - |
| 3 | Script schrijven | ✅ | 1730 woorden (target: 2000) |
| 4 | Voiceover genereren | ✅ | 707s audio gegenereerd |
| 5 | Timestamps genereren | ✅ | 243 zinnen, geen woord-level timestamps |
| 6 | Scene prompts genereren | ⚠️ | Slechts 3 scenes (11s) voor 707s audio — kritiek bug |
| 6b | Scene images genereren | ✅ | 3/3 images (1 had retry nodig) |
| 7 | Assets zoeken | ⏭️ | Overgeslagen |
| 8 | YouTube clips ophalen | ⏭️ | Overgeslagen |
| 9 | Video scenes genereren | ✅ | 3/3 videos (1 retry, GenAI fallback) |
| 10 | Video editing | ✅ | 10s video, 7.2MB |
| 11 | Color grading | ✅ | Overgeslagen (none) |
| 12 | Subtitles | ⏭️ | Overgeslagen |
| 13 | Final export | ✅ | 10s, 6.7MB, youtube_1080p |
| 14 | Google Drive upload | ✅ | 11 bestanden geupload |

---

## Bugs Gefixt Tijdens Run

### Fix 1: Checkpoint Skip Logic
- **Probleem:** Pipeline pauzeerde altijd bij stap 3 ongeacht checkbox instellingen
- **Fix:** Checkpoint check gebruikt nu project.checkpoints array uit database
- **Bestanden:** pipeline-engine.ts

### Fix 2: Stap 65 Display als "6b"
- **Probleem:** Stap 65 verscheen onderaan de lijst
- **Fix:** Frontend display mapping met STEP_DISPLAY record + sortering
- **Bestanden:** PipelineTab.tsx, CheckpointsSection.tsx

### Fix 3: Script Wordcount Te Laag
- **Probleem:** LLM schreef ~1700 woorden bij target 2000
- **Fix:** Range 90-110%, 5 retries, strengere prompt, harde 90% ondergrens
- **Bestanden:** pipeline.ts

### Fix 4: Video Editor N8N Pad Bug
- **Probleem:** Dubbele slash in pad (projects//edit/) door SSH $json.body overschrijving
- **Fix:** Set Variables Code node toegevoegd
- **Workflow:** Video Editor (if8l1rA1q4MQZZMgnUZtk)

### Fix 5: GenAI Image SSE Streaming
- **Probleem:** SSH curl kapt SSE stream af na eerste event
- **Fix:** Native N8N HTTP Request node, polling loop verwijderd
- **Workflow:** Image Options Generator v2 (eMXKJjUkuP9wWEIoqXjyx)

### Fix 6: Audio Track Container Mismatch
- **Probleem:** ffmpeg schreef AAC audio naar .mp3 container
- **Fix:** Output extensie .mp3 naar .m4a
- **Bestanden:** editor.py

### Fix 7: Color Grading Skip bij "none"
- **Probleem:** N8N workflow werd altijd aangeroepen
- **Fix:** Early return in executeStep11() wanneer color_grade "none"
- **Bestanden:** pipeline.ts

### Fix 8-9: Color Grader + Final Exporter N8N Pad Bug
- **Probleem:** Zelfde dubbele-slash bug als Fix 4
- **Fix:** Set Variables Code node toegevoegd aan beide workflows

### Fix 10: Track GenAI Download Verwijzing
- **Probleem:** Node verwees naar verwijderde nodes
- **Fix:** Verwijzing geupdate naar GenAI Image OK?

### Fix 11: Stap 14 Google Drive Upload
- **Probleem:** Google Drive upload was niet in pipeline
- **Fix:** Stap 14 toegevoegd aan config, defaultSteps, frontend, database

### Fix 12: Final Video Niet in Drive
- **Probleem:** Upload script zocht final.* in project root ipv final/ subdir
- **Fix:** Extra upload_dir regel voor $PROJECT_PATH/final

---

## Openstaande Issues

### KRITIEK: Stap 6 Genereert Te Weinig Scenes

Bij 1730 woorden (707s audio) worden slechts 3 scenes (11s) gegenereerd. Oorzaak: stap 6 geeft geen timing-info aan de LLM. De LLM weet niet hoe lang de audio is en maakt willekeurig weinig scenes.

**Fix nodig:** Stap 5 moet woord-level timestamps opslaan. Stap 6 moet de totale audio duur en timestamps meekrijgen zodat de LLM het juiste aantal scenes maakt.

### Script Wordcount Nog Steeds Te Laag
Target 2000, resultaat 1730 (86.5%). Fix 3 zou dit bij volgende run moeten afvangen.

### Pipeline Hervatten Na Reset
Na database reset moet app herstart worden. Hervat-knop werkt niet altijd betrouwbaar.

---

## N8N Patroon
Alle N8N workflows met meerdere SSH nodes hadden dezelfde bug: SSH overschrijft $json.body. Oplossing is altijd een Set Variables Code node direct na de Webhook.

## Git Commits
1. 26fe312 — Fix 1-3: checkpoint skip, stap 65 als 6b, script wordcount
2. 59d8154 — Fix: color grading skip bij none, audio track .m4a
3. ab837a5 — Stap 14: Google Drive upload toegevoegd
4. 149c4e3 — Fix: final video uploaden naar Google Drive
