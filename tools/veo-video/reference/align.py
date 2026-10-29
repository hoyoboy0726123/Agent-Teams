"""Replace Veo's own speech with Taiwanese-accent TTS, timed to where the mouths move in each clip."""
import json, os, pathlib, re, subprocess, sys, wave
from google import genai
from google.genai import types

HERE = pathlib.Path(__file__).parent
O = HERE / "out"
c = genai.Client(api_key=os.environ["GOOGLE_API_KEY"])

VOICES = {  # speaker -> (Gemini voice, style)
    "dad": ("Charon", "三十多歲的台灣爸爸，溫和好奇"),
    "teacher": ("Kore", "親切的台灣女老師，溫暖地引導"),
    "girl": ("Autonoe", "KID:女生"),
    "girl_cheer": ("Autonoe", "KIDCHEER:女生"),
    "boy": ("Puck", "KID:男生"),
}
# clip -> lines in speaking order: (speaker, text with ｜ at breath pauses, mouth spans in seconds).
# Spans come from the voiced regions of each Veo clip's own audio (silencedetect), not from a model's guess.
CLIPS = {
    "08-home-share-std": [("dad", "今天學了什麼？", [(0.25, 1.12)]),
                          ("boy", "你看！｜這是我自己做的遊戲！", [(1.48, 2.28), (2.71, 4.66)])],
    "02-acceptance-card-std": [("girl", "先寫驗收卡，｜AI 才准動工！", [(3.58, 4.87), (5.23, 6.69)])],
    "03-teacher-hands-off-std": [("teacher", "看這裡，｜它哪裡做錯了？", [(0.0, 0.7), (1.0, 2.05)]),
                                 ("girl", "分數沒有加！", [(4.6, 5.55)])],
    "04-debug-pair-std": [("girl", "紅字是線索，｜不是責罵！", [(0.3, 1.45), (1.8, 2.65)])],
    "06-highfive-std": [("girl_cheer", "耶！過關了！", [(0.15, 1.9)])],
    "07-showcase-parents-std": [("boy", "這是我做的，｜你們試試看！", [(0.5, 1.55), (1.9, 2.85)])],
}

import time
from google.genai import errors

def call(**kw):
    for _ in range(6):
        try:
            time.sleep(6.5)  # gemini-2.5-flash-tts allows 10 requests per minute
            return c.models.generate_content(**kw)
        except errors.ClientError as e:
            if e.code != 429:
                raise
            print("  rate limited, waiting 30s"); time.sleep(30)
    raise RuntimeError("still rate limited")

def sh(*a):
    return subprocess.run(a, check=True, capture_output=True, text=True)

def wav_len(p):
    with wave.open(str(p)) as w:
        return w.getnframes() / w.getframerate()

def timings(clip, lines):
    audio = O / f"{clip}.a.mp3"
    sh("ffmpeg", "-v", "error", "-y", "-i", str(O / f"{clip}.mp4"), "-vn", "-ac", "1", "-ar", "16000", str(audio))
    want = [p for _, t in lines for p in t.split("｜")]
    prompt = (f"這段 8 秒影片音軌裡，人物依序說了這些話（可能用字略有不同）：{json.dumps(want, ensure_ascii=False)}。"
              "請找出每一句實際開口說話的開始與結束秒數（精確到 0.05 秒），只計算說話聲，不含笑聲或環境音。"
              '只輸出 JSON 陣列，例如 [{"i":0,"start":0.4,"end":1.6}]，順序與上面相同。')
    r = c.models.generate_content(model="gemini-3-flash-preview",
                                  contents=[types.Part.from_bytes(data=audio.read_bytes(), mime_type="audio/mp3"), prompt],
                                  config=types.GenerateContentConfig(response_mime_type="application/json"))
    spans = json.loads(r.text)
    return [(float(s["start"]), float(s["end"])) for s in sorted(spans, key=lambda s: s["i"])]

