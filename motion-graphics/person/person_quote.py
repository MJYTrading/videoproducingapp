#!/usr/bin/env python3
"""
Motion Graphics — Person Quote
Portrait on one side, typewriter quote on the other.
From reference screenshots: person right, quote left with typewriter effect.
Used when showing who said what.
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
    name = params.get("name", "SPEAKER")
    title_text = params.get("title", "")
    quote = params.get("quote", "This is what I believe to be true.")
    portrait_path = params.get("portrait_path", "")
    accent_color = params.get("accent_color", "#ff4444")
    portrait_side = params.get("portrait_side", "right")
    source = params.get("source", "")
    duration = params.get("duration", 6.0)
    typing_speed = params.get("typing_speed", 0.04)
    fps = 30
    W, H = 1920, 1080

    total_frames = int(duration * fps)
    accent_rgb = hex_to_rgb(accent_color)

    font_quote = get_font(theme["font_body"], 44)
    font_mark = get_font(theme["font_title"], 120)
    font_name = get_font(theme["font_title"], 30)
    font_role = get_font(theme["font_body"], 22)
    font_source = get_font(theme["font_body"], 16)

    bg = create_grid_background(W, H, theme)
    text_color = hex_to_rgba(theme["primary_text"], 255)
    sub_color = hex_to_rgba(theme["secondary_text"], 255)

    # Layout
    portrait_w = 500
    portrait_h = H - 80
    split_x = W - portrait_w - 40 if portrait_side == "right" else portrait_w + 40

    portrait = load_portrait(portrait_path, portrait_w, portrait_h)
    if not portrait:
        initials = "".join(w[0] for w in name.split()[:2]).upper()
        portrait = create_portrait_placeholder(portrait_w, portrait_h, accent_color, initials)

    # Pre-wrap quote
    tmp = ImageDraw.Draw(bg)
    quote_area_w = split_x - 160 if portrait_side == "right" else W - split_x - 160
    quote_lines = wrap_text(tmp, quote, font_quote, quote_area_w)
    line_h = get_text_size(tmp, "Ay", font_quote)[1] + 10
    total_quote_h = len(quote_lines) * line_h

    total_chars = len(quote)
    typing_start = 0.6

    frames = []

    for fi in range(total_frames):
        frame = bg.copy()
        draw = ImageDraw.Draw(frame)
        tsec = fi / fps

        # Portrait slide in (0-0.5s)
        slide_t = clamp(tsec / 0.5)
        slide_ease = ease_out_cubic(slide_t)

        if portrait_side == "right":
            p_target_x = W - portrait_w - 20
            p_start_x = W + 20
            quote_x = 100
        else:
            p_target_x = 20
            p_start_x = -portrait_w - 20
            quote_x = split_x + 60

        px = int(p_start_x + (p_target_x - p_start_x) * slide_ease)
        py = 40

        p_alpha = int(255 * min(1.0, slide_t * 2))
        port = portrait.copy()
        r, g, b, a = port.split()
        a = a.point(lambda p: int(p * p_alpha / 255))
        port = Image.merge("RGBA", (r, g, b, a))
        frame.paste(port, (px, py), port)

        # Portrait border
        if slide_t > 0.2:
            ba = int(180 * min(1.0, (slide_t - 0.2) * 2))
            draw.rounded_rectangle(
                [(px - 3, py - 3), (px + portrait_w + 3, py + portrait_h + 3)],
                radius=8, outline=(*accent_rgb, ba), width=4
            )

        # Name tag on portrait (bottom, over portrait)
        name_t = clamp((tsec - 0.4) / 0.3)
        if name_t > 0:
            na = int(255 * ease_out_cubic(name_t))
            nw, nh = get_text_size(draw, name, font_name)
            tag_w = nw + 30
            tag_h = nh + 10
            tag_x = px + portrait_w // 2 - tag_w // 2
            tag_y = py + portrait_h - tag_h - 15

            draw.rounded_rectangle(
                [(tag_x, tag_y), (tag_x + tag_w, tag_y + tag_h)],
                radius=4, fill=(10, 10, 20, int(200 * ease_out_cubic(name_t)))
            )
            draw.rounded_rectangle(
                [(tag_x, tag_y), (tag_x + 4, tag_y + tag_h)],
                radius=1, fill=(*accent_rgb, na)
            )
            draw.text((tag_x + 15, tag_y + 5), name,
                      fill=(255, 255, 255, na), font=font_name)

            # Role below name tag
            if title_text:
                rt = clamp((tsec - 0.5) / 0.3)
                if rt > 0:
                    ra = int(160 * ease_out_cubic(rt))
                    rw, rh = get_text_size(draw, title_text, font_role)
                    draw.text((px + portrait_w // 2 - rw // 2, tag_y - rh - 5),
                              title_text, fill=(*sub_color[:3], ra), font=font_role)

        # Opening quote mark (0.3-0.6s)
        mark_t = clamp((tsec - 0.3) / 0.3)
        if mark_t > 0:
            ma = int(60 * ease_out_cubic(mark_t))
            mw, mh = get_text_size(draw, "\u201C", font_mark)
            quote_base_y = H // 2 - total_quote_h // 2 - 20
            draw.text((quote_x - 20, quote_base_y - mh // 2 - 10), "\u201C",
                      fill=(*accent_rgb, ma), font=font_mark)

        # Typewriter quote (0.6s+)
        if tsec >= typing_start:
            n_chars = min(total_chars, int((tsec - typing_start) / typing_speed))
        else:
            n_chars = 0

        quote_base_y = H // 2 - total_quote_h // 2
        chars_used = 0
        cursor_x = quote_x
        cursor_y = quote_base_y

        for li, line in enumerate(quote_lines):
            ly = quote_base_y + li * line_h
            line_len = len(line)

            if chars_used >= n_chars:
                break

            visible_n = min(line_len, n_chars - chars_used)
            visible = line[:visible_n]

            if visible:
                vw, vh = get_text_size(draw, visible, font_quote)
                draw.text((quote_x, ly), visible,
                          fill=(*text_color[:3], 255), font=font_quote)
                cursor_x = quote_x + vw
                cursor_y = ly

            chars_used += line_len
            if chars_used < total_chars:
                chars_used += 1

        # Cursor
        if n_chars > 0:
            if n_chars < total_chars:
                draw.rectangle(
                    [(cursor_x + 4, cursor_y + 4), (cursor_x + 7, cursor_y + line_h - 14)],
                    fill=(*accent_rgb, 230)
                )
            elif int(tsec * 2.5) % 2 == 0:
                draw.rectangle(
                    [(cursor_x + 4, cursor_y + 4), (cursor_x + 7, cursor_y + line_h - 14)],
                    fill=(*accent_rgb, 200)
                )

        # Accent bar left of quote
        bar_t = clamp((tsec - 0.5) / 0.4)
        if bar_t > 0:
            bar_h = int(total_quote_h * ease_out_cubic(bar_t))
            bar_y = quote_base_y + (total_quote_h - bar_h) // 2
            draw.rounded_rectangle(
                [(quote_x - 16, bar_y), (quote_x - 11, bar_y + bar_h)],
                radius=2, fill=(*accent_rgb, int(100 * ease_out_cubic(bar_t)))
            )

        # Source
        if source:
            typing_end = typing_start + total_chars * typing_speed
            src_t = clamp((tsec - typing_end) / 0.5)
            if src_t > 0:
                sa = int(130 * ease_out_cubic(src_t))
                ssw, ssh = get_text_size(draw, source, font_source)
                draw.text((W - ssw - 30, H - 35), source, fill=(*sub_color[:3], sa), font=font_source)

        frames.append(frame)

    render_frames_to_video(frames, output_path, fps=fps)
    print(f"Rendered person_quote to {output_path}")

if __name__ == "__main__":
    render(json.loads(sys.argv[1]), sys.argv[2])
