"""Assemble the Think Maker promo: segments -> concat -> subtitles + music."""
import pathlib, subprocess, wave

HERE = pathlib.Path(__file__).parent
O = HERE / "out"
SEG = HERE / "seg"; SEG.mkdir(exist_ok=True)
W, H, FPS = 720, 1280, 30

def dur(wav):
    with wave.open(str(O / wav)) as w:
        return w.getnframes() / w.getframerate()

# kind, source, length, clip start, original-audio volume, chip, dubs [(wav, at)], subtitles [(start, end, text)]
SEGMENTS = [
    ("card", "card-open.png", 5.8, 0, 0, None, [("n1.wav", 0.3)],
     [(0.3, 5.6, "以前，孩子下課回家，只會說：\n「不知道，玩電腦。」")]),
    # Every spoken line is the Taiwanese dub timed to the mouth (align.py). The clip's own audio is
    # muted except in `keep` windows that hold only laughter, claps or cheering.
    ("clip", "08-home-share-std.mp4", 7.4, 0, 0, None, [("08-home-share-std.dub.wav", 0)],
     [(0.25, 1.3, "今天學了什麼？"), (1.48, 4.9, "你看！這是我自己做的遊戲！")], [(4.75, 7.4)]),
    ("card", "card-brand.png", 5.2, 0, 0, None, [("n2.wav", 0.3)], []),  # the card itself shows this line
    ("clip", "02-acceptance-card-std.mp4", 7.4, 0, 0, "chip1.png", [("02-acceptance-card-std.dub.wav", 0)],
     [(3.58, 7.2, "先寫驗收卡，AI 才准動工！")]),
    ("clip", "03-teacher-hands-off-std.mp4", 6.6, 0, 0, "chip2.png", [("03-teacher-hands-off-std.dub.wav", 0)],
     [(0.0, 2.6, "看這裡，它哪裡做錯了？"), (4.6, 6.4, "分數沒有加！")]),
    ("clip", "04-debug-pair-std.mp4", 4.0, 0, 0, "chip3.png", [("04-debug-pair-std.dub.wav", 0)],
     [(0.3, 3.8, "紅字是線索，不是責罵！")]),
    # Kids cheering: Pixabay "Kids Cheering" (335547), Pixabay Content License.
    ("clip", "06-highfive-std.mp4", 4.6, 0, 0, None, [("06-highfive-std.dub.wav", 0), ("cheer.mp3", 1.3, 0.55)],
     [(0.15, 2.4, "耶！過關了！")], [(1.95, 4.6)]),
    ("clip", "07-showcase-parents-std.mp4", 4.0, 0, 0, None, [("07-showcase-parents-std.dub.wav", 0)],
     [(0.5, 3.6, "這是我做的，你們試試看！")]),
    ("still", "09-certificate-916.png", 6.2, 0, 0, "chip4.png", [("n3.wav", 0.4)],
     [(0.4, 6.0, "總共 11 堂課，\n孩子會帶走 11 件親手做的作品。")]),
    ("card", "card-end.png", 9.2, 0, 0, None, [("n4.wav", 0.4)], []),  # the card itself shows the class details
]

def run(args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)

