#!/usr/bin/env python3
"""
Audio Analyzer v2 — Met librosa voor professionele audio analyse
Analyseert SFX en Music bestanden en seeded de database.

Features:
- Nauwkeurige BPM detectie (librosa beat tracking)
- RMS energie curve per seconde
- Spectrale kenmerken (brightness, warmth)
- Onset detection (waar klanken beginnen)
- Loudness (mean/max dB via ffmpeg)
- Slimme mood classificatie op basis van audio + naam
- Categorie/tags op basis van audio kenmerken + naam

Gebruik:
  python3 analyze-and-seed-v2.py [--sfx-only] [--music-only] [--no-seed]
"""

import os
import sys
import json
import re
import subprocess
import sqlite3
import uuid
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import librosa

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

# ── Config ──
SFX_DIR = "/root/.openclaw/workspace/video-producer/sfx"
MUSIC_DIR = "/root/.openclaw/workspace/video-producer/music"
DB_PATH = "/root/video-producer-app/data/video-producer.db"
OUTPUT_DIR = "/root/.openclaw/workspace/video-producer"

# ══════════════════════════════════════════════════
# LIBROSA AUDIO ANALYSE
# ══════════════════════════════════════════════════

def load_audio(filepath, sr=22050, duration=None):
    """Laad audio bestand met librosa"""
    try:
        y, sr_actual = librosa.load(filepath, sr=sr, duration=duration, mono=True)
        return y, sr_actual
    except Exception as e:
        print(f"  ⚠ Laden mislukt: {e}")
        return None, sr


def analyze_audio_full(filepath, is_music=False):
    """
    Volledige audio analyse met librosa.
    Returns dict met alle audio kenmerken.
    """
    result = {
        "duration": 0,
        "bpm": None,
        "beat_times": [],
        "rms_energy": [],           # Per seconde RMS waarde (0-1 schaal)
        "energy_levels": [],        # Per seconde: "low"/"medium"/"high"
        "mean_rms": 0,
        "max_rms": 0,
        "spectral_centroid_mean": 0,  # Brightness indicator
        "spectral_bandwidth_mean": 0,
        "onset_count": 0,           # Aantal klanken/hits
        "onset_rate": 0,            # Onsets per seconde
        "onset_times": [],          # Eerste 50 onset tijden
        "zero_crossing_rate": 0,    # Indicatie van noisiness
        "is_percussive": False,
        "dynamic_range_db": 0,      # Verschil luidste/stilste moment
        "spectral_rolloff_mean": 0, # Hoe veel hoge frequenties
        "energy_variance": 0,       # Hoe veel het volume verandert
        "mean_volume_db": None,
        "max_volume_db": None,
    }

    # ── Laad audio ──
    max_duration = 300 if is_music else 60  # Max 5 min voor music, 1 min voor sfx
    y, sr = load_audio(filepath, duration=max_duration)
    if y is None or len(y) == 0:
        return result

    duration = librosa.get_duration(y=y, sr=sr)
    result["duration"] = round(duration, 2)

    if duration < 0.1:
        return result

    # ── RMS Energy per seconde ──
    hop_length = sr  # 1 seconde per frame
    frame_length = sr
    if len(y) > frame_length:
        rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]
    else:
        rms = np.array([np.sqrt(np.mean(y**2))])

    rms_list = rms.tolist()
    result["rms_energy"] = [round(float(r), 6) for r in rms_list]
    result["mean_rms"] = round(float(np.mean(rms)), 6) if len(rms) > 0 else 0
    result["max_rms"] = round(float(np.max(rms)), 6) if len(rms) > 0 else 0

    # Classificeer per seconde
    if len(rms) > 0:
        p33 = np.percentile(rms, 33)
        p66 = np.percentile(rms, 66)
        levels = []
        for r in rms:
            if r <= p33:
                levels.append("low")
            elif r <= p66:
                levels.append("medium")
            else:
                levels.append("high")
        result["energy_levels"] = levels

    # Dynamic range
    if len(rms) > 1:
        rms_nonzero = rms[rms > 0]
        if len(rms_nonzero) > 1:
            db_max = 20 * np.log10(np.max(rms_nonzero) + 1e-10)
            db_min = 20 * np.log10(np.min(rms_nonzero) + 1e-10)
            result["dynamic_range_db"] = round(float(db_max - db_min), 1)

    # Energy variance (hoe veel verandert het volume)
    if len(rms) > 1:
        result["energy_variance"] = round(float(np.var(rms)), 8)

    # ── BPM Detectie ──
    if duration > 3:
        try:
            tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
            if isinstance(tempo, np.ndarray):
                tempo = tempo[0]
            bpm = round(float(tempo))
            if 30 <= bpm <= 250:
                result["bpm"] = bpm
                beat_times = librosa.frames_to_time(beat_frames, sr=sr)
                result["beat_times"] = [round(float(t), 3) for t in beat_times[:100]]
        except Exception:
            pass

    # ── Onset Detection ──
    try:
        onset_frames = librosa.onset.onset_detect(y=y, sr=sr, units="frames")
        onset_times = librosa.frames_to_time(onset_frames, sr=sr)
        result["onset_count"] = len(onset_times)
        result["onset_rate"] = round(len(onset_times) / max(duration, 0.1), 2)
        result["onset_times"] = [round(float(t), 3) for t in onset_times[:50]]
    except Exception:
        pass

    # ── Spectrale Features ──
    try:
        # Spectral centroid — hoe "bright" het geluid is
        centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        result["spectral_centroid_mean"] = round(float(np.mean(centroid)), 1)

        # Spectral bandwidth — hoe "breed" het frequentiespectrum is
        bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr)[0]
        result["spectral_bandwidth_mean"] = round(float(np.mean(bandwidth)), 1)

        # Spectral rolloff — waar 85% van de energie zit
        rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]
        result["spectral_rolloff_mean"] = round(float(np.mean(rolloff)), 1)

        # Zero crossing rate — indicatie percussief/noisy
        zcr = librosa.feature.zero_crossing_rate(y)[0]
        result["zero_crossing_rate"] = round(float(np.mean(zcr)), 4)
    except Exception:
        pass

    # ── Percussive check ──
    try:
        y_harm, y_perc = librosa.effects.hpss(y)
        perc_energy = np.sum(y_perc**2)
        harm_energy = np.sum(y_harm**2)
        total = perc_energy + harm_energy
        if total > 0:
            result["is_percussive"] = bool(perc_energy / total > 0.4)
    except Exception:
        pass

    # ── Loudness via ffmpeg (nauwkeuriger dan librosa voor dB) ──
    try:
        cmd = ["ffmpeg", "-i", filepath, "-af", "volumedetect", "-f", "null", "-"]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        m = re.search(r"mean_volume:\s*(-?[\d.]+)", proc.stderr)
        if m:
            result["mean_volume_db"] = float(m.group(1))
        m = re.search(r"max_volume:\s*(-?[\d.]+)", proc.stderr)
        if m:
            result["max_volume_db"] = float(m.group(1))
    except Exception:
        pass

    return result


