import json, subprocess, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))
SRC, T0, T1 = "ClassicT1948.mp4", 160.0, 206.6
DUR = T1 - T0
W, H = 1080, 1920
OUT = "peach_salesman_short.mp4"

# word timings for this clip, re-based to 0
tx = json.load(open("ads_tx.json"))["ClassicT1948"]
words = [dict(w, s=w["s"] - T0, e=w["e"] - T0) for seg in tx for w in seg["words"] if T0 <= w["s"] < T1]

def ts(x):
    x = max(0, x); return f"0:{int(x // 60):02d}:{x % 60:05.2f}"

groups, cur = [], []
for w in words:
    cur.append(w)
    if len(cur) == 3 or w["w"][-1] in ".,?!":
        groups.append(cur); cur = []
if cur: groups.append(cur)

PINK, WHT = r"{\c&HB43CFF&}", r"{\c&HFFFFFF&}"   # BGR
ev = []
for gi, g in enumerate(groups):
    g_end = min(groups[gi + 1][0]["s"] if gi + 1 < len(groups) else DUR, g[-1]["e"] + 0.6)
    for wi, w in enumerate(g):
        s = w["s"]; e = g[wi + 1]["s"] if wi + 1 < len(g) else g_end
        txt = " ".join((PINK if k == wi else WHT) + x["w"].upper().strip(".,") for k, x in enumerate(g))
        pop = r"{\fscx115\fscy115\t(0,80,\fscx100\fscy100)}" if wi == 0 else ""
        ev.append(f"Dialogue: 0,{ts(s)},{ts(e)},Cap,,0,0,0,,{pop}{txt}")

ev.append(f"Dialogue: 1,{ts(0)},{ts(DUR)},Top,,0,0,0,,{{\\fad(150,0)}}1950s SALESMAN SHAVES\\N{{\\c&HB43CFF&}}A PEACH{{\\c&HFFFFFF&}} TO SELL A RAZOR")
ev.append(f"Dialogue: 1,{ts(0)},{ts(DUR)},Src,,0,0,0,,Remington TV commercial, c.1950s · Prelinger Archives (public domain)")

open("clip.ass", "w").write(f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Inter Black,84,&H00FFFFFF,&H00FFFFFF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,7,4,2,60,60,640,1
Style: Top,Inter Black,78,&H00FFFFFF,&H00FFFFFF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,7,4,8,50,50,170,1
Style: Src,Inter Display,26,&H99FFFFFF,&H99FFFFFF,&H99000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,40,40,70,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
""" + "\n".join(ev) + "\n")

fc = (
    "[0:v]setsar=1,split[a][b];"
    f"[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=30:3,eq=brightness=-0.2[bg];"
    f"[b]crop=500:480,scale=w='trunc({W}*(1.0+0.07*t/{DUR:.2f})/2)*2':h=-2:eval=frame,crop={W}:1036,"
    "eq=contrast=1.1,unsharp=5:5:0.6,noise=alls=5:allf=t[fg];"
    "[bg][fg]overlay=0:430,fps=30,ass=clip.ass,fade=t=in:d=0.2,"
    f"fade=t=out:st={DUR - 0.4:.2f}:d=0.4,format=yuv420p[v];"
    f"[0:a]highpass=f=80,afftdn=nf=-25,loudnorm=I=-14:TP=-1.5:LRA=11,afade=t=out:st={DUR - 0.4:.2f}:d=0.4[aud]"
)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(T0), "-t", f"{DUR:.2f}", "-i", SRC,
                "-filter_complex", fc, "-map", "[v]", "-map", "[aud]", "-c:v", "libx264", "-preset", "slow",
                "-crf", "18", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", OUT], check=True)
print("done")
