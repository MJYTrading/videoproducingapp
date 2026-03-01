"""Motion Graphics — Render Utility v3 (file-based, avoids pipe issues)"""
import subprocess, os, tempfile
from PIL import Image

def render_frames_to_video(frames, output_path, fps=30, duration=None):
    if not frames: raise ValueError("No frames")
    width, height = frames[0].size
    if duration:
        needed = int(duration * fps)
        if len(frames) < needed:
            frames = frames + [frames[-1]] * (needed - len(frames))
        elif len(frames) > needed:
            frames = frames[:needed]
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
    
    # Write raw frames to temp file
    tmp = tempfile.NamedTemporaryFile(suffix='.raw', delete=False)
    try:
        for frame in frames:
            rgb = Image.new("RGB", frame.size, (0, 0, 0))
            if frame.mode == "RGBA":
                rgb.paste(frame, mask=frame.split()[3])
            else:
                rgb = frame.convert("RGB")
            tmp.write(rgb.tobytes())
        tmp.close()
        
        cmd = ["ffmpeg", "-y", "-f", "rawvideo", "-vcodec", "rawvideo",
               "-s", f"{width}x{height}", "-pix_fmt", "rgb24", "-r", str(fps),
               "-i", tmp.name, "-c:v", "libx264", "-pix_fmt", "yuv420p",
               "-preset", "fast", "-crf", "18", "-movflags", "+faststart", output_path]
        result = subprocess.run(cmd, capture_output=True)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg failed: {result.stderr.decode()[:500]}")
    finally:
        os.unlink(tmp.name)
    return output_path

def ease_out_cubic(t):
    return 1 - (1 - t) ** 3

def ease_in_out_cubic(t):
    return 4*t*t*t if t < 0.5 else 1 - (-2*t + 2)**3 / 2

def ease_out_quad(t):
    return 1 - (1 - t) ** 2

def clamp(val, lo=0.0, hi=1.0):
    return max(lo, min(hi, val))
