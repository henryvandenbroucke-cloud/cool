import json, subprocess, os, math

os.chdir(os.path.dirname(os.path.abspath(__file__)))
SRC = "../src"
VO_LEN = 48.35
END = VO_LEN + 0.6
W, H = 1080, 1920

# (start in voiceover, source film, source seconds)
SHOTS = [
    (0.00, "Understa1959", 427), (1.30, "Understa1959", 400), (3.55, "AgeofTur1953", 98),
    (4.60, "AgeofTur1953", 21), (6.00, "ShyGuy1947", 21), (7.40, "ShyGuy1947", 261),
    (8.80, "ShyGuy1947", 548), (10.60, "ShyGuy1947", 240), (12.45, "JuniorPr1946", 728),
    (15.05, "Understa1959", 222), (16.35, "AgeofTur1953", 70), (17.95, "Understa1959", 545),
    (21.00, "JuniorPr1946", 322), (23.20, "JuniorPr1946", 641), (26.65, "AgeofTur1953", 500),
    (27.60, "Understa1959", 632), (30.80, "AgeofTur1953", 301), (32.70, "JuniorPr1946", 1052),
    (34.80, "ShyGuy1947", 680), (36.90, "AgeofTur1953", 445), (39.70, "JuniorPr1946", 803),
    (41.05, "ShyGuy1947", 245), (42.65, "ShyGuy1947", 741), (43.85, "JuniorPr1946", 901),
    (45.30, "JuniorPr1946", 908),
]

def run(cmd):
    subprocess.run(cmd, check=True)

# 1) render each shot as a vertical clip: blurred fill + framed 4:3 footage with slow push-in
os.makedirs("clips", exist_ok=True)
for i, (st, src, t) in enumerate(SHOTS):
    dur = (SHOTS[i + 1][0] if i + 1 < len(SHOTS) else END) - st
    zoom_dir = 1 if i % 2 == 0 else -1
    z = f"(1.04+{0.05 * zoom_dir}*t/{dur:.2f})" if zoom_dir > 0 else f"(1.09-0.05*t/{dur:.2f})"
    fc = (
        f"[0:v]crop=540:480,setsar=1,split[a][b];"
        f"[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=30:3,eq=brightness=-0.18[bg];"
        f"[b]scale=w='trunc({W}*{z}/2)*2':h=-2:eval=frame,crop={W}:960,"
        f"eq=contrast=1.08:saturation=1.05,noise=alls=7:allf=t,vignette=PI/5[fg];"
        f"[bg][fg]overlay=0:400,fps=30,format=yuv420p"
    )
    run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-t", f"{dur:.3f}", "-i", f"{SRC}/{src}.mp4",
         "-filter_complex", fc, "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "17",
         f"clips/{i:02d}.mp4"])

with open("list.txt", "w") as f:
    for i in range(len(SHOTS)):
        f.write(f"file 'clips/{i:02d}.mp4'\n")
run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "video.mp4"])

# 2) captions (ASS): 1-3 word groups, active word highlighted, plus headline overlays
words = json.load(open("words.json"))
for k in range(len(words) - 1):
    if words[k]["w"].lower() == "t" and words[k + 1]["w"].startswith("-"):
        words[k + 1] = {"w": "T" + words[k + 1]["w"], "s": words[k]["s"], "e": words[k + 1]["e"]}
        words[k] = None
