#!/usr/bin/env python3
"""
Audio Analyzer & Database Seeder
Analyseert SFX en Music bestanden met ffprobe en seeded de database.

Gebruik:
  python3 analyze-and-seed.py

Output:
  - /root/.openclaw/workspace/video-producer/sfx-analysis.json
  - /root/.openclaw/workspace/video-producer/music-analysis.json
  - Database: SoundEffect en MusicTrack tabellen gevuld
"""

import os
import json
import re
import subprocess
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path

# ── Config ──
SFX_DIR = "/root/.openclaw/workspace/video-producer/sfx"
MUSIC_DIR = "/root/.openclaw/workspace/video-producer/music"
DB_PATH = "/root/video-producer-app/data/video-producer.db"
OUTPUT_DIR = "/root/.openclaw/workspace/video-producer"

# ══════════════════════════════════════════════════
# AUDIO ANALYSE MET FFPROBE
# ══════════════════════════════════════════════════

def get_audio_info(filepath):
    """Haal basis audio info op met ffprobe"""
    try:
        cmd = [
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_format", "-show_streams",
            filepath
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        data = json.loads(result.stdout)
        
        fmt = data.get("format", {})
        streams = data.get("streams", [])
        audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), {})
        
        return {
            "duration": float(fmt.get("duration", 0)),
            "size_bytes": int(fmt.get("size", 0)),
            "bitrate": int(fmt.get("bit_rate", 0)),
            "sample_rate": int(audio_stream.get("sample_rate", 0)),
            "channels": int(audio_stream.get("channels", 0)),
            "codec": audio_stream.get("codec_name", "unknown"),
        }
    except Exception as e:
        print(f"  ⚠ ffprobe info fout: {e}")
        return {"duration": 0, "size_bytes": 0, "bitrate": 0, "sample_rate": 0, "channels": 0, "codec": "unknown"}