# ══════════════════════════════════════════════════
# SFX CATEGORISATIE (naam + audio kenmerken)
# ══════════════════════════════════════════════════

SFX_CATEGORIES = {
    "whoosh":       ["whoosh", "swoosh", "swish", "sweep", "swing", "transition", "swipe"],
    "impact":       ["boom", "impact", "hit", "slam", "crash", "thud", "punch", "struck", "smash", "break", "shatter"],
    "click":        ["click", "pop", "tap", "snap", "button", "mouse", "press", "select"],
    "notification": ["notification", "ding", "bell", "alert", "message", "discord", "apple", "receive", "send"],
    "tech":         ["glitch", "data", "digital", "hacking", "dial", "reboot", "download", "upload",
                     "network", "terminal", "processing", "access", "sci fi", "scifi", "ui", "loading",
                     "connect", "disconnect", "intermodulation"],
    "riser":        ["riser", "build", "ascending", "swell", "evolve", "suction", "build-up", "buildup"],
    "drop":         ["drop", "sub", "bass", "deep", "low", "subsonic"],
    "cash":         ["cash", "money", "coin", "register", "kaching", "ching", "purchase"],
    "camera":       ["camera", "shutter", "lens", "photo", "flash", "flare"],
    "paper":        ["paper", "page", "flip", "rip", "slide", "writing", "write", "pencil",
                     "keyboard", "typewriter", "typing"],
    "cartoon":      ["cartoon", "fart", "goofy", "splat", "bloop", "awww", "yey", "mario",
                     "minecraft", "wrong answer", "correct"],
    "music_element":["drum", "horn", "party", "boxing bell"],
    "ambient":      ["spooky", "suspense", "tension", "upset", "crowd", "wind"],
    "clock":        ["clock", "tick", "ticking", "timer", "counting", "fast forward", "rewind"],
    "voice":        ["applause", "censor", "beep", "hmm"],
    "mechanical":   ["gear", "projector", "spinning", "motor", "cork", "bottle", "wine", "glass"],
}


