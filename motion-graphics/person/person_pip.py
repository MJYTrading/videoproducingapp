#!/usr/bin/env python3
"""
Motion Graphics — Person PiP (Picture-in-Picture)
Circular portrait with name banner below.
Used when introducing a speaker or referencing a person.
Can be overlay (transparent bg) or standalone.
Portrait scales in, name slides in from below.
"""
import sys, json, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image, ImageDraw
from shared.colors import get_theme, hex_to_rgba, hex_to_rgb
from shared.fonts import get_font, get_text_size
from shared.grid_background import create_grid_background
from shared.render import render_frames_to_video, ease_out_cubic, ease_in_out_cubic, clamp


def load_portrait(path, size):
    """Load and crop portrait to circle-ready square."""
    try:
        if path and os.path.exists(path):
            img = Image.open(path).convert("RGBA")
            iw, ih = img.size
            # Center crop to square
            s = min(iw, ih)
            l = (iw - s) // 2
            t = (ih - s) // 2
            img = img.crop((l, t, l + s, t + s))
            return img.resize((size, size), Image.LANCZOS)
    except: pass
    return None


def make_circle_mask(size):
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse([(0, 0), (size, size)], fill=255)
    return mask


def create_portrait_placeholder(size, color_hex, initials=""):
    img = Image.new("RGBA", (size, size), hex_to_rgba(color_hex, 50))
    draw = ImageDraw.Draw(img)
    # Circle background
    draw.ellipse([(0, 0), (size, size)], fill=hex_to_rgba(color_hex, 80))
    if initials:
        font = get_font("Arial Black", size // 3)
        tw, th = get_text_size(draw, initials, font)
        draw.text(((size-tw)//2, (size-th)//2), initials,
                  fill=hex_to_rgba(color_hex, 180), font=font)
    return img


def render(params, output_path):
    theme = get_theme(params)
    name = params.get("name", "SPEAKER")
    title_text = params.get("title", "")  # role/company
    portrait_path = params.get("portrait_path", "")
    accent_color = params.get("accent_color", "#ff4444")
    position = params.get("position", "center")  # center, left, right
    is_overlay = params.get("overlay", False)
    source = params.get("source", "")
    duration = params.get("duration", 4.0)
    fps = 30
    W, H = 1920, 1080

    total_frames = int(duration * fps)
    accent_rgb = hex_to_rgb(accent_color)

    font_name = get_font(theme["font_title"], 36)
    font_title = get_font(theme["font_body"], 24)
    font_source = get_font(theme["font_body"], 16)

    if is_overlay:
        bg = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    else:
        bg = create_grid_background(W, H, theme)

    text_color = hex_to_rgba(theme["primary_text"], 255)
    sub_color = hex_to_rgba(theme["secondary_text"], 255)

    # Portrait
    portrait_size = 320
    portrait = load_portrait(portrait_path, portrait_size)
    if not portrait:
        initials = "".join(w[0] for w in name.split()[:2]).upper()
        portrait = create_portrait_placeholder(portrait_size, accent_color, initials)

    circle_mask = make_circle_mask(portrait_size)

    # Position
    if position == "left":
        cx = W // 4
    elif position == "right":
        cx = W * 3 // 4
    else:
        cx = W // 2
    cy = H // 2 - 40

    frames = []

    for fi in range(total_frames):
        frame = bg.copy()
        draw = ImageDraw.Draw(frame)
        tsec = fi / fps

        # Portrait scale in (0-0.5s)
        scale_t = clamp(tsec / 0.5)
        scale = ease_out_cubic(scale_t)

        if scale > 0.01:
            # Scale portrait
            s = max(1, int(portrait_size * scale))
            scaled = portrait.resize((s, s), Image.LANCZOS)
            mask_scaled = circle_mask.resize((s, s), Image.LANCZOS)

            # Apply alpha based on animation
            alpha = int(255 * min(1.0, scale * 1.5))
            r, g, b, a = scaled.split()
            a = a.point(lambda p: int(p * alpha / 255))
            # Apply circle mask
            a = Image.composite(a, Image.new("L", (s, s), 0), mask_scaled)
            scaled = Image.merge("RGBA", (r, g, b, a))

            px = cx - s // 2
            py = cy - s // 2
            frame.paste(scaled, (px, py), scaled)

            # Circle border (accent)
            border_a = int(255 * scale)
            draw.ellipse(
                [(px - 3, py - 3), (px + s + 3, py + s + 3)],
                outline=(*accent_rgb, border_a), width=4
            )

        # Name banner (slides up, 0.4-0.8s)
        name_t = clamp((tsec - 0.4) / 0.4)
        if name_t > 0:
            name_ease = ease_out_cubic(name_t)
            na = int(255 * name_ease)
            slide = int(20 * (1.0 - name_ease))

            # Name background pill
            nw, nh = get_text_size(draw, name, font_name)
            pill_w = nw + 40
            pill_h = nh + 16
            pill_x = cx - pill_w // 2
            pill_y = cy + portrait_size // 2 + 20 + slide

            draw.rounded_rectangle(
                [(pill_x, pill_y), (pill_x + pill_w, pill_y + pill_h)],
                radius=pill_h // 2, fill=(15, 15, 25, int(200 * name_ease))
            )
            # Accent left edge on pill
            draw.rounded_rectangle(
                [(pill_x, pill_y), (pill_x + 5, pill_y + pill_h)],
                radius=2, fill=(*accent_rgb, na)
            )
            draw.text((pill_x + 20, pill_y + 8), name,
                      fill=(*text_color[:3], na), font=font_name)

            # Title/role below name (0.6-1.0s)
            if title_text:
                title_t = clamp((tsec - 0.6) / 0.4)
                if title_t > 0:
                    ta = int(180 * ease_out_cubic(title_t))
                    tw2, th2 = get_text_size(draw, title_text, font_title)
                    draw.text((cx - tw2 // 2, pill_y + pill_h + 10 + slide),
                              title_text, fill=(*sub_color[:3], ta), font=font_title)

        # Source
        if source and not is_overlay:
            src_t = clamp((tsec - 1.0) / 0.5)
            if src_t > 0:
                sa = int(130 * ease_out_cubic(src_t))
                ssw, ssh = get_text_size(draw, source, font_source)
                draw.text((W - ssw - 30, H - 35), source, fill=(*sub_color[:3], sa), font=font_source)

        frames.append(frame)

    render_frames_to_video(frames, output_path, fps=fps)
    print(f"Rendered person_pip to {output_path}")

if __name__ == "__main__":
    render(json.loads(sys.argv[1]), sys.argv[2])
