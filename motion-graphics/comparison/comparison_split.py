#!/usr/bin/env python3
"""
Motion Graphics — Comparison Split v3
- Logo per side (next to heading)
- Bigger, more centered text
- Source/bron bar at bottom
- Custom color per side
- Staggered points
"""
import sys, json, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image, ImageDraw
from shared.colors import get_theme, hex_to_rgba
from shared.fonts import get_font, get_text_size
from shared.grid_background import create_grid_background
from shared.render import render_frames_to_video, ease_out_cubic, clamp


def load_logo(path, size=48):
    try:
        if path and os.path.exists(path):
            img = Image.open(path).convert("RGBA")
            img = img.resize((size, size), Image.LANCZOS)
            return img
    except: pass
    return None


def render(params, output_path):
    theme = get_theme(params)
    title = params.get("title", "")
    left = params.get("left", {})
    right = params.get("right", {})
    conclusion = params.get("conclusion", "")
    source = params.get("source", "")
    duration = params.get("duration", 5.0)
    stagger = params.get("stagger_delay", 0.25)
    fps = 30
    W, H = 1920, 1080

    total_frames = int(duration * fps)
    slide_dur = 0.6
    point_dur = 0.35

    left_color = hex_to_rgba(left.get("color", "#ff4444"), 255)
    right_color = hex_to_rgba(right.get("color", "#4488ff"), 255)
    left_heading = left.get("heading", "")
    right_heading = right.get("heading", "")
    left_points = left.get("points", [])
    right_points = right.get("points", [])
    left_logo = load_logo(left.get("logo_path", ""), 52)
    right_logo = load_logo(right.get("logo_path", ""), 52)

    max_points = max(len(left_points), len(right_points), 1)

    # Dynamic font sizes - BIGGER than v2
    if max_points <= 4:
        pt_size = 28
        pt_spacing = 58
    elif max_points <= 7:
        pt_size = 24
        pt_spacing = 46
    else:
        pt_size = 20
        pt_spacing = 38

    font_title = get_font(theme["font_title"], 52)
    font_heading = get_font(theme["font_title"], 40)
    font_point = get_font(theme["font_body"], pt_size)
    font_conclusion = get_font(theme["font_body"], 24)
    font_source = get_font(theme["font_body"], 16)

    bg = create_grid_background(W, H, theme)
    text_color = hex_to_rgba(theme["primary_text"], 255)
    sub_color = hex_to_rgba(theme["secondary_text"], 255)

    # Layout - more centered
    half = W // 2
    title_h = 100 if title else 0
    source_h = 40 if source else 0
    conclusion_h = 70 if conclusion else 0
    bottom_reserve = source_h + conclusion_h

    # Content area centered vertically
    content_needed = 70 + max_points * pt_spacing  # heading + points
    content_top = max(title_h + 40, (H - content_needed - bottom_reserve) // 2)

    # Horizontal: push content more toward center
    left_x = half - 520  # closer to center than v2
    right_x = half + 80

    frames = []

    for fi in range(total_frames):
        frame = bg.copy()
        draw = ImageDraw.Draw(frame)
        tsec = fi / fps

        # Title
        if title:
            tw, th = get_text_size(draw, title, font_title)
            draw.text(((W - tw) // 2, 45), title, fill=text_color, font=font_title)

        # Divider
        div_t = clamp(tsec / slide_dur)
        div_prog = ease_out_cubic(div_t)
        div_top = content_top - 10
        div_bot = H - bottom_reserve - 20
        div_h = int((div_bot - div_top) * div_prog)
        mid_y = (div_top + div_bot) // 2
        draw.line([(half, mid_y - div_h//2), (half, mid_y + div_h//2)],
                  fill=(*sub_color[:3], 140), width=2)

        # VS badge
        if div_prog > 0.5:
            vs_a = int(255 * min(1, (div_prog - 0.5) * 2))
            vs_font = get_font(theme["font_title"], 22)
            draw.rounded_rectangle(
                [(half - 24, mid_y - 18), (half + 24, mid_y + 18)],
                radius=18, fill=(26, 26, 46, vs_a), outline=(*sub_color[:3], vs_a), width=1
            )
            vw, vh = get_text_size(draw, "VS", vs_font)
            draw.text((half - vw//2, mid_y - vh//2), "VS", fill=(*sub_color[:3], vs_a), font=vs_font)

        # === LEFT SIDE ===
        l_slide = clamp(tsec / slide_dur)
        l_prog = ease_out_cubic(l_slide)
        l_offset = int((1 - l_prog) * -120)
        la = int(255 * l_prog)

        if la > 0:
            # Logo + heading
            logo_offset = 0
            if left_logo and l_prog > 0.3:
                logo_a = min(255, int(255 * (l_prog - 0.3) / 0.7))
                lc = left_logo.copy()
                r2, g2, b2, a2 = lc.split()
                a2 = a2.point(lambda p: int(p * logo_a / 255))
                lc = Image.merge("RGBA", (r2, g2, b2, a2))
                frame.paste(lc, (left_x + l_offset, content_top - 5), lc)
                logo_offset = 60

            draw.text((left_x + l_offset + logo_offset, content_top),
                      left_heading, fill=(*left_color[:3], la), font=font_heading)
            hw, hh = get_text_size(draw, left_heading, font_heading)
            draw.rectangle(
                [(left_x + l_offset + logo_offset, content_top + hh + 8),
                 (left_x + l_offset + logo_offset + hw, content_top + hh + 12)],
                fill=(*left_color[:3], la)
            )

        # Left points
        for i, pt in enumerate(left_points):
            pt_start = slide_dur + i * stagger
            pt_t = clamp((tsec - pt_start) / point_dur)
            if pt_t <= 0: continue
            pt_prog = ease_out_cubic(pt_t)
            pa = int(255 * pt_prog)
            py = content_top + 70 + i * pt_spacing

            draw.rounded_rectangle(
                [(left_x, py + 6), (left_x + 12, py + 18)],
                radius=3, fill=(*left_color[:3], pa)
            )
            draw.text((left_x + 22, py), pt, fill=(*text_color[:3], pa), font=font_point)

        # === RIGHT SIDE ===
        r_slide = clamp(tsec / slide_dur)
        r_prog = ease_out_cubic(r_slide)
        r_offset = int((1 - r_prog) * 120)
        ra = int(255 * r_prog)

        if ra > 0:
            logo_offset_r = 0
            if right_logo and r_prog > 0.3:
                logo_a = min(255, int(255 * (r_prog - 0.3) / 0.7))
                rc = right_logo.copy()
                r2, g2, b2, a2 = rc.split()
                a2 = a2.point(lambda p: int(p * logo_a / 255))
                rc = Image.merge("RGBA", (r2, g2, b2, a2))
                frame.paste(rc, (right_x + r_offset, content_top - 5), rc)
                logo_offset_r = 60

            draw.text((right_x + r_offset + logo_offset_r, content_top),
                      right_heading, fill=(*right_color[:3], ra), font=font_heading)
            hw2, hh2 = get_text_size(draw, right_heading, font_heading)
            draw.rectangle(
                [(right_x + r_offset + logo_offset_r, content_top + hh2 + 8),
                 (right_x + r_offset + logo_offset_r + hw2, content_top + hh2 + 12)],
                fill=(*right_color[:3], ra)
            )

        # Right points
        for i, pt in enumerate(right_points):
            pt_start = slide_dur + i * stagger
            pt_t = clamp((tsec - pt_start) / point_dur)
            if pt_t <= 0: continue
            pt_prog = ease_out_cubic(pt_t)
            pa = int(255 * pt_prog)
            py = content_top + 70 + i * pt_spacing

            draw.rounded_rectangle(
                [(right_x, py + 6), (right_x + 12, py + 18)],
                radius=3, fill=(*right_color[:3], pa)
            )
            draw.text((right_x + 22, py), pt, fill=(*text_color[:3], pa), font=font_point)

        # Conclusion bar
        if conclusion:
            all_pts = max(len(left_points), len(right_points))
            conc_start = slide_dur + all_pts * stagger + 0.3
            conc_t = clamp((tsec - conc_start) / 0.5)
            if conc_t > 0:
                ca = int(255 * ease_out_cubic(conc_t))
                cy = H - bottom_reserve
                draw.rectangle([(0, cy), (W, cy + conclusion_h)],
                               fill=(0, 0, 0, int(180 * ease_out_cubic(conc_t))))
                cw, ch = get_text_size(draw, conclusion, font_conclusion)
                draw.text(((W - cw)//2, cy + (conclusion_h - ch)//2),
                          conclusion, fill=(*text_color[:3], ca), font=font_conclusion)

        # Source bar (always at very bottom, subtle)
        if source:
            src_t = clamp((tsec - 0.5) / 0.5)
            if src_t > 0:
                sa = int(150 * ease_out_cubic(src_t))
                sw, sh = get_text_size(draw, source, font_source)
                draw.text((W - sw - 30, H - source_h + 8), source,
                          fill=(*sub_color[:3], sa), font=font_source)

        frames.append(frame)

    render_frames_to_video(frames, output_path, fps=fps)
    print(f"Rendered comparison_split to {output_path}")

if __name__ == "__main__":
    render(json.loads(sys.argv[1]), sys.argv[2])