def categorize_sfx(filename, analysis):
    """Bepaal categorie, tags en intensiteit op basis van naam + audio analyse"""
    name_lower = filename.lower().replace("_", " ").replace("-", " ")

    # ── Naam-gebaseerde categorisatie ──
    best_category = None
    matched_tags = []
    for category, keywords in SFX_CATEGORIES.items():
        for kw in keywords:
            if kw in name_lower:
                if best_category is None:
                    best_category = category
                matched_tags.append(kw)

    # ── Audio-gebaseerde categorisatie als naam geen match geeft ──
    if best_category is None:
        dur = analysis.get("duration", 0)
        onset_rate = analysis.get("onset_rate", 0)
        centroid = analysis.get("spectral_centroid_mean", 0)
        is_perc = analysis.get("is_percussive", False)
        zcr = analysis.get("zero_crossing_rate", 0)
        mean_rms = analysis.get("mean_rms", 0)

        if dur < 0.3 and is_perc:
            best_category = "click"
        elif dur < 0.5 and mean_rms > 0.1:
            best_category = "impact"
        elif dur < 1.5 and centroid > 3000:
            best_category = "whoosh"
        elif dur > 2 and onset_rate < 1:
            best_category = "ambient"
        elif is_perc and onset_rate > 5:
            best_category = "music_element"
        elif centroid < 1000:
            best_category = "drop"
        elif zcr > 0.15:
            best_category = "tech"
        else:
            best_category = "general"

    # ── Intensiteit: gebaseerd op audio ──
    mean_vol = analysis.get("mean_volume_db")
    mean_rms = analysis.get("mean_rms", 0)
    dynamic_range = analysis.get("dynamic_range_db", 0)

    if mean_vol is not None:
        if mean_vol > -12:
            intensity = "hard"
        elif mean_vol > -25:
            intensity = "medium"
        else:
            intensity = "soft"
    elif mean_rms > 0.15:
        intensity = "hard"
    elif mean_rms > 0.05:
        intensity = "medium"
    else:
        intensity = "soft"

    # Korte, percussieve geluiden met hoge dynamiek zijn vaak "hard"
    if analysis.get("is_percussive") and dynamic_range > 20:
        intensity = "hard"

    # ── Extra audio-gebaseerde tags ──
    audio_tags = []
    if analysis.get("is_percussive"):
        audio_tags.append("percussive")
    if analysis.get("spectral_centroid_mean", 0) > 4000:
        audio_tags.append("bright")
    elif analysis.get("spectral_centroid_mean", 0) < 1500:
        audio_tags.append("deep")
    if analysis.get("duration", 0) < 0.5:
        audio_tags.append("short")
    elif analysis.get("duration", 0) > 5:
        audio_tags.append("long")
    if dynamic_range > 25:
        audio_tags.append("punchy")

    all_tags = list(set([best_category] + matched_tags + audio_tags))

    return {
        "category": best_category,
        "tags": all_tags,
        "intensity": intensity,
    }


# ══════════════════════════════════════════════════
# MUSIC CATEGORISATIE (naam + audio kenmerken)
# ══════════════════════════════════════════════════

MUSIC_MOOD_KEYWORDS = {
    "dark":      ["thriller", "tension", "dark", "edge", "fear", "misdirection", "mordor", "crime"],
    "uplifting": ["uplifting", "corporate", "education", "horizons", "stars", "scale", "mountain",
                  "never surrender"],
    "chill":     ["chill", "only me", "como vamos", "casa rosa", "documentary"],
    "energetic": ["drop", "duty calls", "high noon", "pulsar", "monthaholic"],
    "dramatic":  ["awesome", "great pig", "road to mordor", "on the flip"],
    "neutral":   ["interview", "purple desire", "schwartzy"],
}

MUSIC_GENRE_KEYWORDS = {
    "cinematic":  ["thriller", "cinematic", "documentary", "edge of fear", "awesome"],
    "hip-hop":    ["drop", "anno domini", "beats", "schwartzy"],
    "electronic": ["pulsar", "density", "time", "grey room"],
    "ambient":    ["chill", "stars", "constellations", "only me"],
    "latin":      ["como vamos", "casa rosa"],
    "rock":       ["road to mordor", "great pig", "ezra lipp"],
    "corporate":  ["uplifting", "corporate", "education", "interview"],
}


