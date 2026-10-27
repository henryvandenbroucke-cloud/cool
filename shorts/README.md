# Viral Shorts: research + two finished formats

## Niche research (Oct 2026)
- **Psychology explainers** are among the strongest faceless Shorts niches: one concept per 30–45s video,
  a strong hook in the first 2–3s, and "you"-focused titles ("why you think people are staring at you").
- **Finance / make-money** pays the highest CPM; **horror / storytelling** gets the most volume.
- **Risk:** channels that are pure AI script + stock footage, or reupload other people's clips, are often
  demonetized as "reused content". Use footage you have the rights to, and add real commentary or editing.
- **Footage source used here:** [Prelinger Archives](https://archive.org/details/prelinger) on archive.org,
  a collection of public-domain films of real people from the 1940s–60s, plus public-domain classic TV commercials.

## Format 1: Explainer + voiceover (`build_explainer.py`)
"The Spotlight Effect": ElevenLabs voiceover ("Chris" voice) cut over 4 public-domain films
(Shy Guy 1947, Junior Prom 1946, Age of Turmoil 1953, Understanding Others 1959).
Word-by-word captions are timed with faster-whisper, plus stat pop-ups (50% → 23%, from Gilovich et al., 2000).

Script:
> Right now... you think people are watching you. They're not. In the year 2000, Cornell researchers made
> students walk into a room full of strangers wearing an embarrassing Barry Manilow t-shirt. The students
> guessed half the room would notice. The real number? Less than a quarter. Psychologists call this the
> Spotlight Effect. You're the main character of your own life, so your brain assumes you're the main
> character in everyone else's, too. But here's the twist: everyone else is doing the exact same thing...
> So dance badly. Ask the dumb question. Wear the shirt. Nobody's watching. And that's the most freeing
> thing you'll ever hear.

## Format 2: "World's Best Salesman" clip (`build_clip.py`)
Modeled on Pause To Think / Lumoion-style Shorts: one real-human clip with its original audio, a hook title,
and pink-highlight word captions. The source is a 1950s Remington commercial in which the pitchman shaves a peach
and a hairbrush (Classic Television Commercials Part I, public domain).

## Pipeline
`ffmpeg` (vertical 1080×1920 with blurred fill and slow push-in) + `faster-whisper` (word timings)
+ ASS subtitles (Inter Black). Scripts expect the source films in `../src` or alongside them; see the paths at the top of each script.
