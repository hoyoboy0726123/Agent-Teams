"""Think Maker promo: extend square photos to 9:16 with Gemini, then animate them with Veo 3.1 Fast."""
import json, os, sys, time, pathlib
from google import genai
from google.genai import types

HERE = pathlib.Path(__file__).parent
OUT = HERE / "out"; OUT.mkdir(exist_ok=True)
client = genai.Client(api_key=os.environ["GOOGLE_API_KEY"])
LOG = HERE / "spend.jsonl"

def log(kind, **kw):
    with LOG.open("a") as f:
        f.write(json.dumps({"t": time.time(), "kind": kind, **kw}, ensure_ascii=False) + "\n")

def outpaint(name):
    dst = OUT / f"{name}-916.png"
    if dst.exists():
        return dst
    src = (HERE / "photos" / f"{name}.jpg").read_bytes()
    prompt = ("Extend this square photo into a tall 9:16 portrait image. Keep every person, face, pose and "
              "object in the original exactly as they are, centered. Naturally continue the scene above "
              "(ceiling, windows, wall decorations) and below (desk, floor). Same lighting and style. "
              "Do not add any text.")
    r = client.models.generate_content(
        model="gemini-2.5-flash-image",
        contents=[types.Part.from_bytes(data=src, mime_type="image/jpeg"), prompt],
        config=types.GenerateContentConfig(response_modalities=["IMAGE"],
                                           image_config=types.ImageConfig(aspect_ratio="9:16")))
    for p in r.candidates[0].content.parts:
        if p.inline_data:
            dst.write_bytes(p.inline_data.data)
            log("image", name=name, model="gemini-2.5-flash-image", usd=0.039)
            return dst
    raise RuntimeError(f"no image for {name}: {r}")

def veo(name, prompt, seconds=8, tag="", model="veo-3.1-fast-generate-preview", rate=0.10):
    dst = OUT / f"{name}{tag}.mp4"
    if dst.exists():
        return dst
    img = outpaint(name)
    op = client.models.generate_videos(
        model=model,
        prompt=prompt,
        image=types.Image(image_bytes=img.read_bytes(), mime_type="image/png"),
        config=types.GenerateVideosConfig(aspect_ratio="9:16", duration_seconds=seconds, resolution="720p",
                                          negative_prompt="subtitles, captions, on-screen text, watermark, music"))
    t0 = time.time()
    while not op.done:
        time.sleep(10)
        op = client.operations.get(op)
        if time.time() - t0 > 900:
            raise TimeoutError(name)
    if op.error:
        raise RuntimeError(f"{name}: {op.error}")
    vids = (op.response.generated_videos or []) if op.response else []
    if not vids:
        raise RuntimeError(f"{name}: no video returned (maybe filtered): {op.response}")
    client.files.download(file=vids[0].video)
    vids[0].video.save(str(dst))
    log("video", name=name + tag, model=model, seconds=seconds, usd=round(rate * seconds, 2))
    print(f"{name}: {time.time() - t0:.0f}s -> {dst}")
    return dst

if __name__ == "__main__":
    shots = json.loads((HERE / "shots.json").read_text())
    for n in sys.argv[1:]:
        s = shots[n]
        if s.get("model"):
            veo(n, s["prompt"], s.get("seconds", 8), tag=s.get("tag", ""), model=s["model"], rate=s["rate"])
        else:
            veo(n, s["prompt"], s.get("seconds", 8))