def classify_mood_from_audio(analysis):
    """Classificeer mood op basis van audio kenmerken"""
    bpm = analysis.get("bpm")
    centroid = analysis.get("spectral_centroid_mean", 0)
    mean_rms = analysis.get("mean_rms", 0)
    dynamic_range = analysis.get("dynamic_range_db", 0)
    energy_var = analysis.get("energy_variance", 0)
    is_perc = analysis.get("is_percussive", False)

    # Scoring systeem
    scores = {"dark": 0, "uplifting": 0, "chill": 0, "energetic": 0, "dramatic": 0, "neutral": 0}

    # BPM-based
    if bpm:
        if bpm < 80:
            scores["chill"] += 3
            scores["dark"] += 1
        elif bpm < 110:
            scores["neutral"] += 2
            scores["dramatic"] += 1
        elif bpm < 135:
            scores["uplifting"] += 2
            scores["energetic"] += 1
        else:
            scores["energetic"] += 3

    # Brightness (spectral centroid)
    if centroid > 3500:
        scores["uplifting"] += 2
        scores["energetic"] += 1
    elif centroid < 1500:
        scores["dark"] += 2
        scores["chill"] += 1
    elif centroid < 2500:
        scores["neutral"] += 1
        scores["dramatic"] += 1

    # Energy level
    if mean_rms > 0.12:
        scores["energetic"] += 2
        scores["dramatic"] += 1
    elif mean_rms < 0.04:
        scores["chill"] += 2
        scores["dark"] += 1

    # Dynamic range
    if dynamic_range > 20:
        scores["dramatic"] += 2
    elif dynamic_range < 8:
        scores["chill"] += 1

    # Energy variance (hoe veel het volume verandert)
    if energy_var > 0.001:
        scores["dramatic"] += 2
        scores["energetic"] += 1
    elif energy_var < 0.0001:
        scores["chill"] += 2

    # Percussiveness
    if is_perc:
        scores["energetic"] += 1

    # Bepaal winnaar
    best_mood = max(scores, key=scores.get)
    return best_mood


def categorize_music(filename, analysis):
    """Bepaal mood, genre, tags van music track op basis van naam + audio"""
    name_lower = filename.lower().replace("_", " ").replace("-", " ")

    # ── Naam-gebaseerd ──
    mood_from_name = None
    for m, keywords in MUSIC_MOOD_KEYWORDS.items():
        for kw in keywords:
            if kw in name_lower:
                mood_from_name = m
                break
        if mood_from_name:
            break

    genre = "mixed"
    for g, keywords in MUSIC_GENRE_KEYWORDS.items():
        for kw in keywords:
            if kw in name_lower:
                genre = g
                break

    # ── Audio-gebaseerd mood ──
    mood_from_audio = classify_mood_from_audio(analysis)

    # Combineer: naam heeft prioriteit als die duidelijk is, anders audio
    mood = mood_from_name if mood_from_name else mood_from_audio

    # ── Extract titel en artiest ──
    clean_name = re.sub(r'\.(mp3|wav|mp4|aiff)$', '', filename, flags=re.IGNORECASE)
    parts = clean_name.split(" - ")
    title = parts[0].strip().replace("_", " ")
    artist = parts[1].strip().replace("_", " ") if len(parts) > 1 else ""

    # ── Loopable ──
    dur = analysis.get("duration", 0)
    loopable = dur < 60 or "loop" in name_lower

    # ── Vocals ──
    has_vocals = any(kw in name_lower for kw in ["vocal", "sing", "voice", "talk", "interview"])

    # ── Audio-gebaseerde tags ──
    tags = [mood, genre]
    if analysis.get("bpm"):
        if analysis["bpm"] > 130:
            tags.append("fast")
        elif analysis["bpm"] < 80:
            tags.append("slow")
    if analysis.get("spectral_centroid_mean", 0) > 3500:
        tags.append("bright")
    elif analysis.get("spectral_centroid_mean", 0) < 1500:
        tags.append("dark-tone")
    if analysis.get("is_percussive"):
        tags.append("percussive")
    if analysis.get("dynamic_range_db", 0) > 20:
        tags.append("dynamic")
    if analysis.get("energy_variance", 0) < 0.0002:
        tags.append("steady")

    return {
        "title": title,
        "artist": artist,
        "mood": mood,
        "mood_from_audio": mood_from_audio,
        "mood_from_name": mood_from_name,
        "genre": genre,
        "tags": list(set(tags)),
        "loopable": loopable,
        "has_vocals": has_vocals,
    }


