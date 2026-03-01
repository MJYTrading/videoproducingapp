#!/usr/bin/env python3
"""
Motion Graphics — Listicle Good/Bad v4 — Zoom Flow

Two rows: green (good) top, red (bad) bottom.
Zoom flow: full screen item → zoom out to two-row overview → scroll → zoom in next.
Visited items visible, upcoming items faded with ?.
Alternates between good and bad rows.
"""
import sys, json, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
from shared.colors import get_theme, hex_to_rgba, hex_to_rgb
from shared.fonts import get_font, get_text_size
from shared.grid_background import create_grid_background
from shared.render import render_frames_to_video, ease_out_cubic, ease_in_out_cubic, clamp

GOOD_COLOR = "#44cc88"
BAD_COLOR = "#ff4444"


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
    good_items = params.get("good", [])
    bad_items = params.get("bad", [])
    source = params.get("source", "")
    duration = params.get("duration", 12.0)
    zoom_dur = params.get("zoom_duration", 0.5)
    scroll_dur = params.get("scroll_duration", 0.3)
    fps = 30
    W, H = 1920, 1080
    border_w = 7

    good_color = params.get("good_color", GOOD_COLOR)
    bad_color = params.get("bad_color", BAD_COLOR)
    good_label = params.get("good_label", "✓ GOED")
    bad_label = params.get("bad_label", "✗ FOUT")

    n_good = len(good_items)
    n_bad = len(bad_items)
    total_frames = int(duration * fps)

    good_rgb = hex_to_rgb(good_color)
    bad_rgb = hex_to_rgb(bad_color)

    # Overview layout: two rows, max 3 visible, 16:9 cards, centered
    label_h = 28
    gap_y = 10
    gap_x = 8
    margin_x = 10
    max_visible = 3

    avail_w = W - margin_x * 2 - (max_visible - 1) * gap_x
    card_w = avail_w // max_visible
    card_h = int(card_w * 9 / 16)
    content_h = card_h * 2 + label_h * 2 + gap_y
    top_offset = (H - content_h) // 2

    good_label_y = top_offset
    good_row_y = top_offset + label_h
    bad_label_y = good_row_y + card_h + gap_y
    bad_row_y = bad_label_y + label_h

    viewport_w = max_visible * card_w + (max_visible - 1) * gap_x
    viewport_x = (W - viewport_w) // 2

    font_row_label = get_font(theme["font_title"], 22)
    font_num = get_font(theme["font_numbers"], 36)
    font_q = get_font(theme["font_title"], 50)
    font_source = get_font(theme["font_body"], 14)

    bg = create_grid_background(W, H, theme)
    sub_color = hex_to_rgba(theme["secondary_text"], 255)

    # Build unified item sequence: alternate good/bad
    # Display order pairs them: good[0], bad[0], good[1], bad[1], ...
    sequence = []
    for i in range(max(n_good, n_bad)):
        if i < n_good:
            sequence.append(("good", i, good_items[i]))
        if i < n_bad:
            sequence.append(("bad", i, bad_items[i]))

    n_seq = len(sequence)

    # Pre-create thumbnails
    good_thumbs_strip = []
    good_thumbs_faded = []
    good_thumbs_full = []
    for i, item in enumerate(good_items):
        inner_w = card_w - border_w * 2
        inner_h = card_h - border_w * 2
        ts = load_thumbnail(item.get("thumbnail_path",""), inner_w, inner_h)
        if not ts: ts = create_placeholder(inner_w, inner_h, i+1, good_color)
        good_thumbs_strip.append(ts)
        good_thumbs_faded.append(make_faded(ts))
        tf = load_thumbnail(item.get("thumbnail_path",""), W-border_w*2, H-border_w*2)
        if not tf: tf = create_placeholder(W-border_w*2, H-border_w*2, i+1, good_color, show_number=False)
        good_thumbs_full.append(tf)

    bad_thumbs_strip = []
    bad_thumbs_faded = []
    bad_thumbs_full = []
    for i, item in enumerate(bad_items):
        inner_w = card_w - border_w * 2
        inner_h = card_h - border_w * 2
        ts = load_thumbnail(item.get("thumbnail_path",""), inner_w, inner_h)
        if not ts: ts = create_placeholder(inner_w, inner_h, i+1, bad_color)
        bad_thumbs_strip.append(ts)
        bad_thumbs_faded.append(make_faded(ts))
        tf = load_thumbnail(item.get("thumbnail_path",""), W-border_w*2, H-border_w*2)
        if not tf: tf = create_placeholder(W-border_w*2, H-border_w*2, i+1, bad_color, show_number=False)
        bad_thumbs_full.append(tf)

    # Auto-timing
    transition_total = zoom_dur * 2 + scroll_dur
    hold_time = max(0.5, (duration - transition_total * n_seq) / n_seq)
    per_item = hold_time + transition_total

    for si in range(n_seq):
        sequence[si] = (*sequence[si], si * per_item, si * per_item + per_item)
        # (row_type, row_idx, item_data, start_time, end_time)

    visited_good = set()
    visited_bad = set()
    frames = []

    for fi in range(total_frames):
        frame = bg.copy()
        draw = ImageDraw.Draw(frame)
        tsec = fi / fps

        # Determine current state from sequence
        current_si = 0
        phase = "hold"
        zoom = 1.0
        scroll_frac = 0.0
        scroll_from_si = 0
        scroll_to_si = 0

        for si in range(n_seq):
            row_type, row_idx, item_data, st, et = sequence[si]
            nxt_si = si + 1 if si + 1 < n_seq else si

            hold_end = et - zoom_dur * 2 - scroll_dur
            zout_start = hold_end
            zout_end = zout_start + zoom_dur
            scr_start = zout_end
            scr_end = scr_start + scroll_dur
            zin_start = scr_end
            zin_end = et

            if tsec < st:
                continue

            if tsec < st + zoom_dur and si == 0:
                current_si = si
                phase = "zoom_in_first"
                zoom = ease_in_out_cubic((tsec - st) / zoom_dur)
                if row_type == "good": visited_good.add(row_idx)
                else: visited_bad.add(row_idx)
                break
            elif tsec >= st + zoom_dur and tsec < hold_end:
                current_si = si
                phase = "hold"
                zoom = 1.0
                if row_type == "good": visited_good.add(row_idx)
                else: visited_bad.add(row_idx)
                break
            elif tsec >= zout_start and tsec < zout_end:
                current_si = si
                phase = "zoom_out"
                zoom = 1.0 - ease_in_out_cubic((tsec - zout_start) / zoom_dur)
                if row_type == "good": visited_good.add(row_idx)
                else: visited_bad.add(row_idx)
                break
            elif tsec >= scr_start and tsec < scr_end:
                current_si = si
                phase = "scroll"
                zoom = 0.0
                scroll_from_si = si
                scroll_to_si = nxt_si
                scroll_frac = ease_in_out_cubic((tsec - scr_start) / scroll_dur)
                if row_type == "good": visited_good.add(row_idx)
                else: visited_bad.add(row_idx)
                break
            elif tsec >= zin_start and tsec < zin_end:
                current_si = nxt_si
                phase = "zoom_in"
                zoom = ease_in_out_cubic((tsec - zin_start) / zoom_dur)
                if row_type == "good": visited_good.add(row_idx)
                else: visited_bad.add(row_idx)
                nrt, nri = sequence[nxt_si][0], sequence[nxt_si][1]
                if nrt == "good": visited_good.add(nri)
                else: visited_bad.add(nri)
                break
            elif tsec >= et:
                if row_type == "good": visited_good.add(row_idx)
                else: visited_bad.add(row_idx)
                if si == n_seq - 1:
                    current_si = si
                    phase = "hold"
                    zoom = 1.0
                    break
                continue

        cur_row_type, cur_row_idx = sequence[current_si][0], sequence[current_si][1]

        # === DRAW OVERVIEW ===
        if zoom < 0.95:
            oa = int(255 * (1.0 - zoom))

            # Row labels
            draw.rectangle([(0, good_label_y), (W, good_label_y + label_h)], fill=(*good_rgb, int(oa*0.2)))
            glw, glh = get_text_size(draw, good_label, font_row_label)
            draw.text((viewport_x, good_label_y + (label_h-glh)//2), good_label, fill=(*good_rgb, oa), font=font_row_label)

            draw.rectangle([(0, bad_label_y), (W, bad_label_y + label_h)], fill=(*bad_rgb, int(oa*0.2)))
            blw, blh = get_text_size(draw, bad_label, font_row_label)
            draw.text((viewport_x, bad_label_y + (label_h-blh)//2), bad_label, fill=(*bad_rgb, oa), font=font_row_label)

            def draw_overview_row(n_items, row_y, color_rgb, color_hex, visited_set, thumbs_strip_list, thumbs_faded_list, row_type_str):
                for i in range(n_items):
                    if row_type_str == cur_row_type and i == cur_row_idx and zoom > 0.1:
                        continue

                    cx = viewport_x + i * (card_w + gap_x)
                    cy = row_y
                    if cx + card_w < -50 or cx > W + 50:
                        continue

                    is_vis = i in visited_set
                    ia = int(oa * (1.0 if is_vis else 0.5))

                    # Border
                    bc = (*color_rgb, int(ia * (1.0 if is_vis else 0.4)))
                    draw.rounded_rectangle([(cx, cy), (cx+card_w, cy+card_h)], radius=5, fill=bc)

                    # Thumb
                    inner_w2 = card_w - border_w*2
                    inner_h2 = card_h - border_w*2
                    if inner_w2 > 10 and inner_h2 > 10:
                        thumb = thumbs_strip_list[i] if is_vis else thumbs_faded_list[i]
                        t2 = thumb.copy()
                        if ia < 255:
                            r2,g2,b2,a2 = t2.split()
                            a2 = a2.point(lambda p: int(p * ia / 255))
                            t2 = Image.merge("RGBA", (r2,g2,b2,a2))
                        frame.paste(t2, (cx+border_w, cy+border_w), t2)

                    if is_vis:
                        badge = f"#{i+1}"
                        bw2, bh2 = get_text_size(draw, badge, font_num)
                        bx = cx + 5
                        by = cy + card_h - bh2 - 8
                        draw.rounded_rectangle([(bx,by),(bx+bw2+12,by+bh2+6)], radius=4, fill=(*color_rgb, min(255, ia+30)))
                        draw.text((bx+6, by+2), badge, fill=(255,255,255,ia), font=font_num)
                    else:
                        qw, qh = get_text_size(draw, "?", font_q)
                        draw.text((cx+(card_w-qw)//2, cy+(card_h-qh)//2), "?", fill=(255,255,255,int(ia*0.5)), font=font_q)

            draw_overview_row(n_good, good_row_y, good_rgb, good_color, visited_good, good_thumbs_strip, good_thumbs_faded, "good")
            draw_overview_row(n_bad, bad_row_y, bad_rgb, bad_color, visited_bad, bad_thumbs_strip, bad_thumbs_faded, "bad")

            if source and oa > 50:
                sa = int(min(130, oa*0.5))
                ssw, ssh = get_text_size(draw, source, font_source)
                draw.text((W-ssw-16, H-22), source, fill=(*sub_color[:3], sa), font=font_source)

        # === DRAW ACTIVE ITEM (zooming/full screen) ===
        if zoom > 0.05:
            if cur_row_type == "good":
                color_rgb_cur = good_rgb
                thumb_full = good_thumbs_full[cur_row_idx]
                strip_x = viewport_x + cur_row_idx * (card_w + gap_x) + card_w / 2
                strip_y = good_row_y + card_h / 2
            else:
                color_rgb_cur = bad_rgb
                thumb_full = bad_thumbs_full[cur_row_idx]
                strip_x = viewport_x + cur_row_idx * (card_w + gap_x) + card_w / 2
                strip_y = bad_row_y + card_h / 2

            cw = card_w + (W - card_w) * zoom
            ch = card_h + (H - card_h) * zoom
            ccx = strip_x + (W/2 - strip_x) * zoom
            ccy = strip_y + (H/2 - strip_y) * zoom

            x1 = int(ccx - cw/2)
            y1 = int(ccy - ch/2)
            x2 = int(x1 + cw)
            y2 = int(y1 + ch)

            bw_eff = max(1, int(border_w * (1.0 - zoom*0.8)))
            ba = int(255 * max(0.05, 1.0 - zoom*0.8))
            cr = int(5 * (1.0 - zoom*0.9))
            draw.rounded_rectangle([(x1,y1),(x2,y2)], radius=cr, fill=(*color_rgb_cur, ba))

            iw = max(10, int(cw) - bw_eff*2)
            ih = max(10, int(ch) - bw_eff*2)
            resized = thumb_full.resize((iw, ih), Image.LANCZOS)
            frame.paste(resized, (x1+bw_eff, y1+bw_eff), resized)

            if zoom < 0.7:
                badge_a = int(255 * (1.0 - zoom/0.7))
                badge = f"#{cur_row_idx+1}"
                bw3, bh3 = get_text_size(draw, badge, font_num)
                draw.rounded_rectangle([(x1+8, y2-bh3-10),(x1+bw3+20, y2-4)], radius=4, fill=(*color_rgb_cur, min(255, badge_a+30)))
                draw.text((x1+14, y2-bh3-8), badge, fill=(255,255,255,badge_a), font=font_num)

        frames.append(frame)

    render_frames_to_video(frames, output_path, fps=fps)
    print(f"Rendered listicle_goodbad to {output_path}")

if __name__ == "__main__":
    render(json.loads(sys.argv[1]), sys.argv[2])
