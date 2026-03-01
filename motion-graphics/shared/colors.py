"""Motion Graphics — Color Theme System"""

DEFAULT_THEME = {
    "background": "#1a1a2e",
    "grid_color": "#2a2a3e",
    "grid_opacity": 0.3,
    "primary_text": "#ffffff",
    "accent_color": "#ff4444",
    "secondary_text": "#888888",
    "bar_color": "#ff4444",
    "border_color": "#4488ff",
    "border_glow": True,
    "font_title": "Arial Black",
    "font_body": "Arial",
    "font_numbers": "Arial Black",
}

def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def hex_to_rgba(h, a=255):
    r, g, b = hex_to_rgb(h)
    return (r, g, b, a)

def hex_to_float_rgb(h):
    r, g, b = hex_to_rgb(h)
    return (r/255, g/255, b/255)

def hex_to_float_rgba(h, a=1.0):
    r, g, b = hex_to_float_rgb(h)
    return (r, g, b, a)

def get_theme(params):
    theme = DEFAULT_THEME.copy()
    if "theme" in params and isinstance(params["theme"], dict):
        theme.update(params["theme"])
    return theme