# ══════════════════════════════════════════════════
# ANALYSE PIPELINE
# ══════════════════════════════════════════════════

def analyze_sfx_directory():
    """Analyseer alle SFX bestanden met librosa"""
    print(f"\n{'='*60}")
    print(f"  SFX ANALYSE (librosa) — {SFX_DIR}")
    print(f"{'='*60}\n")

    results = []
    files = sorted([f for f in os.listdir(SFX_DIR)
                    if f.lower().endswith(('.mp3', '.wav', '.aiff', '.mp4'))])

    for i, filename in enumerate(files):
        filepath = os.path.join(SFX_DIR, filename)
        print(f"[{i+1}/{len(files)}] {filename}...", end=" ", flush=True)

        # Volledige analyse
        analysis = analyze_audio_full(filepath, is_music=False)

        # Categorisatie
        cat = categorize_sfx(filename, analysis)

        result = {
            "filename": filename,
            "filepath": filepath,
            **analysis,
            "category": cat["category"],
            "tags": cat["tags"],
            "intensity": cat["intensity"],
        }
        results.append(result)

        print(f"✓ {analysis['duration']:.1f}s | {cat['category']} | {cat['intensity']}"
              f" | onsets:{analysis['onset_count']} | centroid:{analysis['spectral_centroid_mean']:.0f}Hz")

    output_path = os.path.join(OUTPUT_DIR, "sfx-analysis.json")
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n✅ {len(results)} SFX geanalyseerd → {output_path}")
    return results


def analyze_music_directory():
    """Analyseer alle music tracks met librosa"""
    print(f"\n{'='*60}")
    print(f"  MUSIC ANALYSE (librosa) — {MUSIC_DIR}")
    print(f"{'='*60}\n")

    results = []
    files = sorted([f for f in os.listdir(MUSIC_DIR)
                    if f.lower().endswith(('.mp3', '.wav', '.aiff'))])

    for i, filename in enumerate(files):
        filepath = os.path.join(MUSIC_DIR, filename)
        print(f"[{i+1}/{len(files)}] {filename}...", end=" ", flush=True)

        # Volledige analyse
        analysis = analyze_audio_full(filepath, is_music=True)

        # Categorisatie
        cat = categorize_music(filename, analysis)

        result = {
            "filename": filename,
            "filepath": filepath,
            "title": cat["title"],
            "artist": cat["artist"],
            **analysis,
            "mood": cat["mood"],
            "mood_from_audio": cat["mood_from_audio"],
            "mood_from_name": cat["mood_from_name"],
            "genre": cat["genre"],
            "tags": cat["tags"],
            "loopable": cat["loopable"],
            "has_vocals": cat["has_vocals"],
        }
        results.append(result)

        bpm_str = f"BPM:{analysis['bpm']}" if analysis['bpm'] else "BPM:?"
        print(f"✓ {analysis['duration']:.0f}s | {cat['mood']} ({cat['mood_from_audio']}) | {cat['genre']} | {bpm_str}")

    output_path = os.path.join(OUTPUT_DIR, "music-analysis.json")
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n✅ {len(results)} tracks geanalyseerd → {output_path}")
    return results


# ══════════════════════════════════════════════════
# DATABASE SEEDER
# ══════════════════════════════════════════════════

def generate_cuid():
    return "c" + uuid.uuid4().hex[:24]


