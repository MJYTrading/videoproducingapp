"""Motion Graphics — Font Management"""
import os
from PIL import ImageFont

FONT_SEARCH_PATHS = ["/usr/share/fonts/truetype/", "/usr/share/fonts/", "/usr/local/share/fonts/"]
FONT_MAP = {
    "Arial Black": ["arialbd.ttf", "DejaVuSans-Bold.ttf"],
    "Arial": ["arial.ttf", "DejaVuSans.ttf", "LiberationSans-Regular.ttf"],
    "Arial Bold": ["arialbd.ttf", "DejaVuSans-Bold.ttf"],
}
_cache = {}

def _find(name):
    candidates = FONT_MAP.get(name, [name + ".ttf"])
    for sp in FONT_SEARCH_PATHS:
        if not os.path.isdir(sp): continue
        for root, _, files in os.walk(sp):
            for c in candidates:
                for f in files:
                    if f.lower() == c.lower():
                        return os.path.join(root, f)
    return None

def get_font(name, size):
    key = f"{name}_{size}"
    if key in _cache: return _cache[key]
    path = _find(name)
    if path:
        try:
            font = ImageFont.truetype(path, size)
            _cache[key] = font
            return font
        except: pass
    for fb in ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]:
        if os.path.exists(fb):
            try:
                font = ImageFont.truetype(fb, size)
                _cache[key] = font
                return font
            except: pass
    font = ImageFont.load_default()
    _cache[key] = font
    return font

def get_text_size(draw, text, font):
    bbox = draw.textbbox((0, 0), text, font=font)
    return (bbox[2] - bbox[0], bbox[3] - bbox[1])
