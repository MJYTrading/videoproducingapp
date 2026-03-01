#!/usr/bin/env python3
"""
Motion Graphics — Map Zoom
Location indicator with pin, city name, and optional subtitle.
Pin drops in, text fades in, subtle pulse on pin.
Used when narration references a specific location.
"""
import sys, json, os, math
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image, ImageDraw
from shared.colors import get_theme, hex_to_rgba, hex_to_rgb
from shared.fonts import get_font, get_text_size
from shared.grid_background import create_grid_background
from shared.render import render_frames_to_video, ease_out_cubic, ease_in_out_cubic, clamp


def render(params, output_path):
    theme = get_theme(params)
    location = params.get("location", "NEW YORK")
    subtitle = params.get("subtitle", "")
    source = params.get("source", "")
    accent_color = params.get("accent_color", "#ff4444")
    duration = params.get("duration", 4.0)
    fps = 30
    W, H = 1920, 1080

    total_frames = int(duration * fps)
    accent_rgb = hex_to_rgb(accent_color)

    font_location = get_font(theme["font_title"], 72)
    font_sub = get_font(theme["font_body"], 32)
    font_source = get_font(theme["font_body"], 16)

    bg = create_grid_background(W, H, theme)
    text_color = hex_to_rgba(theme["primary_text"], 255)
    sub_color = hex_to_rgba(theme["secondary_text"], 255)

    frames = []

    for fi in range(total_frames):
        frame = bg.copy()
        draw = ImageDraw.Draw(frame)
        tsec = fi / fps

        # Pin animation: drops from above (0-0.5s)
        pin_drop = clamp(tsec / 0.5)
        pin_ease = ease_out_cubic(pin_drop)

        # Pin position (center of screen, slightly above middle)
        pin_cx = W // 2
        pin_target_y = H // 2 - 60
        pin_start_y = -100
        pin_y = int(pin_start_y + (pin_target_y - pin_start_y) * pin_ease)

        # Draw pin
        if pin_drop > 0:
            pin_alpha = int(255 * min(1.0, pin_drop * 2))

            # Pin head (circle)
            pin_r = 28
            # Subtle pulse after landing
            if pin_drop >= 1.0:
                pulse = 1.0 + 0.03 * math.sin(tsec * 4)
                pin_r = int(pin_r * pulse)

            draw.ellipse(
                [(pin_cx - pin_r, pin_y - pin_r), (pin_cx + pin_r, pin_y + pin_r)],
                fill=(*accent_rgb, pin_alpha)
            )
            # Inner white dot
            inner_r = pin_r // 3
            draw.ellipse(
                [(pin_cx - inner_r, pin_y - inner_r), (pin_cx + inner_r, pin_y + inner_r)],
                fill=(255, 255, 255, pin_alpha)
            )
            # Pin stem (triangle pointing down)
            stem_h = 35
            draw.polygon([
                (pin_cx - 12, pin_y + pin_r - 5),
                (pin_cx + 12, pin_y + pin_r - 5),
                (pin_cx, pin_y + pin_r + stem_h)
            ], fill=(*accent_rgb, pin_alpha))

            # Ripple effect on landing
            if 0.4 < tsec < 1.2:
                ripple_t = (tsec - 0.4) / 0.8
                ripple_r = int(40 + 80 * ripple_t)
                ripple_a = int(120 * (1.0 - ripple_t))
                ripple_y = pin_y + pin_r + stem_h
                draw.ellipse(
                    [(pin_cx - ripple_r, ripple_y - ripple_r // 3),
                     (pin_cx + ripple_r, ripple_y + ripple_r // 3)],
                    outline=(*accent_rgb, ripple_a), width=2
                )

        # Location text (fades in after pin lands, 0.5-1.0s)
        text_fade = clamp((tsec - 0.5) / 0.5)
        if text_fade > 0:
            ta = int(255 * ease_out_cubic(text_fade))

            # Location name below pin
            lw, lh = get_text_size(draw, location, font_location)
            text_y = pin_target_y + 28 + 35 + 30  # below pin stem + gap
            draw.text(((W - lw) // 2, text_y), location,
                      fill=(*text_color[:3], ta), font=font_location)

            # Accent underline
            line_w = int(lw * ease_out_cubic(text_fade))
            line_y = text_y + lh + 8
            line_x = (W - line_w) // 2
            draw.rounded_rectangle(
                [(line_x, line_y), (line_x + line_w, line_y + 4)],
                radius=2, fill=(*accent_rgb, ta)
            )

            # Subtitle
            if subtitle:
                sub_fade = clamp((tsec - 0.8) / 0.4)
                if sub_fade > 0:
                    sa = int(200 * ease_out_cubic(sub_fade))
                    sw, sh = get_text_size(draw, subtitle, font_sub)
                    draw.text(((W - sw) // 2, line_y + 20), subtitle,
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
    print(f"Rendered map_zoom to {output_path}")

if __name__ == "__main__":
    render(json.loads(sys.argv[1]), sys.argv[2])
