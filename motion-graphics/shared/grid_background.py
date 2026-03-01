"""Motion Graphics — Grid Background v2 — More visible grid lines"""
from PIL import Image, ImageDraw
from shared.colors import hex_to_rgb, hex_to_rgba

def create_grid_background(width=1920, height=1080, theme=None):
    if theme is None:
        from shared.colors import DEFAULT_THEME
        theme = DEFAULT_THEME
    bg_color = hex_to_rgba(theme["background"], 255)
    img = Image.new("RGBA", (width, height), bg_color)
    draw = ImageDraw.Draw(img)
    
    grid_rgb = hex_to_rgb(theme["grid_color"])
    # Main grid - more visible
    opacity_main = int(theme.get("grid_opacity", 0.3) * 255 * 1.8)  # boost opacity
    grid_main = (*grid_rgb, min(255, opacity_main))
    
    # Sub grid - subtle
    opacity_sub = int(theme.get("grid_opacity", 0.3) * 255 * 0.8)
    grid_sub = (*grid_rgb, min(255, opacity_sub))
    
    spacing = 40
    
    # Sub grid (every 40px, thin)
    for x in range(0, width, spacing):
        draw.line([(x, 0), (x, height)], fill=grid_sub, width=1)
    for y in range(0, height, spacing):
        draw.line([(0, y), (width, y)], fill=grid_sub, width=1)
    
    # Main grid (every 200px, thicker and brighter)
    big_spacing = 200
    bright_rgb = tuple(min(255, c + 30) for c in grid_rgb)
    grid_bright = (*bright_rgb, min(255, opacity_main + 40))
    for x in range(0, width, big_spacing):
        draw.line([(x, 0), (x, height)], fill=grid_bright, width=1)
    for y in range(0, height, big_spacing):
        draw.line([(0, y), (width, y)], fill=grid_bright, width=1)
    
    return img

def create_transparent_background(width=1920, height=1080):
    return Image.new("RGBA", (width, height), (0, 0, 0, 0))