def seed_database(sfx_results, music_results):
    """Vul de SoundEffect en MusicTrack tabellen"""
    print(f"\n{'='*60}")
    print(f"  DATABASE SEEDEN")
    print(f"{'='*60}\n")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("DELETE FROM SoundEffect")
    cursor.execute("DELETE FROM MusicTrack")
    print("Bestaande SFX en Music data verwijderd")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

    # ── Seed SoundEffect ──
    sfx_count = 0
    for sfx in sfx_results:
        try:
            name = re.sub(r'\.(mp3|wav|mp4|aiff)$', '', sfx["filename"], flags=re.IGNORECASE)
            name = re.sub(r'\(.*?\)', '', name).strip()
            name = re.sub(r'^\d+\s*', '', name).strip()
            if not name:
                name = sfx["filename"]

            # Maak compacte usageGuide met de belangrijkste audio data
            usage_guide = {
                "mean_volume_db": sfx.get("mean_volume_db"),
                "max_volume_db": sfx.get("max_volume_db"),
                "bpm": sfx.get("bpm"),
                "onset_count": sfx.get("onset_count"),
                "onset_rate": sfx.get("onset_rate"),
                "spectral_centroid": sfx.get("spectral_centroid_mean"),
                "is_percussive": sfx.get("is_percussive"),
                "dynamic_range_db": sfx.get("dynamic_range_db"),
                "energy_levels": sfx.get("energy_levels", [])[:30],
                "rms_energy": sfx.get("rms_energy", [])[:30],
            }

            cursor.execute("""
                INSERT INTO SoundEffect (id, name, filePath, duration, category, intensity, tags, usageGuide, createdAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                generate_cuid(),
                name,
                sfx["filepath"],
                round(sfx["duration"], 2),
                sfx["category"],
                sfx["intensity"],
                json.dumps(sfx["tags"]),
                json.dumps(usage_guide),
                now,
            ))
            sfx_count += 1
        except Exception as e:
            print(f"  ⚠ SFX seed fout ({sfx['filename']}): {e}")

    print(f"✅ {sfx_count} SFX effecten geseeded")

    # ── Seed MusicTrack ──
    music_count = 0
    for track in music_results:
        try:
            energy_profile = {
                "rms_energy": track.get("rms_energy", [])[:120],  # Max 2 min per seconde
                "energy_levels": track.get("energy_levels", [])[:120],
                "beat_times": track.get("beat_times", [])[:100],
                "spectral_centroid": track.get("spectral_centroid_mean"),
                "dynamic_range_db": track.get("dynamic_range_db"),
                "energy_variance": track.get("energy_variance"),
                "is_percussive": track.get("is_percussive"),
                "mean_volume_db": track.get("mean_volume_db"),
                "max_volume_db": track.get("max_volume_db"),
            }

            cursor.execute("""
                INSERT INTO MusicTrack (id, title, filePath, duration, mood, genre, bpm, energyProfile, hasVocals, loopable, tags, createdAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                generate_cuid(),
                track["title"],
                track["filepath"],
                round(track["duration"], 2),
                track["mood"],
                track["genre"],
                track.get("bpm"),
                json.dumps(energy_profile),
                1 if track.get("has_vocals") else 0,
                1 if track.get("loopable") else 0,
                json.dumps(track["tags"]),
                now,
            ))
            music_count += 1
        except Exception as e:
            print(f"  ⚠ Music seed fout ({track['filename']}): {e}")

    print(f"✅ {music_count} music tracks geseeded")

    conn.commit()
    conn.close()
    print(f"\n🎉 Database geseeded: {sfx_count} SFX + {music_count} Music")


# ══════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════

if __name__ == "__main__":
    print("🎵 Audio Analyzer v2 (librosa) & Database Seeder")
    print("=" * 60)

    args = sys.argv[1:]
    sfx_only = "--sfx-only" in args
    music_only = "--music-only" in args
    no_seed = "--no-seed" in args

    sfx_results = []
    music_results = []

    if not music_only:
        sfx_results = analyze_sfx_directory()
    if not sfx_only:
        music_results = analyze_music_directory()

    if not no_seed:
        seed_database(sfx_results, music_results)

    # ── Samenvatting ──
    print("\n" + "=" * 60)
    print("  SAMENVATTING")
    print("=" * 60)

    if sfx_results:
        sfx_cats = {}
        for s in sfx_results:
            cat = s["category"]
            sfx_cats[cat] = sfx_cats.get(cat, 0) + 1
        print(f"\nSFX ({len(sfx_results)} totaal):")
        for cat, count in sorted(sfx_cats.items(), key=lambda x: -x[1]):
            print(f"  {cat}: {count}")

        # Audio stats
        durations = [s["duration"] for s in sfx_results]
        print(f"\n  Gemiddelde duur: {np.mean(durations):.1f}s")
        print(f"  Kortste: {min(durations):.2f}s")
        print(f"  Langste: {max(durations):.1f}s")

    if music_results:
        music_moods = {}
        for m in music_results:
            mood = m["mood"]
            music_moods[mood] = music_moods.get(mood, 0) + 1
        print(f"\nMusic ({len(music_results)} totaal):")
        for mood, count in sorted(music_moods.items(), key=lambda x: -x[1]):
            print(f"  {mood}: {count}")

        bpms = [m["bpm"] for m in music_results if m.get("bpm")]
        if bpms:
            print(f"\n  BPM range: {min(bpms)} - {max(bpms)}")
            print(f"  Gemiddelde BPM: {np.mean(bpms):.0f}")
            print(f"  Tracks met BPM: {len(bpms)}/{len(music_results)}")

    print("\n✅ Klaar!")