def build_segment(i, kind, src, length, ss, vol, chip, dubs, keep=()):
    out = SEG / f"{i:02d}.mp4"
    inputs, filters = [], []
    if kind == "clip":
        inputs += ["-ss", str(ss), "-t", str(length), "-i", str(O / src)]
        filters.append(f"[0:v]scale={W}:{H},fps={FPS},setsar=1[v0]")
        gain = "+".join(f"between(t,{a},{b})" for a, b in keep) if keep else str(vol)
        filters.append(f"[0:a]aresample=48000,aformat=channel_layouts=stereo,volume='{gain}':eval=frame[a0]")
    else:
        # Slow push-in on stills and cards; zoompan needs an upscaled source to stay smooth.
        frames = int(length * FPS)
        zmax = 1.06 if kind == "card" else 1.12
        inputs += ["-loop", "1", "-t", str(length), "-i", str(O / src)]
        filters.append(f"[0:v]scale={W*2}:{H*2},zoompan=z='1+({zmax}-1)*on/{frames}':x='iw/2-(iw/zoom/2)':"
                       f"y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS},setsar=1[v0]")
        inputs += ["-f", "lavfi", "-t", str(length), "-i", "anullsrc=r=48000:cl=stereo"]
        filters.append("[1:a]anull[a0]")
    n = len(inputs) // 2 if kind == "clip" else 2
    idx = 1 if kind == "clip" else 2
    v = "v0"
    if chip:
        inputs += ["-loop", "1", "-t", str(length), "-i", str(O / chip)]
        filters.append(f"[{idx}:v]format=rgba,fade=in:st=0.2:d=0.4:alpha=1[c]")
        filters.append(f"[{v}][c]overlay=(W-w)/2:70[v1]"); v = "v1"; idx += 1
    amix = ["[a0]"]
    for k, (wav, at, *g) in enumerate(dubs):
        inputs += ["-i", str(O / wav)]
        ms = int(at * 1000)
        gain = g[0] if g else 1.0
        filters.append(f"[{idx}:a]aresample=48000,aformat=channel_layouts=stereo,volume={gain},adelay={ms}|{ms}[d{k}]")
        amix.append(f"[d{k}]"); idx += 1
    filters.append(f"{''.join(amix)}amix=inputs={len(amix)}:duration=first:normalize=0,"
                   f"atrim=0:{length},apad=whole_dur={length}[a]")
    run([*inputs, "-filter_complex", ";".join(filters), "-map", f"[{v}]", "-map", "[a]",
         "-t", str(length), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "192k", "-ar", "48000", str(out)])
    return out

def ass_time(t):
    h, rem = divmod(t, 3600); m, s = divmod(rem, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"

def main():
    segs, events, t = [], [], 0.0
    for i, (kind, src, length, ss, vol, chip, dubs, subs, *keep) in enumerate(SEGMENTS):
        segs.append(build_segment(i, kind, src, length, ss, vol, chip, dubs, keep[0] if keep else ()))
        for a, b, text in subs:
            line = text.replace("\n", "\\N")
            events.append(f"Dialogue: 0,{ass_time(t + a)},{ass_time(t + b)},Sub,,0,0,0,,{line}")
        t += length
    total = t
    (SEG / "list.txt").write_text("".join(f"file '{p}'\n" for p in segs))
    run(["-f", "concat", "-safe", "0", "-i", str(SEG / "list.txt"), "-c", "copy", str(SEG / "joined.mp4")])
    ass = HERE / "subs.ass"
    ass.write_text(
        "[Script Info]\nScriptType: v4.00+\nPlayResX: 720\nPlayResY: 1280\nWrapStyle: 0\n\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding\n"
        "Style: Sub,Noto Sans TC Black,46,&H00FFFFFF,&H00FFFFFF,&H001D2A3B,&H64000000,0,0,0,0,100,100,1,0,1,5,2,2,40,40,300,1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        + "\n".join(events) + "\n", encoding="utf-8")
    final = HERE / "thinkmaker-promo-9x16.mp4"
    # Music: Pixabay "Upbeat Happy Music (Funny Cute Ukulele...)" (257919), Pixabay Content License.
    # It ducks under every voice (sidechain on the dialogue/narration track) and swells back in the gaps.
    run(["-i", str(SEG / "joined.mp4"), "-i", str(O / "bgm.mp3"), "-filter_complex",
         f"[0:v]subtitles={ass}:fontsdir={HERE / 'fonts'}[v];"
         f"[0:a]asplit=2[voice][key];"
         f"[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:{total},volume=0.30,"
         f"afade=t=in:d=0.8,afade=t=out:st={total - 2.5}:d=2.5[m0];"
         f"[m0][key]sidechaincompress=threshold=0.02:ratio=6:attack=40:release=450:makeup=1[m];"
         f"[voice][m]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]",
         "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(final)])
    print(f"{final} {total:.1f}s")

if __name__ == "__main__":
    main()
