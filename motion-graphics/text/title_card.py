#!/usr/bin/env python3
"""
Motion Graphics — Title Card
Large centered title with accent underline. Optional subtitle.
Used for chapter intros, topic changes, segment headers.
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
    title = params.get("title", "TITLE")
    subtitle = params.get("subtitle", "")
    accent_color = params.get("accent_color", "#ff4444")
    source = params.get("source", "")
    duration = params.get("duration", 4.0)
    fps = 30
    W, H = 1920, 1080

    total_frames = int(duration * fps)
    accent_rgb = hex_to_rgb(accent_color)

    font_title = get_font(theme["font_title"], 80)
    font_sub = get_font(theme["font_body"], 36)
    font_source = get_font(theme["font_body"], 16)

    bg = create_grid_background(W, H, theme)
    text_color = hex_to_rgba(theme["primary_text"], 255)
    sub_color = hex_to_rgba(theme["secondary_text"], 255)

    # Pre-measure
    tmp = ImageDraw.Draw(bg)
    tw, th = get_text_size(tmp, title, font_title)

    # Multi-line support: split on \n
    lines = title.split("\\n") if "\\n" in title else [title]
    line_heights = []
    line_widths = []
    for line in lines:
        lw, lh = get_text_size(tmp, line, font_title)
        line_heights.append(lh)
        line_widths.append(lw)

    total_text_h = sum(line_heights) + (len(lines) - 1) * 10
    max_line_w = max(line_widths)

    frames = []

    for fi in range(total_frames):
        frame = bg.copy()
        draw = ImageDraw.Draw(frame)
        tsec = fi / fps

        # Title fade in + slide up (0-0.6s)
        title_t = clamp(tsec / 0.6)
        title_ease = ease_out_cubic(title_t)

        if title_t > 0:
            ta = int(255 * title_ease)
            slide = int(30 * (1.0 - title_ease))

            # Center vertically (slightly above middle)
            base_y = H // 2 - total_text_h // 2 - 20 + slide

            y_cursor = base_y
            for i, line in enumerate(lines):
                lw = line_widths[i]
                lh = line_heights[i]
                draw.text(((W - lw) // 2, y_cursor), line,
                          fill=(*text_color[:3], ta), font=font_title)
                y_cursor += lh + 10

            # Accent underline (draws after text, 0.3-0.8s)
            line_t = clamp((tsec - 0.3) / 0.5)
            if line_t > 0:
                line_ease = ease_out_cubic(line_t)
                underline_w = int(max_line_w * 0.6 * line_ease)
                uy = y_cursor + 5 + slide
                ux = (W - underline_w) // 2
                draw.rounded_rectangle(
                    [(ux, uy), (ux + underline_w, uy + 5)],
                    radius=2, fill=(*accent_rgb, int(255 * line_ease))
                )

                # Subtitle (0.6-1.0s)
                if subtitle:
                    sub_t = clamp((tsec - 0.6) / 0.4)
                    if sub_t > 0:
                        sa = int(200 * ease_out_cubic(sub_t))
                        sw, sh = get_text_size(draw, subtitle, font_sub)
                        draw.text(((W - sw) // 2, uy + 25 + slide), subtitle,
                                  fill=(*sub_color[:3], sa), font=font_sub)

        # Source
        if source:
            src_t = clamp((tsec - 1.0) / 0.5)
            if src_t > 0:
                sa = int(130 * ease_out_cubic(src_t))
                ssw, ssh = get_text_size(draw, source, font_source)
                draw.text((W - ssw - 30, H - 35), source, fill=(*sub_color[:3], sa), font=font_source)

        frames.append(frame)

    render_frames_to_video(frames, output_path, fps=fps)
    print(f"Rendered title_card to {output_path}")

if __name__ == "__main__":
    render(json.loads(sys.argv[1]), sys.argv[2])
