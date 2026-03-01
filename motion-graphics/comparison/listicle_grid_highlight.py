#!/usr/bin/env python3
"""
Motion Graphics — Listicle Grid Highlight v3 — Zoom Flow

All items in grid. Zoom flow:
1. Zoom in to active item (full screen)
2. Hold (B-roll)
3. Zoom out to grid overview
4. Zoom in to next item
Visited = visible, upcoming = faded with ?.
"""
import sys, json, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
from shared.colors import get_theme, hex_to_rgba, hex_to_rgb
from shared.fonts import get_font, get_text_size
from shared.grid_background import create_grid_background
from shared.render import render_frames_to_video, ease_out_cubic, ease_in_out_cubic, clamp

ITEM_PALETTE = ["#ff4444","#4488ff","#44cc88","#ffaa00","#cc44cc","#44cccc","#ff8844","#88aa44","#ff44aa","#4444ff"]

GRID_LAYOUTS = {2:(2,1), 3:(3,1), 4:(2,2), 5:(3,2), 6:(3,2), 7:(4,2), 8:(4,2), 9:(3,3), 10:(4,3), 11:(4,3), 12:(4,3)}


def load_thumbnail(path, w, h):
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


def create_placeholder(w, h, number, color_hex, show_number=True):
    img = Image.new("RGBA", (w, h), hex_to_rgba(color_hex, 35))
    if show_number:
        draw = ImageDraw.Draw(img)
        font = get_font("Arial Black", min(w, h) // 2)
        text = f"#{number}"
        tw, th = get_text_size(draw, text, font)
        draw.text(((w-tw)//2, (h-th)//2), text, fill=hex_to_rgba(color_hex, 120), font=font)
    return img


def make_faded(img, darkness=0.15):
    dark = ImageEnhance.Brightness(img).enhance(darkness)
    try: dark = dark.filter(ImageFilter.GaussianBlur(radius=3))
    except: pass
    return dark


def render(params, output_path):
    theme = get_theme(params)
    title = params.get("title", "")
    items = params.get("items", [])
    source = params.get("source", "")
    duration = params.get("duration", 12.0)
    zoom_dur = params.get("zoom_duration", 0.5)
    fps = 30
    W, H = 1920, 1080
    border_w = 6
    if not items: raise ValueError("No items")

    n = len(items)
    total_frames = int(duration * fps)

    # Grid layout
    cols, rows = GRID_LAYOUTS.get(n, (4, 3))
    if n > 12: cols, rows = 5, 3

    margin = 30
    gap = 12
    title_h = 70 if title else 10

    avail_w = W - margin * 2 - (cols - 1) * gap
    avail_h = H - title_h - margin - (rows - 1) * gap - 30
    card_w = avail_w // cols
    card_h = int(card_w * 9 / 16)
    if card_h * rows + (rows - 1) * gap > avail_h:
        card_h = avail_h // rows
        card_w = int(card_h * 16 / 9)

    # Center grid
    grid_w = cols * card_w + (cols - 1) * gap
    grid_h = rows * card_h + (rows - 1) * gap
    grid_x0 = (W - grid_w) // 2
    grid_y0 = title_h + (H - title_h - grid_h) // 2

    font_title = get_font(theme["font_title"], 38)
    font_num = get_font(theme["font_numbers"], min(32, card_h // 5))
    font_q = get_font(theme["font_title"], min(48, card_h // 2))
    font_source = get_font(theme["font_body"], 14)

    bg = create_grid_background(W, H, theme)
    text_color = hex_to_rgba(theme["primary_text"], 255)
    sub_color = hex_to_rgba(theme["secondary_text"], 255)

    # Card positions
    positions = []
    for i in range(n):
        row = i // cols
        col = i % cols
        items_in_row = min(cols, n - row * cols)
        row_offset = (cols - items_in_row) * (card_w + gap) // 2
        x = grid_x0 + col * (card_w + gap) + row_offset
        y = grid_y0 + row * (card_h + gap)
        positions.append((x, y))

    # Thumbnails
    thumbs_grid = []
    thumbs_faded = []
    thumbs_full = []
    for i, item in enumerate(items):
        color = item.get("color", ITEM_PALETTE[i % len(ITEM_PALETTE)])
        inner_w = card_w - border_w * 2
        inner_h = card_h - border_w * 2
        ts = load_thumbnail(item.get("thumbnail_path",""), inner_w, inner_h)
        if not ts: ts = create_placeholder(inner_w, inner_h, i+1, color)
        thumbs_grid.append(ts)
        thumbs_faded.append(make_faded(ts))
        tf = load_thumbnail(item.get("thumbnail_path",""), W-border_w*2, H-border_w*2)
        if not tf: tf = create_placeholder(W-border_w*2, H-border_w*2, i+1, color, show_number=False)
        thumbs_full.append(tf)

    # Auto-timing
    transition_total = zoom_dur * 2
    hold_time = max(0.5, (duration - transition_total * n) / n)
    per_item = hold_time + transition_total

    visited = set()
    frames = []

    for fi in range(total_frames):
        frame = bg.copy()
        draw = ImageDraw.Draw(frame)
        tsec = fi / fps

        current_item = 0
        phase = "hold"
        zoom = 1.0

        for si in range(n):
            st = si * per_item
            et = st + per_item
            nxt = si + 1 if si + 1 < n else si

            hold_end = et - zoom_dur * 2
            zout_start = hold_end
            zout_end = zout_start + zoom_dur
            zin_start = zout_end
            zin_end = et

            if tsec < st: continue

            if tsec < st + zoom_dur and si == 0:
                current_item = si
                phase = "zoom_in_first"
                zoom = ease_in_out_cubic((tsec - st) / zoom_dur)
                visited.add(si)
                break
            elif tsec >= st + zoom_dur and tsec < hold_end:
                current_item = si
                phase = "hold"
                zoom = 1.0
                visited.add(si)
                break
            elif tsec >= zout_start and tsec < zout_end:
                current_item = si
                phase = "zoom_out"
                zoom = 1.0 - ease_in_out_cubic((tsec - zout_start) / zoom_dur)
                visited.add(si)
                break
            elif tsec >= zin_start and tsec < zin_end:
                current_item = nxt
                phase = "zoom_in"
                zoom = ease_in_out_cubic((tsec - zin_start) / zoom_dur)
                visited.add(si)
                visited.add(nxt)
                break
            elif tsec >= et:
                visited.add(si)
                if si == n - 1:
                    current_item = si
                    phase = "hold"
                    zoom = 1.0
                    break
                continue

        # === DRAW OVERVIEW ===
        if zoom < 0.95:
            oa = int(255 * (1.0 - zoom))

            if title:
                tw, th = get_text_size(draw, title, font_title)
                draw.text(((W-tw)//2, 20), title, fill=(*text_color[:3], oa), font=font_title)

            for i in range(n):
                if i == current_item and zoom > 0.1:
                    continue
                px, py = positions[i]
                color_hex = items[i].get("color", ITEM_PALETTE[i % len(ITEM_PALETTE)])
                color_rgb = hex_to_rgb(color_hex)
                is_vis = i in visited

                ia = int(oa * (1.0 if is_vis else 0.5))
                bc = (*color_rgb, int(ia * (1.0 if is_vis else 0.4)))
                draw.rounded_rectangle([(px,py),(px+card_w,py+card_h)], radius=5, fill=bc)

                inner_w2 = card_w - border_w*2
                inner_h2 = card_h - border_w*2
                if inner_w2 > 10 and inner_h2 > 10:
                    thumb = thumbs_grid[i] if is_vis else thumbs_faded[i]
                    t2 = thumb.copy()
                    if ia < 255:
                        r2,g2,b2,a2 = t2.split()
                        a2 = a2.point(lambda p: int(p * ia / 255))
                        t2 = Image.merge("RGBA", (r2,g2,b2,a2))
                    frame.paste(t2, (px+border_w, py+border_w), t2)

                if is_vis:
                    badge = f"#{i+1}"
                    bw2, bh2 = get_text_size(draw, badge, font_num)
                    bx, by = px+5, py+card_h-bh2-8
                    draw.rounded_rectangle([(bx,by),(bx+bw2+12,by+bh2+6)], radius=4, fill=(*color_rgb, min(255,ia+30)))
                    draw.text((bx+6,by+2), badge, fill=(255,255,255,ia), font=font_num)
                else:
                    qw, qh = get_text_size(draw, "?", font_q)
                    draw.text((px+(card_w-qw)//2, py+(card_h-qh)//2), "?", fill=(255,255,255,int(ia*0.5)), font=font_q)

            if source and oa > 50:
                sa = int(min(130, oa*0.5))
                ssw, ssh = get_text_size(draw, source, font_source)
                draw.text((W-ssw-16, H-22), source, fill=(*sub_color[:3], sa), font=font_source)

        # === DRAW ACTIVE ITEM ===
        if zoom > 0.05:
            color_hex = items[current_item].get("color", ITEM_PALETTE[current_item % len(ITEM_PALETTE)])
            color_rgb = hex_to_rgb(color_hex)
            px, py = positions[current_item]

            strip_cx = px + card_w / 2
            strip_cy = py + card_h / 2

            cw = card_w + (W - card_w) * zoom
            ch = card_h + (H - card_h) * zoom
            ccx = strip_cx + (W/2 - strip_cx) * zoom
            ccy = strip_cy + (H/2 - strip_cy) * zoom

            x1 = int(ccx - cw/2)
            y1 = int(ccy - ch/2)
            x2 = int(x1 + cw)
            y2 = int(y1 + ch)

            bw_eff = max(1, int(border_w * (1.0 - zoom*0.8)))
            ba = int(255 * max(0.05, 1.0 - zoom*0.8))
            cr = int(5 * (1.0 - zoom*0.9))
            draw.rounded_rectangle([(x1,y1),(x2,y2)], radius=cr, fill=(*color_rgb, ba))

            iw = max(10, int(cw) - bw_eff*2)
            ih = max(10, int(ch) - bw_eff*2)
            resized = thumbs_full[current_item].resize((iw, ih), Image.LANCZOS)
            frame.paste(resized, (x1+bw_eff, y1+bw_eff), resized)

            if zoom < 0.7:
                badge_a = int(255 * (1.0 - zoom/0.7))
                badge = f"#{current_item+1}"
                bw3, bh3 = get_text_size(draw, badge, font_num)
                draw.rounded_rectangle([(x1+8,y2-bh3-10),(x1+bw3+20,y2-4)], radius=4, fill=(*color_rgb, min(255,badge_a+30)))
                draw.text((x1+14, y2-bh3-8), badge, fill=(255,255,255,badge_a), font=font_num)

        frames.append(frame)

    render_frames_to_video(frames, output_path, fps=fps)
    print(f"Rendered listicle_grid_highlight to {output_path}")

if __name__ == "__main__":
    render(json.loads(sys.argv[1]), sys.argv[2])