words = [w for w in words if w]
def ts(x):
    h = int(x // 3600); m = int(x % 3600 // 60); s = x % 60
    return f"{h}:{m:02d}:{s:05.2f}"

groups, cur = [], []
for w in words:
    cur.append(w)
    if len(cur) == 3 or w["w"][-1] in ".,?!" or (len(cur) >= 2 and len(w["w"]) > 9):
        groups.append(cur); cur = []
if cur: groups.append(cur)

YEL = r"{\c&H00E6FF&}"   # BGR: warm yellow
WHT = r"{\c&HFFFFFF&}"
events = []
for gi, g in enumerate(groups):
    g_end = groups[gi + 1][0]["s"] if gi + 1 < len(groups) else END
    for wi, w in enumerate(g):
        s = w["s"]; e = g[wi + 1]["s"] if wi + 1 < len(g) else g_end
        txt = " ".join((YEL if k == wi else WHT) + x["w"].upper() for k, x in enumerate(g))
        pop = r"{\fscx112\fscy112\t(0,90,\fscx100\fscy100)}" if wi == 0 else ""
        events.append(f"Dialogue: 0,{ts(s)},{ts(e)},Cap,,0,0,0,,{pop}{txt}")

def big(s, e, text, style="Big"):
    events.append(f"Dialogue: 1,{ts(s)},{ts(e)},{style},,0,0,0,,{{\\fad(120,150)\\fscx70\\fscy70\\t(0,160,\\fscx100\\fscy100)}}{text}")

big(0.0, 3.55, r"NOBODY IS\NWATCHING YOU", "Top")
big(12.6, 15.0, r"THEY GUESSED{\c&H00E6FF&}\N50%", "Top")
big(16.4, 17.95, r"REALITY{\c&H00E6FF&}\N23%", "Top")
big(19.2, 21.0, r"THE SPOTLIGHT\N{\c&H00E6FF&}EFFECT", "Top")
big(43.9, END, r"NOBODY'S\N{\c&H00E6FF&}WATCHING", "Top")
events.append(f"Dialogue: 0,0:00:00.00,{ts(END)},Src,,0,0,0,,Footage: Prelinger Archives (public domain) · Study: Gilovich et al., 2000")

ass = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Inter Black,92,&H00FFFFFF,&H00FFFFFF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,7,4,2,60,60,430,1
Style: Top,Inter Black,118,&H00FFFFFF,&H00FFFFFF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,8,5,8,60,60,130,1
Style: Src,Inter Display,26,&H99FFFFFF,&H99FFFFFF,&H99000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,40,40,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
""" + "\n".join(events) + "\n"
open("captions.ass", "w").write(ass)

# 3) music bed: soft synthesized pad (Am - F - C - G), plus low hit on the reveal
chords = [[220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [196.0, 261.63, 329.63], [196.0, 246.94, 293.66]]
parts = []
for ci in range(math.ceil(END / 4)):
    fr = chords[ci % 4]
    expr = "+".join(f"0.12*sin(2*PI*{f}*t)+0.04*sin(2*PI*{f*2}*t)" for f in fr) + f"+0.10*sin(2*PI*{fr[0]/2}*t)"
    run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"aevalsrc={expr}:s=44100:d=4",
         "-af", "afade=t=in:d=0.6,afade=t=out:st=3.2:d=0.8", f"clips/ch{ci}.wav"])
    parts.append(f"clips/ch{ci}.wav")
with open("alist.txt", "w") as f:
    for p in parts: f.write(f"file '{p}'\n")
run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", "alist.txt",
     "-af", f"lowpass=f=1400,aecho=0.8:0.7:120|260:0.35|0.25,atrim=0:{END},afade=t=out:st={END-1.5}:d=1.5", "music.wav"])
run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "aevalsrc=0.9*sin(2*PI*(55-25*t)*t)*exp(-3*t):s=44100:d=1.4", "hit.wav"])

# 4) final mix + burn captions
run(["ffmpeg", "-v", "error", "-y", "-i", "video.mp4", "-i", "vo.mp3", "-i", "music.wav", "-i", "hit.wav",
     "-filter_complex",
     "[1:a]aresample=44100,apad=pad_dur=0.6,asplit[vo][vosc];"
     "[2:a]volume=0.22[mu];[mu][vosc]sidechaincompress=threshold=0.05:ratio=4:attack=20:release=300[duck];"
     "[3:a]adelay=16350|16350,volume=0.6[hit];"
     "[vo][duck][hit]amix=inputs=3:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a];"
     "[0:v]ass=captions.ass,fade=t=in:d=0.25,fade=t=out:st=" + f"{END-0.5}" + ":d=0.5[v]",
     "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-c:a", "aac", "-b:a", "192k",
     "-movflags", "+faststart", "-t", f"{END}", "spotlight_effect_short.mp4"])
print("done")