def get_loudness(filepath):
    """Meet loudness via ffmpeg EBU R128 / volumedetect"""
    try:
        cmd = [
            "ffmpeg", "-i", filepath,
            "-af", "volumedetect",
            "-f", "null", "-"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        stderr = result.stderr
        
        mean_vol = None
        max_vol = None
        
        m = re.search(r"mean_volume:\s*(-?[\d.]+)\s*dB", stderr)
        if m:
            mean_vol = float(m.group(1))
        
        m = re.search(r"max_volume:\s*(-?[\d.]+)\s*dB", stderr)
        if m:
            max_vol = float(m.group(1))
        
        return {"mean_volume_db": mean_vol, "max_volume_db": max_vol}
    except Exception as e:
        print(f"  ⚠ loudness fout: {e}")
        return {"mean_volume_db": None, "max_volume_db": None}


def get_energy_profile(filepath, duration):
    """
    Maak een energie profiel per seconde.
    Gebruikt ffmpeg astats filter om per seconde RMS te meten.
    """
    if duration <= 0:
        return []
    
    try:
        # Meet RMS levels per 1-seconde segment
        segments = min(int(duration), 300)  # Max 300 seconden analyseren
        profile = []
        
        # Snelle methode: meet overall en schat profiel
        cmd = [
            "ffmpeg", "-i", filepath,
            "-af", f"asegment=timestamps={'|'.join(str(i) for i in range(1, segments+1))},astats=metadata=1:reset=1",
            "-f", "null", "-"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        
        # Parse RMS levels uit stderr
        rms_values = re.findall(r"RMS level dB:\s*(-?[\d.]+)", result.stderr)
        
        if rms_values:
            for rms_str in rms_values[:segments]:
                rms = float(rms_str)
                # Classificeer: -inf tot -40 = low, -40 tot -20 = medium, -20+ = high
                if rms < -40:
                    level = "low"
                elif rms < -20:
                    level = "medium"
                else:
                    level = "high"
                profile.append({"rms_db": rms, "level": level})
        
        # Fallback: als astats niet werkt, maak simpel profiel
        if not profile:
            loudness = get_loudness(filepath)
            mean = loudness.get("mean_volume_db") or -30
            if mean < -35:
                profile = [{"rms_db": mean, "level": "low"}] * segments
            elif mean < -20:
                profile = [{"rms_db": mean, "level": "medium"}] * segments
            else:
                profile = [{"rms_db": mean, "level": "high"}] * segments
        
        return profile
    except Exception as e:
        print(f"  ⚠ energy profile fout: {e}")
        return []


def estimate_bpm(filepath, duration):
    """
    Schat BPM via ffmpeg beat detectie.
    Gebruikt bandpass filter + onset detectie.
    """
    if duration < 5:
        return None
    
    try:
        # Methode: tel pieken in laag-frequentie energie (bass hits)
        cmd = [
            "ffmpeg", "-i", filepath, "-t", "30",  # Analyseer eerste 30 seconden
            "-af", "lowpass=f=150,highpass=f=40,volumedetect",
            "-f", "null", "-"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        # Alternatieve BPM schatting op basis van bestandsnaam of standaard
        # ffmpeg heeft geen native BPM detectie, dus we doen een ruwe schatting
        # via silence detectie (telt beats als volume pieken)
        cmd2 = [
            "ffmpeg", "-i", filepath, "-t", "30",
            "-af", "silencedetect=noise=-30dB:d=0.1",
            "-f", "null", "-"
        ]
        result2 = subprocess.run(cmd2, capture_output=True, text=True, timeout=30)
        
        # Tel silence_end events (= volume pieken na stilte = approximate beats)
        beats = re.findall(r"silence_end:\s*([\d.]+)", result2.stderr)
        
        if len(beats) >= 4:
            # Bereken gemiddelde interval tussen beats
            times = [float(b) for b in beats]
            intervals = [times[i+1] - times[i] for i in range(len(times)-1)]
            avg_interval = sum(intervals) / len(intervals)
            if avg_interval > 0:
                bpm = round(60.0 / avg_interval)
                # Sanity check: BPM moet tussen 40 en 220 liggen
                if 40 <= bpm <= 220:
                    return bpm
                elif 40 <= bpm * 2 <= 220:
                    return bpm * 2
                elif 40 <= bpm // 2 <= 220:
                    return bpm // 2
        
        return None
    except Exception as e:
        print(f"  ⚠ BPM schatting fout: {e}")
        return None


# ══════════════════════════════════════════════════
# SFX CATEGORISATIE
# ══════════════════════════════════════════════════

SFX_CATEGORIES = {
    "whoosh": ["whoosh", "swoosh", "swish", "sweep", "wind", "transition", "swing"],
    "impact": ["boom", "impact", "hit", "slam", "crash", "thud", "punch", "struck", "smash"],
    "click": ["click", "pop", "tap", "snap", "button", "mouse", "press"],
    "notification": ["notification", "ding", "bell", "alert", "message", "discord", "apple"],
    "tech": ["glitch", "data", "digital", "hacking", "dial", "reboot", "download", "upload", "network", "terminal", "processing", "access", "sci fi", "scifi", "ui"],
    "riser": ["riser", "build", "ascending", "swell", "evolve", "suction"],
    "drop": ["drop", "sub", "bass", "deep", "low"],
    "cash": ["cash", "money", "coin", "register", "kaching", "ching"],
    "camera": ["camera", "shutter", "lens", "photo", "flash"],
    "paper": ["paper", "page", "flip", "rip", "slide", "writing", "write", "pencil", "keyboard", "typewriter"],
    "cartoon": ["cartoon", "fart", "goofy", "splat", "bloop", "awww", "yey"],
    "music_element": ["drum", "horn", "party"],
    "ambient": ["spooky", "suspense", "tension", "upset", "crowd"],
    "clock": ["clock", "tick", "ticking", "timer", "counting"],
    "voice": ["applause", "censor", "beep"],
    "mechanical": ["gear", "projector", "spinning", "motor", "cork", "bottle", "wine", "glass"],
}

SFX_INTENSITY_MAP = {
    "whoosh": "medium",
    "impact": "hard",
    "click": "soft",
    "notification": "soft",
    "tech": "medium",
    "riser": "medium",
    "drop": "hard",
    "cash": "soft",
    "camera": "soft",
    "paper": "soft",
    "cartoon": "soft",
    "music_element": "medium",
    "ambient": "medium",
    "clock": "soft",
    "voice": "medium",
    "mechanical": "medium",
}


def categorize_sfx(filename, loudness_info):
    """Bepaal categorie, tags en intensiteit van een SFX bestand"""
    name_lower = filename.lower().replace("_", " ").replace("-", " ")
    
    # Zoek categorie op basis van bestandsnaam
    best_category = "general"
    matched_tags = []
    
    for category, keywords in SFX_CATEGORIES.items():
        for kw in keywords:
            if kw in name_lower:
                best_category = category
                matched_tags.append(kw)
    
    # Extra tags uit bestandsnaam
    extra_tags = []
    tag_words = ["sound", "effect", "sfx", "no copyright", "free", "hd"]
    clean_name = re.sub(r'\.(mp3|wav|mp4|aiff)$', '', filename, flags=re.IGNORECASE)
    clean_name = re.sub(r'\(.*?\)', '', clean_name).strip()
    
    # Intensiteit op basis van loudness + categorie
    intensity = SFX_INTENSITY_MAP.get(best_category, "medium")
    mean_vol = loudness_info.get("mean_volume_db")
    if mean_vol is not None:
        if mean_vol > -15:
            intensity = "hard"
        elif mean_vol < -35:
            intensity = "soft"
    
    # Maak beschrijvende tags
    all_tags = list(set(matched_tags))
    if best_category != "general":
        all_tags.insert(0, best_category)
    
    return {
        "category": best_category,
        "tags": all_tags,
        "intensity": intensity,
    }


# ══════════════════════════════════════════════════
# MUSIC CATEGORISATIE
# ══════════════════════════════════════════════════

MUSIC_MOOD_KEYWORDS = {
    "dark": ["thriller", "tension", "dark", "edge", "fear", "misdirection", "mordor", "crime"],
    "uplifting": ["uplifting", "corporate", "education", "horizons", "stars", "scale", "mountain", "never surrender"],
    "chill": ["chill", "only me", "como vamos", "casa rosa", "documentary"],
    "energetic": ["drop", "duty calls", "high noon", "pulsar", "yacoby", "monthaholic"],
    "dramatic": ["awesome", "great pig", "road to mordor", "on the flip"],
    "neutral": ["interview", "purple desire", "schwartzy"],
}

MUSIC_GENRE_KEYWORDS = {
    "cinematic": ["thriller", "cinematic", "documentary", "edge of fear", "awesome"],
    "hip-hop": ["drop", "anno domini", "beats", "schwartzy"],
    "electronic": ["pulsar", "density", "time", "grey room"],
    "ambient": ["chill", "stars", "constellations", "only me"],
    "latin": ["como vamos", "casa rosa"],
    "rock": ["road to mordor", "great pig", "ezra lipp"],
    "corporate": ["uplifting", "corporate", "education", "interview"],
}


def categorize_music(filename, audio_info, loudness_info, bpm):
    """Bepaal mood, genre en tags van een music track"""
    name_lower = filename.lower().replace("_", " ").replace("-", " ")
    
    # Mood detectie
    mood = "neutral"
    for m, keywords in MUSIC_MOOD_KEYWORDS.items():
        for kw in keywords:
            if kw in name_lower:
                mood = m
                break
    
    # Genre detectie
    genre = "mixed"
    for g, keywords in MUSIC_GENRE_KEYWORDS.items():
        for kw in keywords:
            if kw in name_lower:
                genre = g
                break
    
    # Loudness-based mood adjustment
    mean_vol = loudness_info.get("mean_volume_db")
    if mean_vol is not None:
        if mean_vol > -15 and mood == "neutral":
            mood = "energetic"
        elif mean_vol < -30 and mood == "neutral":
            mood = "chill"
    
    # Tags
    tags = [mood, genre]
    
    # Extract artiest uit bestandsnaam (format: "Title - Artist.mp3")
    clean_name = re.sub(r'\.(mp3|wav|mp4|aiff)$', '', filename, flags=re.IGNORECASE)
    parts = clean_name.split(" - ")
    title = parts[0].strip()
    artist = parts[1].strip() if len(parts) > 1 else ""
    
    # Loopable schatting: korte tracks (<60s) of tracks met "loop" in naam
    loopable = audio_info.get("duration", 0) < 60 or "loop" in name_lower
    
    # Heeft vocals?
    has_vocals = any(kw in name_lower for kw in ["vocal", "sing", "voice", "talk", "interview"])
    
    return {
        "title": title,
        "artist": artist,
        "mood": mood,
        "genre": genre,
        "tags": tags,
        "loopable": loopable,
        "has_vocals": has_vocals,
        "bpm": bpm,
    }


# ══════════════════════════════════════════════════
# ANALYSE PIPELINE
# ══════════════════════════════════════════════════

def analyze_sfx_directory():
    """Analyseer alle SFX bestanden"""
    print(f"\n{'='*60}")
    print(f"  SFX ANALYSE — {SFX_DIR}")
    print(f"{'='*60}\n")
    
    results = []
    files = sorted([f for f in os.listdir(SFX_DIR) if f.endswith(('.mp3', '.wav', '.aiff', '.mp4'))])
    
    for i, filename in enumerate(files):
        filepath = os.path.join(SFX_DIR, filename)
        print(f"[{i+1}/{len(files)}] {filename}...", end=" ", flush=True)
        
        # Basis info
        info = get_audio_info(filepath)
        
        # Loudness
        loudness = get_loudness(filepath)
        
        # Categorisatie
        cat = categorize_sfx(filename, loudness)
        
        # Energie profiel (alleen voor langere SFX >2s)
        energy = []
        if info["duration"] > 2:
            energy = get_energy_profile(filepath, info["duration"])
        
        result = {
            "filename": filename,
            "filepath": filepath,
            "duration": round(info["duration"], 2),
            "sample_rate": info["sample_rate"],
            "channels": info["channels"],
            "codec": info["codec"],
            "mean_volume_db": loudness.get("mean_volume_db"),
            "max_volume_db": loudness.get("max_volume_db"),
            "category": cat["category"],
            "tags": cat["tags"],
            "intensity": cat["intensity"],
            "energy_profile": energy,
        }
        
        results.append(result)
        print(f"✓ {info['duration']:.1f}s | {cat['category']} | {cat['intensity']}")
    
    # Sla op
    output_path = os.path.join(OUTPUT_DIR, "sfx-analysis.json")
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)
    
    print(f"\n✅ {len(results)} SFX geanalyseerd → {output_path}")
    return results


def analyze_music_directory():
    """Analyseer alle music tracks"""
    print(f"\n{'='*60}")
    print(f"  MUSIC ANALYSE — {MUSIC_DIR}")
    print(f"{'='*60}\n")
    
    results = []
    files = sorted([f for f in os.listdir(MUSIC_DIR) if f.endswith(('.mp3', '.wav', '.aiff'))])
    
    for i, filename in enumerate(files):
        filepath = os.path.join(MUSIC_DIR, filename)
        print(f"[{i+1}/{len(files)}] {filename}...", end=" ", flush=True)
        
        # Basis info
        info = get_audio_info(filepath)
        
        # Loudness
        loudness = get_loudness(filepath)
        
        # BPM schatting
        bpm = estimate_bpm(filepath, info["duration"])
        
        # Energie profiel
        energy = get_energy_profile(filepath, info["duration"])
        
        # Categorisatie
        cat = categorize_music(filename, info, loudness, bpm)
        
        result = {
            "filename": filename,
            "filepath": filepath,
            "title": cat["title"],
            "artist": cat["artist"],
            "duration": round(info["duration"], 2),
            "sample_rate": info["sample_rate"],
            "channels": info["channels"],
            "codec": info["codec"],
            "mean_volume_db": loudness.get("mean_volume_db"),
            "max_volume_db": loudness.get("max_volume_db"),
            "bpm": cat["bpm"],
            "mood": cat["mood"],
            "genre": cat["genre"],
            "tags": cat["tags"],
            "loopable": cat["loopable"],
            "has_vocals": cat["has_vocals"],
            "energy_profile": energy,
        }
        
        results.append(result)
        print(f"✓ {info['duration']:.1f}s | {cat['mood']} | {cat['genre']} | BPM: {cat['bpm'] or '?'}")
    
    # Sla op
    output_path = os.path.join(OUTPUT_DIR, "music-analysis.json")
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)
    
    print(f"\n✅ {len(results)} tracks geanalyseerd → {output_path}")
    return results


# ══════════════════════════════════════════════════
# DATABASE SEEDER
# ══════════════════════════════════════════════════

def generate_cuid():
    """Genereer een cuid-achtig ID"""
    return "c" + uuid.uuid4().hex[:24]


def seed_database(sfx_results, music_results):
    """Vul de SoundEffect en MusicTrack tabellen"""
    print(f"\n{'='*60}")
    print(f"  DATABASE SEEDEN")
    print(f"{'='*60}\n")
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # ── Leeg bestaande data ──
    cursor.execute("DELETE FROM SoundEffect")
    cursor.execute("DELETE FROM MusicTrack")
    print("Bestaande SFX en Music data verwijderd")
    
    now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z")
    
    # ── Seed SoundEffect ──
    sfx_count = 0
    for sfx in sfx_results:
        try:
            # Maak een leesbare naam van de bestandsnaam
            name = re.sub(r'\.(mp3|wav|mp4|aiff)$', '', sfx["filename"], flags=re.IGNORECASE)
            name = re.sub(r'\(.*?\)', '', name).strip()
            name = re.sub(r'^\d+\s*', '', name).strip()  # Verwijder leading nummers
            if not name:
                name = sfx["filename"]
            
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
                json.dumps({
                    "mean_volume_db": sfx.get("mean_volume_db"),
                    "max_volume_db": sfx.get("max_volume_db"),
                    "energy_profile": sfx.get("energy_profile", [])[:10],  # Max 10 seconden opslaan
                }),
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
                json.dumps(track.get("energy_profile", [])[:60]),  # Max 60 seconden
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
    print("🎵 Audio Analyzer & Database Seeder")
    print("=" * 60)
    
    # Analyseer
    sfx_results = analyze_sfx_directory()
    music_results = analyze_music_directory()
    
    # Seed database
    seed_database(sfx_results, music_results)
    
    # Samenvatting
    print("\n" + "=" * 60)
    print("  SAMENVATTING")
    print("=" * 60)
    
    # SFX per categorie
    sfx_cats = {}
    for s in sfx_results:
        cat = s["category"]
        sfx_cats[cat] = sfx_cats.get(cat, 0) + 1
    
    print(f"\nSFX ({len(sfx_results)} totaal):")
    for cat, count in sorted(sfx_cats.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {count}")
    
    # Music per mood
    music_moods = {}
    for m in music_results:
        mood = m["mood"]
        music_moods[mood] = music_moods.get(mood, 0) + 1
    
    print(f"\nMusic ({len(music_results)} totaal):")
    for mood, count in sorted(music_moods.items(), key=lambda x: -x[1]):
        print(f"  {mood}: {count}")
    
    print("\n✅ Klaar!")
