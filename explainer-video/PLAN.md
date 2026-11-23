# Explainer Video: Plan Phase

> **Update (v2):** the format now follows the EverythingProfessor channel: a 10-item catalog, a circle-grid thumbnail, about 10 minutes, voiced by you. See [CHANNEL-RESEARCH.md](CHANNEL-RESEARCH.md) and the final [SCRIPT.md](SCRIPT.md). The Inspection Paradox stays as the hidden link behind half the items, and the reveal at the end is the payoff. Sections below are the original v1 plan, kept for the research and sources.

**Status:** PLAN ONLY. Nothing gets animated, voiced or rendered until you say go.
**Working title:** *The Invisible Law That Makes Your Life Feel Worse Than It Is*
**Runtime:** about 4:15 · 16:9, 1920×1080, 30 fps · plus a 9:16 Short cut from the hook
**Skills used in production:** `iart-ai/explainer-video-skills` (explainer-video, diagram-animation, isometric-animation, whiteboard-animation) + `LottieFiles/motion-design-skill` (motion direction: timing, easing, choreography, the three motion layers)

---

## 1. What the research says about getting views

| Finding | What it means for this video | Source quality |
|---|---|---|
| Most viewer drop-off happens in the opening, and the opening has to pay off the title and thumbnail right away. Retention for the first 30s is commonly put at around 60–70% for a strong hook. | A cold open with no logo, no "hi guys". It hits five relatable frustrations in the first 20s, then states the promise: "one law explains all of these". | Vendor and creator blogs (vidIQ, Uppbeat, Social Media Examiner). The numbers vary between sources. |
| YouTube's Test & Compare picks thumbnails by watch-time share, not CTR alone. A high CTR followed by a fast drop means the thumbnail over-promised. | The thumbnail and title must describe exactly what the video delivers. Curiosity, not clickbait. | Google support page plus Toptal/vidIQ |
| Educational thumbnails lean on short, explanatory text. The title and thumbnail should work as a pair, and the thumbnail should add a hook the title doesn't already say. | Thumbnail text: "NOT BAD LUCK." Title: the law. They are different words that complete each other. | vidIQ, Toptal |
| Education and science have the highest RPM category in one 2026 study (median ≈ $10/1k views). The niche advice everywhere is to go narrow, not broad. | A narrow concept that hits a broad, universal feeling. | Vendor data, so directional only |
| Mid-roll ads need 8+ minutes. Padding to reach 8 minutes hurts retention. | We're making about 4 minutes on purpose: a tight first video, pre-roll and post-roll ads only. Extending to 8+ later is possible (more examples are listed in section 9). | vidIQ, ytshark |
| YouTube's **inauthentic content** policy (renamed July 2025, clarified July 2026) demonetizes generic, repetitive, mass-produced content. Using AI tools is explicitly *not* disqualifying by itself. | An original script, original research with cited sources, and a bespoke visual system. Not a template. Put the sources in the description. | TechCrunch, Tubefilter, Engadget coverage |
| The most-viewed animated channels are overwhelmingly kids' content. Among the explainer giants, Kurzgesagt's biggest videos are body and science "how does X work" topics (COVID-19 explainer ≈ 88M views). | Don't compete head-on with Kurzgesagt-style space or biology. Own the "math of everyday life" lane with a look that isn't theirs. | Wikipedia, Cartoon Brew, Glasp |

## 2. The topic, and why it's unique

### Pick: **The Inspection Paradox** ("why the world feels more crowded, slower and less fair than it is")

One statistical law (length-biased sampling) secretly explains a pile of everyday frustrations:

- your bus is "always" late
- the next lane "always" moves faster
- your class, gym, restaurant and flight are "always" packed
- your friends "always" have more friends (and better lives) than you

**Why it can get views:** every viewer has felt every one of these, so the hook is personal and universal. The payoff is a real "I'm smarter now" moment you can repeat to friends. That's the share trigger.

**Why it hasn't been done:** I searched for an animated YouTube explainer on the inspection paradox and found none. The closest thing is a recorded PyData lecture by Allen Downey (2019). The *friendship paradox* has been covered on its own, by a university clip and many articles. Nobody has pulled all of them together as one law with one visual metaphor. That combined framing is our unique angle.

