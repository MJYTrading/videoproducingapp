#!/usr/bin/env python3
"""
Motion Graphics — Quote Card
Large quote with decorative quotation marks, attribution below.
Used when narration references a specific quote from a person/source.
"""
import sys, json, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image, ImageDraw
from shared.colors import get_theme, hex_to_rgba, hex_to_rgb
from shared.fonts import get_font, get_text_size
from shared.grid_background import create_grid_background
from shared.render import render_frames_to_video, ease_out_cubic, clamp


def wrap_text(draw, text, font, max_width):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        test = f"{current} {word}".strip()
        tw, _ = get_text_size(draw, test, font)
        if tw > max_width and current:
            lines.append(current)
            current = word
        else:
            current = test
    if current:
        lines.append(current)
    return lines


def render(params, output_path):
    theme = get_theme(params)
    quote = params.get("quote", "The only limit is your imagination.")
    attribution = params.get("attribution", "")
    accent_color = params.get("accent_color", "#ff4444")
    source = params.get("source", "")
    duration = params.get("duration", 5.0)
    fps = 30
    W, H = 1920, 1080

    total_frames = int(duration * fps)
    accent_rgb = hex_to_rgb(accent_color)

    font_quote = get_font(theme["font_body"], 48)
    font_mark = get_font(theme["font_title"], 180)
    font_attr = get_font(theme["font_body"], 28)
    font_source = get_font(theme["font_body"], 16)

    bg = create_grid_background(W, H, theme)
    text_color = hex_to_rgba(theme["primary_text"], 255)
    sub_color = hex_to_rgba(theme["secondary_text"], 255)

    # Pre-wrap quote
    tmp = ImageDraw.Draw(bg)
    max_text_w = W - 400  # margins for quote marks
    lines = wrap_text(tmp, quote, font_quote, max_text_w)
    line_h = get_text_size(tmp, "Ay", font_quote)[1]
    total_text_h = len(lines) * (line_h + 8)

    frames = []

    for fi in range(total_frames):
        frame = bg.copy()
        draw = ImageDraw.Draw(frame)
        tsec = fi / fps

        # Opening quote mark (0-0.4s)
        mark_t = clamp(tsec / 0.4)
        if mark_t > 0:
            ma = int(80 * ease_out_cubic(mark_t))
            mark_scale = ease_out_cubic(mark_t)
            # Large decorative opening quote mark
            mw, mh = get_text_size(draw, "\u201C", font_mark)
            mx = 120
            my = H // 2 - total_text_h // 2 - mh // 2 - 20
            draw.text((mx, my), "\u201C", fill=(*accent_rgb, ma), font=font_mark)

        # Quote text (staggered per line, 0.2-1.0s)
        base_y = H // 2 - total_text_h // 2
        for i, line in enumerate(lines):
            line_start = 0.2 + i * 0.15
            lt = clamp((tsec - line_start) / 0.5)
            if lt > 0:
                la = int(255 * ease_out_cubic(lt))
                slide = int(20 * (1.0 - ease_out_cubic(lt)))
                lw, lh = get_text_size(draw, line, font_quote)
                draw.text(((W - lw) // 2, base_y + i * (line_h + 8) + slide), line,
                          fill=(*text_color[:3], la), font=font_quote)

        # Closing quote mark
        close_start = 0.2 + len(lines) * 0.15
        close_t = clamp((tsec - close_start) / 0.4)
        if close_t > 0:
            ca = int(80 * ease_out_cubic(close_t))
            mw2, mh2 = get_text_size(draw, "\u201D", font_mark)
            draw.text((W - 120 - mw2, base_y + total_text_h - mh2 // 2), "\u201D",
                      fill=(*accent_rgb, ca), font=font_mark)

        # Accent divider line
        div_start = close_start + 0.2
        div_t = clamp((tsec - div_start) / 0.4)
        if div_t > 0:
            div_ease = ease_out_cubic(div_t)
            div_w = int(80 * div_ease)
            div_y = base_y + total_text_h + 25
            div_x = (W - div_w) // 2
            draw.rounded_rectangle(
                [(div_x, div_y), (div_x + div_w, div_y + 3)],
                radius=1, fill=(*accent_rgb, int(200 * div_ease))
            )

        # Attribution
        if attribution:
            attr_start = div_start + 0.2
            attr_t = clamp((tsec - attr_start) / 0.4)
            if attr_t > 0:
                aa = int(180 * ease_out_cubic(attr_t))
                attr_text = f"— {attribution}"
                aw, ah = get_text_size(draw, attr_text, font_attr)
                attr_y = base_y + total_text_h + 45
                draw.text(((W - aw) // 2, attr_y), attr_text,
                          fill=(*sub_color[:3], aa), font=font_attr)

        # Source
        if source:
            src_t = clamp((tsec - 1.5) / 0.5)
            if src_t > 0:
                sa = int(130 * ease_out_cubic(src_t))
                ssw, ssh = get_text_size(draw, source, font_source)
                draw.text((W - ssw - 30, H - 35), source, fill=(*sub_color[:3], sa), font=font_source)

        frames.append(frame)

    render_frames_to_video(frames, output_path, fps=fps)
    print(f"Rendered quote_card to {output_path}")

if __name__ == "__main__":
    render(json.loads(sys.argv[1]), sys.argv[2])
