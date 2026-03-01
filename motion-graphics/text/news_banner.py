#!/usr/bin/env python3
"""
Motion Graphics — News Banner (Overlay)
Lower-third breaking news style banner.
Slides in from left, text types in, holds, slides out.
This is an OVERLAY — rendered with transparent background for compositing.
"""
import sys, json, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image, ImageDraw
from shared.colors import get_theme, hex_to_rgba, hex_to_rgb
from shared.fonts import get_font, get_text_size
from shared.grid_background import create_grid_background
from shared.render import render_frames_to_video, ease_out_cubic, ease_in_out_cubic, clamp


def render(params, output_path):
    theme = get_theme(params)
    headline = params.get("headline", "BREAKING NEWS")
    text = params.get("text", "Major development in ongoing story")
    accent_color = params.get("accent_color", "#ff4444")
    duration = params.get("duration", 5.0)
    is_overlay = params.get("overlay", False)
    fps = 30
    W, H = 1920, 1080

    total_frames = int(duration * fps)
    accent_rgb = hex_to_rgb(accent_color)

    font_headline = get_font(theme["font_title"], 24)
    font_text = get_font(theme["font_body"], 32)

    if is_overlay:
        bg = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    else:
        bg = create_grid_background(W, H, theme)

    text_color = hex_to_rgba(theme["primary_text"], 255)

    # Banner dimensions
    banner_h = 80
    banner_y = H - 140
    headline_w = 220

    # Pre-measure text
    tmp = ImageDraw.Draw(bg)
    tw, th = get_text_size(tmp, text, font_text)

    frames = []

    for fi in range(total_frames):
        frame = bg.copy()
        draw = ImageDraw.Draw(frame)
        tsec = fi / fps

        # Slide in (0-0.4s), hold, slide out (last 0.4s)
        slide_in = clamp(tsec / 0.4)
        slide_out = clamp((tsec - (duration - 0.4)) / 0.4)

        if slide_out > 0:
            slide = ease_in_out_cubic(slide_out)
            banner_offset_y = int(200 * slide)
        elif slide_in < 1.0:
            slide = ease_out_cubic(slide_in)
            banner_offset_y = int(200 * (1.0 - slide))
        else:
            banner_offset_y = 0

        by = banner_y + banner_offset_y

        if by < H + 100:
            # Banner background (semi-transparent dark)
            draw.rectangle(
                [(0, by), (W, by + banner_h)],
                fill=(10, 10, 20, 220)
            )

            # Accent stripe left edge
            draw.rectangle(
                [(0, by), (6, by + banner_h)],
                fill=(*accent_rgb, 255)
            )

            # Headline box (accent colored)
            draw.rectangle(
                [(10, by + 5), (10 + headline_w, by + banner_h - 5)],
                fill=(*accent_rgb, 255)
            )
            hw, hh = get_text_size(draw, headline, font_headline)
            draw.text(
                (10 + (headline_w - hw) // 2, by + (banner_h - hh) // 2),
                headline, fill=(255, 255, 255, 255), font=font_headline
            )

            # Text (typewriter effect 0.4-1.5s)
            text_start = 0.4
            if tsec > text_start:
                chars_progress = clamp((tsec - text_start) / 1.0)
                n_chars = int(len(text) * chars_progress)
                visible_text = text[:n_chars]

                if visible_text:
                    tx = 10 + headline_w + 20
                    tw2, th2 = get_text_size(draw, visible_text, font_text)
                    draw.text(
                        (tx, by + (banner_h - th2) // 2),
                        visible_text, fill=(*text_color[:3], 255), font=font_text
                    )

                    # Cursor blink
                    if chars_progress < 1.0 or int(tsec * 3) % 2 == 0:
                        cursor_x = tx + tw2 + 2
                        draw.rectangle(
                            [(cursor_x, by + 20), (cursor_x + 3, by + banner_h - 20)],
                            fill=(*accent_rgb, 200)
                        )

            # Bottom accent line
            draw.rectangle(
                [(0, by + banner_h), (W, by + banner_h + 3)],
                fill=(*accent_rgb, 180)
            )

        frames.append(frame)

    render_frames_to_video(frames, output_path, fps=fps)
    print(f"Rendered news_banner to {output_path}")

if __name__ == "__main__":
    render(json.loads(sys.argv[1]), sys.argv[2])