**The one sentence the viewer should be able to repeat:**
> "You don't experience the average. You experience what you bump into, and big things are easier to bump into."

### Runner-ups (if you'd rather go another way)
1. **"How to predict when anything will end"**: J. Richard Gott's Copernican method. He stood at the Berlin Wall in 1969, gave it a 50% chance of lasting another 2⅔ to 24 years (⅓× to 3× its age of 8 years), and it fell in 1989. It has also drawn real criticism (Caves 2000, Goodman 1993), which gives the video depth. It is less unique, because "Lindy effect" videos exist.
2. **Friends as disease sensors**: the 2009 Harvard flu study expanded into a whole video about using network maths to see the future. It's narrower, and it's already the "twist" act of the main pick.

**Rejected as saturated** (based on my own knowledge of YouTube, not measured): survivorship bias (the WW2 planes), Monty Hall, Benford's law, Simpson's paradox, Braess's paradox, the Mercator map.

## 3. Verified facts the script relies on

| Claim in script | Fact | Source |
|---|---|---|
| Bus example: gaps of 2 and 18 min, average 10, naive wait 5, real wait 8.2 | Renewal theory: E[wait] = E[gap²] / (2·E[gap]) = ((4+324)/2)/(2·10) = 164/20 = **8.2 min**. You land in the 18-min gap 18/20 = **90%** of the time. (My own worked numbers; the formula matches Masuda & Porter's 4/12-min example, 3:20 naive vs 4:24 actual.) | [Masuda & Porter, arXiv 2007.05883](https://arxiv.org/abs/2007.05883), [VanderPlas](https://jakevdp.github.io) |
| Purdue classes: ≈35 average vs ≈93 from the students' side | Downey's analysis of Purdue's 2013–14 class-size data: means of **34.6** (school) and **92.6** (student-sampled) | [Downey, *Probably Overthinking It*, ch. "Relay Races and Revolving Doors"](https://allendowney.github.io/ProbablyOverthinkingIt/inspection.html) |
| Airlines say flights are empty, passengers say they're full, and both are right | Downey's example | [Downey, "The Inspection Paradox is Everywhere"](https://allendowney.substack.com/p/the-inspection-paradox-is-everywhere) |
| Feld 1991: your friends have more friends than you, on average | Friendship paradox (Scott Feld, 1991). Holds for the *mean*. | [Scientific American](https://www.scientificamerican.com/article/math-explains-why-your-friends-are-more-popular-than-you/) |
| On Twitter it held for >98% of users | Hodas, Kooti & Lerman 2013, "Friendship Paradox Redux" | [arXiv 1304.3480](https://arxiv.org/abs/1304.3480) |
| 1999 study: about 70% of drivers judged the next lane faster when it was slightly slower | Redelmeier & Tibshirani, *Nature* 1999: 120 driving students watched a video, 70% said the next lane was faster | [Science News](https://www.sciencenews.org/article/highway-relativity), [ScienceDaily](https://www.sciencedaily.com/releases/1999/08/990830184718.htm) |
| 2009 Harvard flu: friends caught it about 2 weeks earlier | Christakis & Fowler 2010, *PLoS One*: 744 students (319 random plus 425 named friends). Friend group led by about 2 weeks on average. | [PMC2939797](https://pmc.ncbi.nlm.nih.gov/articles/PMC2939797), [Harvard Medical School](https://hms.harvard.edu/news/friendship-paradox-helps-predict-spread-flu) |
| Screening finds slow tumors more often, and screening is judged by deaths prevented, not survival time | Length-time bias. Mortality is the unbiased endpoint. | [NCI](https://www.cancer.gov/about-cancer/screening/research/what-screening-statistics-mean), [Wikipedia: Length time bias](https://en.wikipedia.org/wiki/Length_time_bias) |

**Accuracy guardrails:** say "on average" for the friendship paradox. Phrase the lane claim as a *perception* finding. Keep the screening section factual, with no medical advice. Bostrom (2001) argued the slow lane really is often the slower one, so the script does not claim the next lane is never faster.

## 4. The script (VO, ≈580 words ≈ 4:15 at 2.3 words/s)

Narrative arc follows the explainer-video skill: **Problem → Stakes → Mechanism → How it shows up everywhere → Twist → Payoff.**
**One analogy for the whole video, as the skill requires: *you are a dropped pin.*** Every example reuses it.

```
[01 COLD OPEN · 0:00–0:26 · 57w · brisk]
Your bus is late. The lane next to you is moving faster.
The gym is packed every time you go. Your flight is full.
And your friends? They seem to have more friends than you do.
It feels like bad luck. It isn't.
It's one hidden law of math — and once you see it, you'll see it everywhere.

[02 THE SETUP · 0:26–0:55 · 62w]
Let's start with the bus. The timetable says one comes every ten minutes, on average.
So if you show up at a random moment, you'd expect to wait about five. Half the gap. Simple.
Except real buses bunch up. Say one gap is two minutes, and the next is eighteen.
Still ten on average. So how long do you actually wait?

[03 THE MECHANISM · 0:55–1:42 · 108w · slowest, deliberate]
Picture yourself as a pin, dropped at a random moment on the timeline.
Where does it land? Not evenly between the gaps — it lands where there's more room to land.
The eighteen-minute gap is nine times longer, so you land in it nine times out of ten.
Do the math, and your average wait isn't five minutes. It's eight point two.
The bus company isn't lying — their average is real.
But you don't experience the average gap. You experience the gaps you fall into,
and long gaps are bigger targets.
Mathematicians call this the inspection paradox:
whenever you sample the world by bumping into it, the big things get over-counted.

[04 CLASSROOMS · 1:42–2:08 · 60w]
Take college classes. Using Purdue University's own numbers, the average class has about thirty-five students.
But average it from the students' side, and the typical student's class has about ninety-three.
A three-hundred-seat lecture gets counted by three hundred students. A seminar of ten, by ten.
Both numbers are true. Only one is what it feels like.

[05 PLANES · 2:08–2:24 · 32w]
Airlines and passengers have the same fight.
Airlines see plenty of half-empty flights. Passengers mostly see packed ones —
because a full plane has more passengers on it. Both are right.

[06 FRIENDS · 2:24–2:58 · 75w]
And it gets personal. In 1991, sociologist Scott Feld showed that, on average,
your friends have more friends than you do.
Not because you're unpopular — popular people show up on lots of friend lists, so they get counted over and over.
On Twitter, researchers found it held for more than ninety-eight percent of users.
So your feed is weighted toward the most connected people you know.
No wonder it feels like everyone's doing better than you.

[07 LANES · 2:58–3:16 · 42w · quick]
Even traffic. In a 1999 study, seventy percent of student drivers watching the next lane
judged it faster — when it was actually a little slower.
Cars bunch up when they slow down, so you spend more time being passed than passing.

[08 THE TWIST · 3:16–3:40 · 50w · lift]
But here's the twist: you can use this.
In 2009, Harvard researchers tracked the flu across campus. They picked random students,
then asked each one to name a friend. The friends — more connected — caught the flu about two weeks earlier.
The paradox became an early-warning system.

[09 THE DARK SIDE · 3:40–4:00 · 45w · serious, slower]
It can fool experts too. Cancer screening tends to find slow-growing tumors,
because they spend longer being detectable.
So those patients live longer after diagnosis — partly because of the tumor, not the test.
That's why researchers judge screening by lives saved, not survival time.

[10 PAYOFF · 4:00–4:15+ · 50w · warm, let it breathe]
So the next time something "always" happens to you, ask one question:
am I seeing the average — or am I the pin that landed in the big gap?
The world isn't out to get you. You're just more likely to be where the crowd is.
…Oh, look. Your bus.
```

## 5. Storyboard (scene → visual → which skill does the heavy lifting)

| # | Time | Visual | Key motion | Skill technique |
|---|---|---|---|---|
| 01 | 0:00–0:26 | Five quick vignettes in one continuous camera pan: a person at a bus stop (clock spinning), car in a lane with others zipping by, packed gym, packed plane row, a phone feed full of happy faces. Then everything freezes, desaturates, and one orange pin falls into frame. Title card draws on. | Fast cuts on each stressed word. The freeze is a 6-frame hold. The pin drops with `back.out` squash. | explainer-video (hook pacing), motion-design (Energetic for the montage, then settle), whiteboard (title handwriting) |
| 02 | 0:26–0:55 | A horizontal **timeline strip** with buses as navy ticks, evenly spaced. "Expect: 5 min" counts up. Then the ticks **bunch**: they slide into 2 / 18 / 2 / 18. A label "avg still 10" stays locked. | Ticks slide with ease-in-out. Count-up with easeOutCubic and tabular numbers. | diagram-animation (progressive reveal, count-up) |
| 03 | 0:55–1:42 | **The pin rain.** Dozens of orange pins drop randomly onto the strip. Most land in the long gaps, which glow. A live tally bar fills to 90% for the long gap and 10% for the short one. A wait-time meter counts 5.0 → **8.2**. The formula draws on in handwriting, small, as a margin note. The name "INSPECTION PARADOX" stamps in. | Pins stagger in a wave (30–60ms). Tally bars grow with `scaleY`. The stamp has anticipation (scale 1.15 → 1) and overshoot. | diagram-animation (bars, count-up), whiteboard-animation (formula draw-on), motion-design (one hero motion per beat) |
| 04 | 1:42–2:08 | An **isometric campus**: a few huge lecture halls and many tiny seminar rooms as extruded iso blocks. First a navy "school's view" average (35) sits at the top. Then the pins fall on *students*, the big halls light up, and the orange "students' view" bar (93) overtakes the navy one. | Iso blocks build from the bottom up. Camera drift of a few degrees. Two-bar comparison grows. | isometric-animation (extruded blocks, per-face shading, stack build), diagram-animation |
| 05 | 2:08–2:24 | **Iso plane cabins** side by side: 3 nearly empty and 1 packed. The airline's clipboard says "mostly empty". Pins drop on passengers, and nearly all land in the packed one. | Seats fill with a micro-stagger (20–40ms). | isometric-animation |
| 06 | 2:24–2:58 | A **network graph** of dots. "You" is orange and small. One hub node lights up as it connects to many. Each person's "friends" are highlighted, the hub keeps reappearing, and the average friend count of "your friends" bar beats "you". "98%" counts up. Final beat: the network morphs into a phone feed of faces. | Nodes → edges → labels, in that order. Focus plus context: everything not active dims to 35%. | diagram-animation (node/edge reveal, highlight) |
| 07 | 2:58–3:16 | **Iso highway, top-down**: cars spread out in the fast stretches and bunch up in the slow ones. A timer shows "time spent being passed" vs "passing" (orange outgrows navy). "70%" stamps in. | Looping, linear traffic flow (linear is allowed for continuous flow). Quick cuts. | isometric-animation, diagram-animation (flowing connectors) |
| 08 | 3:16–3:40 | The network returns. The orange "random" group and teal "friends" group get two line charts of flu cases. The teal curve rises **two weeks** earlier, and a gap bracket draws on: "~2 weeks". The colour lifts brighter. | Line chart draw-on (`stroke-dashoffset`). A bracket hand-draws. | diagram-animation (line draw), whiteboard |
| 09 | 3:40–4:00 | Muted palette. A screening timeline: tumors as bars of different lengths (slow = long, fast = short). The periodic "screening" pins catch the long bars and miss the short ones. Caption chip: "judge by lives saved". | Slow, cubic ease-in-out. Sadness/serious mapping from the motion skill: slower and lower. | diagram-animation, motion-design emotion map |
| 10 | 4:00–4:15+ | Callback: the bus stop from scene 01. The orange pin hovers above the timeline, and the viewer's question is handwritten: "Am I the pin in the big gap?" The bus pulls in. End card holds for 2s or more, with the title and a subscribe prompt. | Gentle settle. The bus arrives with follow-through (body leans, then settles). | whiteboard (handwriting), motion-design (Disney follow-through) |

**Captions:** burned in, no more than 2 lines and 42 characters per line, driven from the same timing array as the cuts. Also exported as an `.srt` for upload.

## 6. Art direction ("Paper & Pin")

Built to *not* look like Kurzgesagt (their style is dark, glossy, vector, with blob creatures):

- **Look:** warm risograph-print paper (off-white `#F3EDE2` with a subtle grain), flat geometric people, a small amount of iso depth, and hand-drawn annotations in the margin like a smart friend's notebook.
- **Colour = meaning, never reassigned:**
  - `#FF5A1F` signal orange = **YOU / your experience / the sample**
  - `#1E2A4A` deep navy ink = **reality / the official average**
  - `#2BA59A` teal = **the crowd / others**
  - `#E8B84A` mustard = highlight and emphasis only
  - Scene 09 desaturates everything by about 40% (serious tone)
- **Type:** a heavy grotesk for headlines and numbers (Space Grotesk 700, tabular figures) plus a handwritten face for annotations (Caveat), both from Google Fonts.
- **Motion personality (motion-design skill, one archetype):** **Playful**. Pin drops and stamps use ease-out-back with 10–20% overshoot. Data and holds stay calm. One signature curve covers about 80% of moves: `cubic-bezier(.22,1,.36,1)`. The duration palette is 0.25s / 0.45s / 0.9s.
- **Three motion layers in every scene:** primary (the thing the VO names), secondary (shadows, labels following 50–100ms later), and ambient (paper grain shimmer, slow drifting dust, a 6–12s iso camera drift).
- **Rules carried over from the skills:** nothing dumps in all at once; nodes → edges → labels; no more than 2–3 elements moving at once; no move longer than ⅓ of the screen without a keyframe; linear easing only for continuous flow (traffic, rain).

## 7. Packaging

- **Title A (recommended):** *The Invisible Law That Makes Your Life Feel Worse Than It Is*
- **Title B:** *Why Your Bus Is Always Late (It's Not Bad Luck)*
- **Title C:** *Your Friends Are More Popular Than You. Here's the Math.*
- **Thumbnail:** a paper background with a long orange-glowing gap on a bus timeline, a tiny worried figure at the stop, one orange pin, and huge text "NOT BAD LUCK." Three elements at most, legible at phone size. Made from the video's own assets.
- **Description:** a one-paragraph summary, chapter timestamps (one per scene), and the full source list from section 3.
- **Short (9:16, ≤60s):** scenes 01 to 03, condensed, ending on "8.2 minutes, not 5" and pointing to the full video.

## 8. Production pipeline (phase 2, when you say go)

1. **Lock the script.** Read it aloud and time it, as the skill requires.
2. **Voiceover.** Option A: you record it, which is the most "authentic" for YouTube's policy. Option B: an AI voice through the ElevenLabs connector in this session (uses your ElevenLabs credits; I'd list voices and pick a warm, clear narrator). Then get word-level timestamps by transcription, so cuts and captions lock to the actual audio.
3. **Build scenes** as a **Remotion** project (React, frame-deterministic, which is what the explainer-video skill prescribes for narrated MP4s) using the local Chromium. Each scene is its own component, and the timing array comes from the VO timestamps.
4. **Verify loop, per scene.** Render stills at the start, mid-hold and end, then a contact sheet using the skill's `contact-sheet.sh`. Check sync, clipping, colour grammar and the reveal order. Fix and re-shoot until each scene passes.
5. **Sound.** A soft music bed (lo-fi / plucky) ducked under the VO, plus small SFX: pin "tick", stamp "thunk", paper swish. Generated through ElevenLabs, or royalty-free.
6. **Encode.** 1080p30 H.264 MP4, checked with `probe-mp4.sh`. Plus the `.srt`, the thumbnail PNG, the 9:16 Short, and the description text.
7. **Deliver.** Commit the project to this repo's branch so any line or scene can be re-rendered.

## 9. Risks and notes

- **4 minutes means no mid-rolls.** That's fine for the first upload. If it performs, an 8–10 minute "director's cut" could add the prison-sentence example (Downey/Kerman), restaurants and gyms, the relay-race story, and Bostrom's lane counterpoint.
- **AI voice vs human voice.** Both are allowed. Human narration tends to build more trust and protects better against "inauthentic" flags.
- **Fact risk** is low, because every number in the script is sourced in section 3. The sources go in the description.
- **Render cost:** roughly 7,700 frames. That's feasible here (4 CPUs, ffmpeg, Chromium are available) but will take a while per full render, which is why scenes get verified as stills first.

## 10. Decisions I need from you before phase 2

1. Topic: go with **the Inspection Paradox**, or a runner-up?
2. Voice: **your recording** or an **AI voice** (ElevenLabs, uses your credits)?
3. Style: **Paper & Pin** (above), or something else (e.g. dark neon, or a pure whiteboard-scribe look)?
4. Extras: do you want the **9:16 Short** and the **thumbnail** too? (Both are recommended.)
