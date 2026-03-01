#!/usr/bin/env python3
"""
Motion Graphics — Person Splitscreen
Portrait on one side, name/title/info on the other.
Used for interviews, expert introductions, debates.
Portrait slides in from side, text fades in on opposite.
"""
import sys, json, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image, ImageDraw
from shared.colors import get_theme, hex_to_rgba, hex_to_rgb
from shared.fonts import get_font, get_text_size
from shared.grid_background import create_grid_background
from shared.render import render_frames_to_video, ease_out_cubic, ease_in_out_cubic, clamp


def load_portrait(path, w, h):
    try:
        if path and os.path.exists(path):
            img = Image.open(path).convert("RGBA")
            iw, ih = img.size
            ratio = w / h
            ir = iw / ih
            if ir > ratio:
                nw = int(ih * ratio)
                l = (iw - nw) // 2
                img = img.crop((l, 0, l + nw, ih))
            else:
                nh = int(iw / ratio)
                t = (ih - nh) // 2
                img = img.crop((0, t, iw, t + nh))
            return img.resize((w, h), Image.LANCZOS)
    except: pass
    return None


def create_portrait_placeholder(w, h, color_hex, initials=""):
    img = Image.new("RGBA", (w, h), hex_to_rgba(color_hex, 30))
    draw = ImageDraw.Draw(img)
    if initials:
        font = get_font("Arial Black", min(w, h) // 3)
        tw, th = get_text_size(draw, initials, font)
        draw.text(((w-tw)//2, (h-th)//2), initials,
                  fill=hex_to_rgba(color_hex, 100), font=font)
    return img


def render(params, output_path):
    theme = get_theme(params)
    name = params.get("name", "SPEAKER")
    title_text = params.get("title", "")
    organization = params.get("organization", "")
    portrait_path = params.get("portrait_path", "")
    accent_color = params.get("accent_color", "#ff4444")
    portrait_side = params.get("portrait_side", "left")
    source = params.get("source", "")
    duration = params.get("duration", 4.0)
    fps = 30
    W, H = 1920, 1080

    total_frames = int(duration * fps)
    accent_rgb = hex_to_rgb(accent_color)

    font_name = get_font(theme["font_title"], 56)
    font_title = get_font(theme["font_body"], 32)
    font_org = get_font(theme["font_body"], 28)
    font_source = get_font(theme["font_body"], 16)

    bg = create_grid_background(W, H, theme)
    text_color = hex_to_rgba(theme["primary_text"], 255)
    sub_color = hex_to_rgba(theme["secondary_text"], 255)

    # Portrait area: left or right half
    split_x = W // 2
    portrait_w = split_x - 40
    portrait_h = H - 80

    portrait = load_portrait(portrait_path, portrait_w, portrait_h)
    if not portrait:
        initials = "".join(w[0] for w in name.split()[:2]).upper()
        portrait = create_portrait_placeholder(portrait_w, portrait_h, accent_color, initials)

    frames = []

    for fi in range(total_frames):
        frame = bg.copy()
        draw = ImageDraw.Draw(frame)
        tsec = fi / fps

        # Divider line (accent, center)
        div_t = clamp(tsec / 0.4)
        if div_t > 0:
            div_h = int(H * ease_out_cubic(div_t))
            div_y = (H - div_h) // 2
            draw.rounded_rectangle(
                [(split_x - 2, div_y), (split_x + 2, div_y + div_h)],
                radius=2, fill=(*accent_rgb, int(180 * ease_out_cubic(div_t)))
            )

        # Portrait slide in (0-0.5s)
        slide_t = clamp(tsec / 0.5)
        slide_ease = ease_out_cubic(slide_t)

        if portrait_side == "left":
            p_target_x = 20
            p_start_x = -portrait_w - 20
            text_x = split_x + 50
        else:
            p_target_x = split_x + 20
            p_start_x = W + 20
            text_x = 60

        px = int(p_start_x + (p_target_x - p_start_x) * slide_ease)
        py = 40

        # Portrait with alpha
        p_alpha = int(255 * min(1.0, slide_t * 2))
        port = portrait.copy()
        r, g, b, a = port.split()
        a = a.point(lambda p: int(p * p_alpha / 255))
        port = Image.merge("RGBA", (r, g, b, a))
        frame.paste(port, (px, py), port)

        # Portrait border (accent)
        if slide_t > 0.2:
            ba = int(200 * min(1.0, (slide_t - 0.2) * 2))
            # Rounded rectangle border around portrait
            draw.rounded_rectangle(
                [(px - 3, py - 3), (px + portrait_w + 3, py + portrait_h + 3)],
                radius=8, outline=(*accent_rgb, ba), width=4
            )

        # Text side - name (0.3-0.7s)
        name_t = clamp((tsec - 0.3) / 0.4)
        if name_t > 0:
            na = int(255 * ease_out_cubic(name_t))
            slide_y = int(20 * (1.0 - ease_out_cubic(name_t)))

            text_area_w = split_x - 100
            name_y = H // 2 - 70 + slide_y

            # Name
            nw, nh = get_text_size(draw, name, font_name)
            draw.text((text_x, name_y), name,
                      fill=(*text_color[:3], na), font=font_name)

            # Accent underline
            line_w = int(min(nw, text_area_w) * ease_out_cubic(name_t))
            draw.rounded_rectangle(
                [(text_x, name_y + nh + 8), (text_x + line_w, name_y + nh + 13)],
                radius=2, fill=(*accent_rgb, na)
            )

            # Title/role (0.5-0.9s)
            if title_text:
                tt = clamp((tsec - 0.5) / 0.4)
                if tt > 0:
                    ta = int(200 * ease_out_cubic(tt))
                    draw.text((text_x, name_y + nh + 28 + slide_y), title_text,
                              fill=(*sub_color[:3], ta), font=font_title)

            # Organization (0.7-1.1s)
            if organization:
                ot = clamp((tsec - 0.7) / 0.4)
                if ot > 0:
                    oa = int(160 * ease_out_cubic(ot))
                    _, tth = get_text_size(draw, title_text, font_title) if title_text else (0, 0)
                    org_y = name_y + nh + 28 + (tth + 10 if title_text else 0) + slide_y
                    draw.text((text_x, org_y), organization,
                              fill=(*accent_rgb, oa), font=font_org)

        # Source
        if source:
            src_t = clamp((tsec - 1.2) / 0.5)
            if src_t > 0:
                sa = int(130 * ease_out_cubic(src_t))
                ssw, ssh = get_text_size(draw, source, font_source)
                draw.text((W - ssw - 30, H - 35), source, fill=(*sub_color[:3], sa), font=font_source)

        frames.append(frame)

    render_frames_to_video(frames, output_path, fps=fps)
    print(f"Rendered person_splitscreen to {output_path}")

if __name__ == "__main__":
    render(json.loads(sys.argv[1]), sys.argv[2])