def tts(speaker, text, dst):
    if dst.exists() and dst.stat().st_size > 10000:  # already generated and checked in an earlier run
        return dst
    voice, style = VOICES[speaker]
    # Very short lines come back empty unless the instruction says how short they are.
    if style.startswith("KID"):
        # The style the user picked in the voice audition: everyday Taiwanese schoolkid speech.
        who = style.split(":")[1]
        mood = ("超級興奮、大聲歡呼、音調很高很亮，像剛打贏比賽" if style.startswith("KIDCHEER")
                else "語氣很真實自然，像在教室裡跟同學說話")
        ask = (f"你是在台灣長大的國小四年級{who}，用台灣小朋友平常講話的口語方式說，帶一點台灣腔："
               f"捲舌音輕、尾音輕快上揚、{mood}，不要播音員腔、不要大陸腔。說：{text}")
    else:
        ask = (f"用{style}的聲音、道地台灣腔調，只說這幾個字，語氣驚喜：「{text}」" if len(text) <= 4
               else f"用{style}的聲音、道地台灣腔調，咬字清楚地說：{text}")
    raw = None
    for _ in range(4):
        r = call(
            model="gemini-2.5-flash-preview-tts", contents=ask,
            config=types.GenerateContentConfig(response_modalities=["AUDIO"], speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice)))))
        cand = r.candidates[0] if r.candidates else None
        if not (cand and cand.content and cand.content.parts):
            print("  empty tts, retrying:", text); continue
        pcm = cand.content.parts[0].inline_data.data
        raw = dst.with_suffix(".raw.wav")
        with wave.open(str(raw), "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(pcm)
        heard = c.models.generate_content(model="gemini-3-flash-preview", contents=[
            types.Part.from_bytes(data=raw.read_bytes(), mime_type="audio/wav"), "逐字轉錄（繁體中文），只輸出文字。"]).text
        # 它/他/她 sound identical; don't retry over a transcription choice.
        norm = lambda s: re.sub(r"[他她]", "它", re.sub(r"[^一-鿿A-Za-z0-9]", "", s)).upper()
        if norm(text) in norm(heard) or len(norm(text)) - len(norm(heard)) <= 0 and norm(heard)[:len(norm(text))] == norm(text):
            break
        print("  retry tts:", text, "heard:", heard.strip())
    if raw is None:
        raise RuntimeError(f"TTS returned no audio for {text!r}")
    # Trim leading/trailing silence so the stretch matches only the spoken part.
    sh("ffmpeg", "-v", "error", "-y", "-i", str(raw), "-af",
       "silenceremove=start_periods=1:start_threshold=-40dB,areverse,silenceremove=start_periods=1:start_threshold=-40dB,areverse",
       str(dst))
    return dst

def split_at_pauses(wav_path, n):
    """Cut a line into n pieces at its n-1 longest pauses."""
    out = subprocess.run(["ffmpeg", "-i", str(wav_path), "-af", "silencedetect=noise=-35dB:d=0.08", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", out)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", out)]
    gaps = sorted(zip(starts, ends), key=lambda g: g[1] - g[0], reverse=True)[:n - 1]
    cuts = sorted((a + b) / 2 for a, b in gaps)
    if len(cuts) != n - 1:
        raise RuntimeError(f"could not split {wav_path} into {n}")
    bounds = [0.0, *cuts, wav_len(wav_path)]
    pieces = []
    for k in range(n):
        p = wav_path.with_suffix(f".p{k}.wav")
        sh("ffmpeg", "-v", "error", "-y", "-i", str(wav_path), "-ss", f"{bounds[k]:.3f}", "-to", f"{bounds[k+1]:.3f}", "-af",
           "silenceremove=start_periods=1:start_threshold=-40dB,areverse,silenceremove=start_periods=1:start_threshold=-40dB,areverse", str(p))
        pieces.append(p)
    return pieces

def build(clip, lines):
    print(clip)
    spans = [sp for _, _, sps in lines for sp in sps]
    parts, flat, si = [], [], 0
    for li, (speaker, text, _) in enumerate(lines):
        pieces = text.split("｜")
        whole = tts(speaker, "".join(pieces), O / f"{clip}.l{li}.wav")
        segs = split_at_pauses(whole, len(pieces)) if len(pieces) > 1 else [whole]
        for piece, seg in zip(pieces, segs):
            flat.append((speaker, piece, seg, spans[si])); si += 1
    for k, (speaker, text, seg, (a, b)) in enumerate(flat):
        have, want = wav_len(seg), max(0.4, b - a)
        tempo = min(1.35, max(0.75, have / want))
        fit = O / f"{clip}.l{k}.fit.wav"
        sh("ffmpeg", "-v", "error", "-y", "-i", str(seg), "-af", f"atempo={tempo:.4f}", "-ar", "48000", "-ac", "2", str(fit))
        parts.append((fit, a))
        print(f"  {speaker} {text} at {a:.2f}-{b:.2f}s tts {have:.2f}s tempo {tempo:.2f}")
    inputs, chain = [], []
    for k, (p, a) in enumerate(parts):
        inputs += ["-i", str(p)]
        ms = int(a * 1000)
        chain.append(f"[{k}:a]adelay={ms}|{ms}[p{k}]")
    mix = "".join(f"[p{k}]" for k in range(len(parts)))
    sh("ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex",
       ";".join(chain) + f";{mix}amix=inputs={len(parts)}:normalize=0,apad=whole_dur=8,atrim=0:8[a]",
       "-map", "[a]", "-ar", "48000", "-ac", "2", str(O / f"{clip}.dub.wav"))
    (O / f"{clip}.spans.json").write_text(json.dumps(
        [{"speaker": s, "text": t, "start": a, "end": b} for s, t, _, (a, b) in flat], ensure_ascii=False))

if __name__ == "__main__":
    for clip in sys.argv[1:] or CLIPS:
        if (O / f"{clip}.mp4").exists():
            build(clip, CLIPS[clip])
