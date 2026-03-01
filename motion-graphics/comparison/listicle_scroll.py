#!/usr/bin/env python3
"""
Motion Graphics — Listicle Scroll v5

Complete zoom flow with:
1. Strip scrolls to center on active item
2. Zoom in to full screen
3. Hold (B-roll plays)
4. Zoom out to overview
5. Strip scrolls to next item
6. Repeat

Item states:
- VISITED: normal thumbnail, clearly visible (already revealed)
- ACTIVE: zoomed in / full screen
- UPCOMING: darkened/faded, thumbnail obscured (mystery, not yet revealed)

Order: #N (last) → #1 (first)
Timing from orchestrator or auto-distributed.
"""
import sys, json, os, math
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
from shared.colors import get_theme, hex_to_rgba, hex_to_rgb
from shared.fonts import get_font, get_text_size
from shared.grid_background import create_grid_background
from shared.render import render_frames_to_video, ease_out_cubic, ease_in_out_cubic, clamp

ITEM_PALETTE = ["#ff4444","#4488ff","#44cc88","#ffaa00","#cc44cc","#44cccc","#ff8844","#88aa44","#ff44aa","#4444ff"]


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
    except:
        pass
    return None


def create_placeholder(w, h, number, color_hex, show_number=True):
    img = Image.new("RGBA", (w, h), hex_to_rgba(color_hex, 35))
    if show_number:
        draw = ImageDraw.Draw(img)
        font = get_font("Arial Black", min(w, h) // 2)
        text = f"#{number}"
        tw, th = get_text_size(draw, text, font)
        draw.text(((w - tw) // 2, (h - th) // 2), text, fill=hex_to_rgba(color_hex, 120), font=font)
    return img


def make_faded(img, darkness=0.15):
    """Make an image very dark/faded for upcoming unrevealed items."""
    dark = ImageEnhance.Brightness(img).enhance(darkness)
    # Add slight blur to obscure content
    try:
        dark = dark.filter(ImageFilter.GaussianBlur(radius=3))
    except:
        pass
    return dark


def render(params, output_path):
    theme = get_theme(params)
    title = params.get("title", "")
    items = params.get("items", [])
    source = params.get("source", "")
    duration = params.get("duration", 12.0)
    zoom_dur = params.get("zoom_duration", 0.5)
    scroll_dur = params.get("scroll_duration", 0.4)
    fps = 30
    W, H = 1920, 1080
    border_w = 8
    if not items:
        raise ValueError("No items")

    n = len(items)
    total_frames = int(duration * fps)

    # Strip card size in overview
    strip_card_w = 420
    strip_card_h = int(strip_card_w * 9 / 16)  # 236
    strip_gap = 20
    strip_spacing = strip_card_w + strip_gap
    strip_cy = H // 2 + (25 if title else 0)

    font_title = get_font(theme["font_title"], 44)
    font_num = get_font(theme["font_numbers"], 44)
    font_q = get_font(theme["font_title"], 60)
    font_source = get_font(theme["font_body"], 16)

    bg = create_grid_background(W, H, theme)
    text_color = hex_to_rgba(theme["primary_text"], 255)
    sub_color = hex_to_rgba(theme["secondary_text"], 255)

    # Thumbnails — full res for zoom, strip res for overview
    thumbs_full = []
    thumbs_strip = []
    thumbs_strip_faded = []

    for i, item in enumerate(items):
        color = item.get("color", ITEM_PALETTE[i % len(ITEM_PALETTE)])
        inner_w = strip_card_w - border_w * 2
        inner_h = strip_card_h - border_w * 2

        # Full screen thumb
        t_full = load_thumbnail(item.get("thumbnail_path", ""), W - border_w * 2, H - border_w * 2)
        if not t_full:
            t_full = create_placeholder(W - border_w * 2, H - border_w * 2, i + 1, color, show_number=False)
        thumbs_full.append(t_full)

        # Strip thumb (normal)
        t_strip = load_thumbnail(item.get("thumbnail_path", ""), inner_w, inner_h)
        if not t_strip:
            t_strip = create_placeholder(inner_w, inner_h, i + 1, color)
        thumbs_strip.append(t_strip)

        # Strip thumb (faded/dark for upcoming)
        thumbs_strip_faded.append(make_faded(t_strip))

    # Display order: last item first (#N → #1)
    display_order = list(range(n - 1, -1, -1))

    # Auto-timing if not provided
    has_timing = all("start_time" in item for item in items)
    if not has_timing:
        transition_total = zoom_dur * 2 + scroll_dur  # time for zoom_out + scroll + zoom_in
        hold_time = (duration - transition_total * n) / n
        if hold_time < 0.5:
            hold_time = 0.5
        for di, idx in enumerate(display_order):
            st = di * (hold_time + transition_total)
            items[idx]["start_time"] = st
            items[idx]["end_time"] = st + hold_time + transition_total

    # Build transition timeline
    # For each pair of items, we have:
    #   Phase A: HOLD on current item (full screen) — from start_time+zoom_dur to end_time-zoom_dur-scroll_dur
    #   Phase B: ZOOM OUT from current — zoom_dur
    #   Phase C: SCROLL strip to next — scroll_dur
    #   Phase D: ZOOM IN to next — zoom_dur
    #   Then HOLD on next...

    # Track which items have been visited
    visited = set()

    frames = []

    for fi in range(total_frames):
        frame = bg.copy()
        draw = ImageDraw.Draw(frame)
        tsec = fi / fps

        # Determine state
        current_item = display_order[0]
        next_item = display_order[1] if len(display_order) > 1 else display_order[0]
        zoom = 1.0  # 0=overview, 1=full screen
        scroll_from = current_item  # strip centered on this
        scroll_to = current_item
        scroll_frac = 0.0
        phase = "hold"

        for di, idx in enumerate(display_order):
            st = items[idx]["start_time"]
            et = items[idx]["end_time"]
            nxt = display_order[di + 1] if di + 1 < len(display_order) else idx

            # Transition phases at end of this item's time:
            # hold: st → et - zoom_dur - scroll_dur - zoom_dur
            # zoom_out: et - zoom_dur - scroll_dur - zoom_dur → et - scroll_dur - zoom_dur
            # scroll: et - scroll_dur - zoom_dur → et - zoom_dur
            # zoom_in to next: et - zoom_dur → et

            hold_end = et - zoom_dur * 2 - scroll_dur
            zout_start = hold_end
            zout_end = zout_start + zoom_dur
            scroll_start = zout_end
            scroll_end = scroll_start + scroll_dur
            zin_start = scroll_end
            zin_end = et

            if tsec < st:
                continue

            if tsec >= st and tsec < st + zoom_dur and di == 0:
                # First item: zoom in at the very start
                current_item = idx
                phase = "zoom_in_first"
                zoom = ease_in_out_cubic((tsec - st) / zoom_dur)
                scroll_from = idx
                scroll_to = idx
                visited.add(idx)
                break
            elif tsec >= st + zoom_dur and tsec < hold_end:
                # Holding full screen
                current_item = idx
                phase = "hold"
                zoom = 1.0
                visited.add(idx)
                break
            elif tsec >= zout_start and tsec < zout_end:
                # Zooming out
                current_item = idx
                phase = "zoom_out"
                zoom = 1.0 - ease_in_out_cubic((tsec - zout_start) / zoom_dur)
                scroll_from = idx
                scroll_to = idx
                visited.add(idx)
                break
            elif tsec >= scroll_start and tsec < scroll_end:
                # Scrolling strip from current to next
                current_item = idx  # still showing overview
                phase = "scroll"
                zoom = 0.0
                scroll_from = idx
                scroll_to = nxt
                scroll_frac = ease_in_out_cubic((tsec - scroll_start) / scroll_dur)
                visited.add(idx)
                break
            elif tsec >= zin_start and tsec < zin_end:
                # Zooming in to next item
                current_item = nxt
                phase = "zoom_in"
                zoom = ease_in_out_cubic((tsec - zin_start) / zoom_dur)
                scroll_from = nxt
                scroll_to = nxt
                visited.add(idx)
                visited.add(nxt)
                break
            elif tsec >= et:
                visited.add(idx)
                if di == len(display_order) - 1:
                    current_item = idx
                    phase = "hold"
                    zoom = 1.0
                    break
                continue

        # Calculate strip scroll offset
        # Center the strip on the interpolated position between scroll_from and scroll_to
        center_idx_from = scroll_from
        center_idx_to = scroll_to
        center_x = center_idx_from * strip_spacing + (center_idx_to - center_idx_from) * strip_spacing * scroll_frac
        # Strip offset so centered item is at screen center
        strip_offset = W / 2 - strip_card_w / 2 - center_x

        # === DRAW OVERVIEW (when not full screen) ===
        if zoom < 0.95:
            overview_alpha = int(255 * (1.0 - zoom))

            # Title
            if title and overview_alpha > 20:
                tw, th = get_text_size(draw, title, font_title)
                draw.text(((W - tw) // 2, 30), title, fill=(*text_color[:3], overview_alpha), font=font_title)

            # Draw all items in strip
            for i in range(n):
                if i == current_item and zoom > 0.1:
                    continue  # active item drawn separately during zoom

                ix = strip_offset + i * strip_spacing
                iy = strip_cy - strip_card_h // 2

                # Skip if off-screen
                if ix + strip_card_w < -50 or ix > W + 50:
                    continue

                color_hex = items[i].get("color", ITEM_PALETTE[i % len(ITEM_PALETTE)])
                color_rgb = hex_to_rgb(color_hex)

                is_visited = i in visited
                is_upcoming = not is_visited and i != current_item

                if is_upcoming:
                    item_alpha = int(overview_alpha * 0.5)
                else:
                    item_alpha = overview_alpha

                x1, y1 = int(ix), int(iy)
                x2, y2 = x1 + strip_card_w, y1 + strip_card_h

                # Border
                if is_upcoming:
                    border_color = (*color_rgb, int(item_alpha * 0.4))
                else:
                    border_color = (*color_rgb, item_alpha)
                draw.rounded_rectangle([(x1, y1), (x2, y2)], radius=6, fill=border_color)

                # Thumbnail
                inner_w = strip_card_w - border_w * 2
                inner_h = strip_card_h - border_w * 2
                if inner_w > 10 and inner_h > 10:
                    if is_upcoming:
                        thumb = thumbs_strip_faded[i]
                    else:
                        thumb = thumbs_strip[i]
                    resized = thumb.copy()
                    if item_alpha < 255:
                        r2, g2, b2, a2 = resized.split()
                        a2 = a2.point(lambda p: int(p * item_alpha / 255))
                        resized = Image.merge("RGBA", (r2, g2, b2, a2))
                    frame.paste(resized, (x1 + border_w, y1 + border_w), resized)

                # Number badge
                badge = f"#{i + 1}"
                bw2, bh2 = get_text_size(draw, badge, font_num)

                if is_upcoming:
                    # Question mark instead of number for upcoming
                    qw, qh = get_text_size(draw, "?", font_q)
                    qx = x1 + (strip_card_w - qw) // 2
                    qy = y1 + (strip_card_h - qh) // 2
                    draw.text((qx, qy), "?", fill=(255, 255, 255, int(item_alpha * 0.6)), font=font_q)
                else:
                    # Normal badge bottom-left
                    bx = x1 + 5
                    by = y2 - bh2 - 8
                    draw.rounded_rectangle(
                        [(bx, by), (bx + bw2 + 12, by + bh2 + 6)],
                        radius=4, fill=(*color_rgb, min(255, item_alpha + 30))
                    )
                    draw.text((bx + 6, by + 2), badge, fill=(255, 255, 255, item_alpha), font=font_num)

            # Source (overview only)
            if source and overview_alpha > 50:
                sa = int(min(150, overview_alpha * 0.6))
                ssw, ssh = get_text_size(draw, source, font_source)
                draw.text((W - ssw - 30, H - 35), source, fill=(*sub_color[:3], sa), font=font_source)

        # === DRAW ACTIVE ITEM (zooming or full screen) ===
        if zoom > 0.05:
            color_hex = items[current_item].get("color", ITEM_PALETTE[current_item % len(ITEM_PALETTE)])
            color_rgb = hex_to_rgb(color_hex)

            # Interpolate size: strip → full screen
            card_w = strip_card_w + (W - strip_card_w) * zoom
            card_h = strip_card_h + (H - strip_card_h) * zoom

            # Interpolate position: strip position → center
            strip_x = strip_offset + current_item * strip_spacing + strip_card_w / 2
            strip_y = strip_cy
            target_x = W / 2
            target_y = H / 2

            card_cx = strip_x + (target_x - strip_x) * zoom
            card_cy = strip_y + (target_y - strip_y) * zoom

            x1 = int(card_cx - card_w / 2)
            y1 = int(card_cy - card_h / 2)
            x2 = int(x1 + card_w)
            y2 = int(y1 + card_h)

            # Border (fades as we go full screen)
            bw_eff = max(1, int(border_w * (1.0 - zoom * 0.8)))
            border_alpha = int(255 * max(0.05, 1.0 - zoom * 0.8))
            corner_r = int(6 * (1.0 - zoom * 0.9))
            draw.rounded_rectangle(
                [(x1, y1), (x2, y2)],
                radius=corner_r, fill=(*color_rgb, border_alpha)
            )

            # Thumbnail
            inner_w = max(10, int(card_w) - bw_eff * 2)
            inner_h = max(10, int(card_h) - bw_eff * 2)
            resized = thumbs_full[current_item].resize((inner_w, inner_h), Image.LANCZOS)
            frame.paste(resized, (x1 + bw_eff, y1 + bw_eff), resized)

            # Number badge (fades out approaching full screen)
            if zoom < 0.7:
                ba = int(255 * (1.0 - zoom / 0.7))
                badge = f"#{current_item + 1}"
                bw3, bh3 = get_text_size(draw, badge, font_num)
                bx = x1 + 8
                by = y2 - bh3 - 10
                draw.rounded_rectangle(
                    [(bx, by), (bx + bw3 + 12, by + bh3 + 6)],
                    radius=4, fill=(*color_rgb, min(255, ba + 30))
                )
                draw.text((bx + 6, by + 2), badge, fill=(255, 255, 255, ba), font=font_num)

        frames.append(frame)

    render_frames_to_video(frames, output_path, fps=fps)
    print(f"Rendered listicle_scroll to {output_path}")


if __name__ == "__main__":
    render(json.loads(sys.argv[1]), sys.argv[2])
