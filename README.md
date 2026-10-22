# Voice Workshop (Officina della voce)

An interactive, physically based simulator of human voice production: a buzz
(the vocal folds), a hiss (turbulent air) and a filter (the vocal tract). It
follows the concepts of the explainer video "a buzz, a hiss and a filter" and
lets you hear and see each of them, from the single glottal pulse to sequenced
speech.

Everything is computed live in the browser: a mid-sagittal articulatory model
of the head gives an area function, a lossy Kelly-Lochbaum waveguide with
nasal cavity, sinuses, yielding walls and lip radiation filters a glottal
source (Liljencrants-Fant or a self-oscillating two-mass model), and
turbulence noise appears wherever the Reynolds number of the airflow says it
should, with a separate obstacle source where the jet hits the incisors.

The interface is in English by default, with an Italian toggle (EN / IT). The
last choice is remembered in the browser, and `?lang=it` or `?lang=en` in the
address opens the page in that language.

## Run

Requirements: Node.js 20.19+ or 22.12+ (Vite 8), a recent Chrome, Edge,
Firefox or Safari (AudioWorklet).

```bash
cd voice-simulator
npm install
npm run dev        # http://localhost:5186
npm test           # 79 automated tests (physics, speech, analysis)
npm run validate   # runs the tests and prints every validation number as a table
npm run build      # type check + production build in dist/ (static files, relative paths)
npm run preview    # serves dist/
```

Click **Accendi l'audio / Start audio** once (browsers only allow audio after a
user gesture), then **Soffia / Blow** or any phoneme, preset or example.

## What you can do

Two modes, switchable in the header:

- **Guided tour** (8 chapters that follow the video): a buzz and a filter;
  waves, harmonics and spectrum; the source (pulses, pitch, melody with the
  buzz alone); the filter (formants, vowels, the F1-F2 map, what belongs to
  the person); two independent knobs (source and filter); the hiss (s, f,
  breathy voice, pulsed aspiration); the spectrogram (slices, window
  trade-off, log-mel); a machine voice. Every chapter has buttons that set up
  the experiment it describes.
- **Lab**: every control at once.

Views:

| View | What it shows |
|---|---|
| Head (left) | Mid-sagittal head with draggable handles for tongue body, tongue tip, jaw, lips, velum, larynx and incisors. The airway is coloured by the live acoustic field (pressure, particle velocity or airflow), with glottal pulses, nasal airflow, turbulence particles at the jet and the teeth, and sparks on releases. |
| Vowel map | F1-F2 chart (log axes) with Peterson & Barney (men, women, children), Hillenbrand et al. and the narrator's vowels of the video; the model's vowels are clickable, dragging blends articulations; the live trail and the microphone's formants are drawn on it. |
| Spectrum | Measured output spectrum, predicted harmonics (source harmonics x filter), filter envelope, formant labels, optional microphone overlay. |
| Waveform | Output pressure, glottal flow and noise. |
| Vocal folds | Top view of the glottis in slow motion, the LF cycle with tp / te / ta, the two-mass schematic. |
| Tube | The tract as a tube of sections with the field and the standing waves of F1-F3; in tube mode you draw the area function directly (16 points) and set its length, or listen to one of the 11 vowel shapes measured by MRI (Tract & person tab). |
| Spectrogram | Scrolling, 0-8 kHz linear or 80-band log-mel; analysis window from 3 to 80 ms with a plain explanation of the time-frequency trade-off. |

Control tabs:

| Tab | Controls |
|---|---|
| Source | Blow, voicing, buzz only (no filter), F0, lung pressure, glottal opening, vibrato; voice presets (man, woman, child, deep, whisper, vocal fry, breathy, pressed, raspy); LF (Rd or Oq / alpha_m / Ra) or two-mass (tension, asymmetry, rest area); peak area, source-tract interaction, posterior chink; jitter, shimmer, diplophonia. |
| Tract & person | Articulators as sliders, phoneme buttons (IPA), the vowels measured by MRI (Story 2008) loaded as the tube, anatomy (size, pharynx length and width, nasal leak, nasal cycle, each nostril, pinch the nose), timbre presets, losses. |
| Teeth & slit | Front view and side view of the incisors with the jet; slit width, extra opening, diastema, overjet, advance, upper / lower incisor length, tongue groove; presets (open bite, gap teeth, overjet, short teeth); s / ʃ / f / θ / z shortcuts; live jet readouts (velocity, Reynolds number, share of the jet hitting the teeth). |
| Noise | The physical sources (aspiration, constriction jet, teeth obstacle, release bursts) with trims and pulsing; your own noise: colour (white, pink, brown, blue, violet), a drawable 32-point spectrum, band limits, level, pulsing by the glottal flow, injection point (glottis, constriction, teeth, lips or anywhere along the tract) or straight to the ears (bypassing the tract). |
| Speak | English or Italian text (numbers are read out), or IPA between slashes; rate, accent strength; examples in both languages; a phone timeline that follows the playback; "what makes it sound natural": timing, intonation, micro-variation, voice quality and coarticulation, each switchable, with a plain explanation and a one-click robot voice. |
| Melody | Draw a pitch contour (erase = unvoiced) and play it with the buzz alone or through the current vowel; contour presets (sample sentence, question, flat); a two-octave keyboard (mouse or computer keys) with vibrato. |
| A/B experiment | Nine ready-made experiments (same filter other pitch, same pitch other filter, same vowel another body, dark vs bright, velum closed vs open, one nostril pinched, steady vs pulsed hiss, voice vs whisper, LF vs two-mass) plus your own A/B captures, rendered offline, played and overlaid as long-term spectra. |
| Machine voice | Only what the video narration says about the excitation of a neural speech model: nine sines at 1..9 x F0, locked to the pitch, switched off where the melody is zero and replaced by soft noise, mixed by learned weights (here by hand). |

Header extras: microphone (opt-in, analysed locally, never played back),
numbers on/off, freeze, reset, volume.

## Architecture

```
src/
  dsp/                    pure TypeScript, no DOM: runs in the worklet, in tests and in Node
    constants.ts          CGS constants (c, rho, mu, wall parameters)
    glottis/lf.ts         LF model with the Rd parameterisation
    glottis/twoMass.ts    Steinecke-Herzel asymmetric two-mass model
    tract/geometry.ts     mid-sagittal articulatory model, teeth and slit
    tract/areaFunction.ts grid -> area function (44 sections)
    tract/nasal.ts        nasal tract: nasopharynx, left and right passages and nostrils, sinuses
    tract/waveguide.ts    real-time Kelly-Lochbaum waveguide
    tract/acoustics.ts    frequency-domain reference (lossy ABCD chain)
    aero/aero.ts          slow aerodynamics, jets, Reynolds number, obstacle
    noise/noise.ts        turbulence sources and user noise shaping
    engine/engine.ts      the voice engine (one sample loop, telemetry)
    speech/               phonemes, G2P (it/en), sequencer, target approximation
    analysis/             LPC formants, YIN pitch, mel filterbank
    data/vowels.ts        reference vowel formants
    data/mri.ts           vowel area functions measured by MRI (Story 2008)
  audio/worklet.ts        AudioWorkletProcessor wrapping the engine
  audio/audioEngine.ts    AudioContext, worklet node, clips, microphone
  ui/                     React 19 views, panels, store, i18n, guided tour
tests/                    Vitest suites with the validation numbers
scripts/                  validate.ts, say.ts (renders sentences to WAV), tuning and debug tools
```

The engine runs inside an `AudioWorkletProcessor`. The UI sends parameter
changes (coalesced per task) and gestural scores; the worklet streams the
output, the glottal flow and the noise back in blocks of 1024 samples, plus
telemetry (areas, field per section, F0, jet, levels) about 60 times per
second. Canvases read a
shared ring buffer in `requestAnimationFrame`. Offline renders (A/B, machine
excitation) use the same engine class synchronously.

## The model

Units are CGS throughout (cm, g, s; pressure in dyn/cm², volume velocity in
cm³/s), c = 35 000 cm/s, rho = 1.14e-3 g/cm³.

### Source

**LF model** (Fant, Liljencrants & Lin 1985) of the glottal flow derivative in
one period T0 = 1:

- open phase, 0 <= t <= te: E(t) = E0 e^(alpha t) sin(pi t / tp)
- return phase, te < t <= 1: E(t) = -(Ee / (eps ta)) [e^(-eps (t - te)) - e^(-eps (1 - te))]

with eps ta = 1 - e^(-eps (1 - te)) and alpha such that the flow returns to
zero. The single shape parameter Rd (Fant 1995) sets Ra = (-1 + 4.8 Rd)/100,
Rk = (22.4 + 11.8 Rd)/100, Rg = Rk / (4 (0.11 Rd / (0.5 + 1.2 Rk) - Ra)),
tp = 1/(2 Rg), te = tp (1 + Rk), ta = Ra. Rd 0.3-0.7 is pressed, about 1 modal,
2-2.7 breathy. Advanced mode sets Oq, alpha_m and Ra directly. Cycle-to-cycle
jitter, shimmer and alternate-cycle diplophonia, a posterior chink (incomplete
closure) and vibrato complete the source. Only the AC part of the pulse train
is injected into the tract; the mean flow belongs to the aerodynamic model.
That mean glides over 3 ms: subtracted in one step at each new period (a
shimmer amplitude, a new Rd), it would put a small click on every period, a
broadband fizz above 5 kHz.

**Two-mass model** (Ishizaka & Flanagan 1972, in the asymmetric form of
Steinecke & Herzel 1995):

    m_i x_i'' + r_i x_i' + k_i x_i + H(-a_i) c_i a_i/(2 l) + k_c (x_i - x_j) = F_i
    a_i = a0_i + l (x_left + x_right),   F_1 = l d_1 P_1,   F_2 = 0

Pitch comes from the tension Q (k -> Q k, m -> m / Q); with automatic tension
the model follows the requested F0. Left/right asymmetry gives subharmonics
and raspy voice. The flow is solved each sample against the tract input
impedance, dP = rho U²/(2 a_min²) + (Z + R_visc) U (Titze 1984), so the tract
loads the folds.

**Source-tract interaction** (LF mode): the glottal end reflection of the
waveguide follows the time-varying glottal impedance during the open phase,
which widens F1 and skews the pulses as in real voices.

### Aerodynamics

Lungs -> glottis -> oral constriction (with the nose in parallel) -> out
(Stevens 1998). Each orifice obeys U = A sqrt(2 dP / rho); the cavity behind
the constriction has a compliance C (mostly its walls),

    C dPo/dt = U_glottis - U_mouth - U_nose

This gives intraoral pressure build-up in closures, the release of stops, and
the aerodynamic limit of voicing (no transglottal pressure, no vibration).
Below the speaking pressure (8 cmH2O) the vibration amplitude falls almost in
proportion to the transglottal pressure, so that, with the jet speed, the
voice loses 8-9 dB per halving of the pressure, as measured (Titze & Sundberg
1992): a voiced fricative, with pressure behind its constriction, is much
weaker than its vowels.
Lung and intraoral pressures are smoothed per sample, so a closure never
produces steps. Everything the sample loop takes from the control rate
(pressures, mouth flow, voicing amplitude, glottal opening, the glottal-stop
gate, the noise levels) is carried as a straight line across each 32-sample
control period: held as steps, it would modulate the glottal pulses at
1.5 kHz and leave a comb of whistles at its multiples.

### Vocal tract

**Articulatory geometry** (in the spirit of Maeda 1990 and Birkholz's
VocalTractLab): rigid and deformable structures in the mid-sagittal plane
(posterior pharyngeal wall, velum, hard palate, incisors, lips, jaw, tongue
body and tip) are cut by a semi-polar grid of lines; the mid-sagittal widths
d(s) become areas with region-specific power laws A = alpha d^beta (Heinz &
Stevens 1965; Sundberg et al. 1987), except at the lips (elliptic opening) and
at the teeth (the explicit slit between the incisor edges). The centreline
length is measured, so lip protrusion and a lowered larynx really lengthen
the tube (and spread lips, protrusion below zero, shorten it). 13
articulators: jaw, tongue body x/y, tongue root, tip x/y, blade groove, lip
opening, rounding, protrusion, labiodental tuck, velum, larynx height. The
tongue root moves the back of the tongue below the body centre forward or
back on its own (as Maeda's tongue-shape parameter), fully at the hyoid and
fading toward the dorsum: tense /i/ advances it and widens the lower
pharynx, lax /ɪ ɛ/ pull it back. Its rest position and the epilaryngeal tube
above the glottis (about 0.45 cm², A = 0.55 d^1.3) follow the area functions
measured by MRI (Story 2008), where the lower pharynx of most vowels is about
1 cm². A tucked lower lip keeps its slit under the upper teeth whatever the
jaw, as a closing lip does for a bilabial (motor equivalence), and it slides
out in front of the incisors when it rises above their edge, so that a /v/
on its way to a rounded /w/ ("vuole") never closes. The anatomy (size,
pharynx length and width, nasal leak) is the persistent "person" part of the
filter.

**Waveguide** (Kelly & Lochbaum 1962): 44 equal sections of pressure waves
with one sample of delay each, run at fs_t = N c / L (88 kHz for 17.5 cm), so
any tract length is exact. Junctions:

    r = (A1 - A2)/(A1 + A2),  w = r (f_in - b_in),  f_out = f_in + w,  b_out = b_in + w
    three-way (velum, sinus ostia):  p_J = 2 sum(A_i p_i) / sum(A_i),  out_i = p_J - p_i
    dipole source p_s:   f_out += p_s (1 + r)/2,  b_out -= p_s (1 - r)/2
    monopole source u_s: f_out += rho c u_s / (A1 + A2),  b_out += rho c u_s / (A1 + A2)
    glottal end:         f_0 = r_g b_0 + Z_0 (1 + r_g)/2 U_g
    series resistance R: q = 2 (f_in - b_in) / (1/A1 + 1/A2 + R/(rho c)),
                         f_out = b_in + q/A2,  b_out = f_in - q/A1

Losses: per-section decay exp(-sigma/fs) with sigma = 70 + 45 sqrt(3/A) s⁻¹
(narrow sections lose more), calibrated against the frequency-domain model.
Yielding walls: a mass-spring-damper per section pair (Ishizaka, French &
Flanagan 1975: m = 1.5 g/cm², r = 1600 dyn s/cm³, k = 3e5 dyn/cm³) removes
air as a flow sink, which raises F1 in closed tracts and sets the
low-frequency bandwidths. Lips and nostrils: Flanagan's piston radiation
impedance (parallel R-L) as a first-order reflection filter (bilinear
transform); the sound is the time derivative of lip plus nostril flow. Areas,
losses and radiation coefficients glide sample by sample between control
updates, so articulations never click. Jet losses: where the flow leaves a
narrow passage (the constriction of a fricative, the slit between the
incisors, the lips) it separates into a jet that loses its kinetic pressure in
the wider part downstream (Borda-Carnot), dp = rho/2 v² (1 - A/A_down)². For
the sound this is a series resistance R = rho U (1 - A/A_down)² / A² at that
junction, with the mean flow U of the aerodynamic model (Birkholz, Jackèl &
Kröger 2007; Stevens 1998). It widens the resonances around a fricative
several times (the sharpest one below 4 kHz in /ʃ/ 3.6 times at
600 cm³/s) and those of a vowel hardly at all (1.15 times in /i/ at
150 cm³/s). The output is low-passed (8th-order
Butterworth) and resampled to the audio rate with Catmull-Rom interpolation.

**Nasal tract**: 28 sections (about 11 cm, scaled with the speaker) with the
area profile of Dang, Honda & Suzuki (1994), joined at the velopharyngeal
port. The first 7 sections (the nasopharynx) are common; at the choanae a
three-way junction splits them into the left and right passages, each with
half the area and its own radiating nostril. Two equal passages sound like
the merged tube; unequal ones add a pole-zero pair (Dang et al. 1994): with
one side congested by the nasal cycle (the turbinates of one side swell
while the other side's shrink, every few hours) /m/ gains a resonance near
2.2 kHz with its antiresonance. A pinched nostril closes its passage, which
becomes a closed side branch: a new antiresonance near 560 Hz, and the first
resonance of /m/ falls from about 320 to 240 Hz. With both pinched the air of
a held /m/ has no way out (the aerodynamics take the nostril area too): the
mouth pressure rises to the lung pressure and the hum dies. The maxillary
sinuses (one per side) and the sphenoidal sinus (on the nasopharynx) are
neck + closed cavity side branches, resonating near 450-650 Hz (Dang & Honda
1996). The convoluted turbinates give the passages more wall surface, hence
higher viscous and thermal losses; their walls are bone and cartilage under a
thin mucosa, so unlike the cheeks they hardly yield. With soft walls the
first resonance of the murmur would rise to about 390 Hz; with bony ones it
stays near 310-330 Hz, close to the 250-300 Hz measured in men (Stevens
1998), in both models. The waveguide damps the nose ten times more than the
plain wall losses, which puts a held /m/ 7-9 dB below /a/ (Fletcher 1953).

**Frequency-domain reference** (Sondhi & Schroeter 1987; Story, Titze &
Hoffman 1996): the same area function as a chain of lossy ABCD sections with
viscous, thermal and wall losses and the radiation load. It draws the filter
envelope and formants in the UI and validates the waveguide, with the same
jet resistances: for the obstacle noise of /ʃ/ the two give the same spectrum
within 1.1 dB in every band from 0.5 to 8 kHz. On the 11 vowel
area functions Story (2008) measured by MRI (one adult man, 44 sections) it
gives the formants he computed from them within 4.8 % (F1), 2.2 % (F2) and
0.8 % (F3) on average.

**Measured shapes** (src/dsp/data/mri.ts): those 11 MRI area functions can be
loaded as the tube and heard. The articulatory vowels are fitted to them
(scripts/fit-mri.ts): among the many tract shapes that give a vowel its
reference formants, the fit chooses the one closest to the measured shape
(log areas compared along the tract, lips left out because MRI segments them
poorly), with the measured tract length and typical jaw openings, and never
a passage narrower than the measured one (it would hiss and throttle the
airflow). The shape distance falls from 0.98 with the drawing's own vowels
to 0.59 (0.1 means areas within about 10 %); the formants stay on target.

### Turbulence noise

At the narrowest oral passage a jet forms with v = sqrt(2 Po / rho) and
hydraulic diameter D = 2 sqrt(A / pi). Noise starts when the Reynolds number
Re = v D / nu passes about 1800 (smooth onset). Sources (Stevens 1971, 1998;
Flanagan & Cherry 1969; Shadle 1985):

- **Constriction (wall) source**: a dipole at about 0.5 cm downstream of the
  constriction exit, strength proportional to rho v³ / c times sqrt(A)
  (Stevens' U³ A^-2.5 law).
- **Obstacle (teeth) source**: the jet spreads (width D + 0.22 x) and slows
  after its potential core (5 D); the share that hits the incisors is
  1 - slit height / jet width. That share, with the velocity at the teeth,
  sets a stronger dipole at the teeth. This is what makes /s/ and /ʃ/ louder
  and sharper than /f/ and /θ/, and why opening the incisal slit weakens /s/.
- **Aspiration**: turbulence of the glottal jet, from the glottal Reynolds
  number, pulsed by the glottal flow (as in real voices) or steady.
- **Release burst**: a monopole at the constriction proportional to the change
  of the mouth flow when a closure opens.

Each noise is Gaussian white noise through a first-order high-pass (dipoles
radiate little at low frequency) and a first-order low-pass at the Strouhal
corner f_c = 0.15 v / D, then filtered by the part of the tract in front of
it (the same source model as VocalTractLab, Birkholz 2014).

**Sibilant shapes.** The spectrum of /s/ and /ʃ/ is mostly the cavity in front
of the incisors and the constriction. A /ʃ/ with its constriction 2.5 cm
behind the teeth and long, nearly closed lips had a front cavity of 5.4 cm:
its lowest resonance, near 1.2 kHz, carried as much energy as the 3-4 kHz
band and pulled the spectral mean down to 3.1 kHz. scripts/tune-sibilant.ts
fits the articulation on the frequency model (fast, many starting points,
the place kept behind the alveolar ridge) to the peak and mean measured on
real speakers (Jongman et al. 2000), then checks the rendered sound: tongue
a little forward, a deeper groove, lips more protruded.

**Your noise**: a white, pink, brown, blue or violet base, or a spectrum you
draw on 32 log-spaced points (50 Hz - 16 kHz), band-limited, at a chosen level,
optionally pulsed by the glottal flow, injected at the glottis, the
constriction, the teeth, the lips or any point of the tract, or sent straight
to the ears to compare it with what the tract makes of it.

### Teeth and the slit

The incisors are explicit structures. The slit between their edges has a
width (default 22 mm), a height set by the jaw plus an extra opening, a
central diastema, and can be moved by overjet, advance and incisor length.
The slit area enters the area function at the teeth, and its height sets the
obstacle share above. The tongue groove narrows the blade channel for
sibilants. The teeth panel draws the front and side views with the live jet.

### Speech

- **Phonemes**: 14 steady vowels (Italian and English, with the r-coloured
  /ɝ/), the American diphthongs /eɪ aɪ oʊ aʊ ɔɪ/ (a nucleus that glides to its
  offglide), unstressed /ɚ/ and 30 consonants, each a set of articulator
  targets plus source settings (voicing, abduction). Vowel articulations were
  fitted so that the frequency-domain model hits adult male targets: Peterson
  & Barney (1952) where available, Hillenbrand et al. (1995) for Italian
  /e o/, Italian /a/ between /æ/ and /ɑ/, and the uniform tube for /ə/; the
  eleven vowels Story (2008) measured also take his MRI shapes (see Measured
  shapes), and /a ə/ keep their narrowest passage at 0.3 cm² or more. The
  consonants that place the tongue body (s z ʃ ʒ k g ŋ ɲ l ʎ ɫ ɹ j w and /ɝ/)
  keep the root forward, the wide pharynx they were tuned with. The
  American /ɹ/ and /ɝ/ have the tip up and back with rounded lips, which
  pulls F3 down to about 1600-1750 Hz (scripts/tune-rhotic.ts), with the
  narrowest passage kept at 0.3 cm² on the fine grid the aerodynamics uses:
  narrower, the jet turns them into fricatives that hiss; the dark /ɫ/
  of English codas backs the tongue body (F2 about 1000 Hz). The clear /l/
  sets its own tongue body: its air flows around the sides of the tongue,
  which a one-dimensional tube cannot show, and a high vowel next to it
  would otherwise close the passage. The velar nasal /ŋ/ closes against the
  oral face of the lowered velum, in front of the velopharyngeal port;
  further back it would cut the nose off too. /s z/ spread the lips back
  against the teeth (lip protrusion below zero): the short cavity in front of
  the groove puts the hiss where it is measured, and a rounded neighbour
  cannot stretch it down to a lisp. Gestures that cannot be held:
  the tap /ɾ/ (one flick of the tongue tip) and the glottal stop /ʔ/ (the
  folds pressed shut).
- **Italian G2P**: orthography rules (c/g before e/i, ch/gh, sc(i), gn, gl(i),
  qu, z, geminates, silent h, intervocalic s voiced in the northern norm,
  ɲ ʎ ʃ ts dz always long between vowels, penultimate stress unless an accent
  is written); unstressed function words (articles, clitics, prepositions);
  numbers in words (ventitré, centottantuno).
- **English G2P** (src/dsp/speech/english.ts): an American lexicon of 89 321
  words with primary and secondary stress, loaded on demand (0.69 MB,
  gzip-compressed; built by scripts/build-lexicon.ts from the gold dictionary
  of the misaki G2P, hexgrad, Apache-2.0); weak forms of function words
  (a, of, to, and...) and "the" before a vowel; inflections of known words
  (-s, -ed, -ing, -er, -ly...) with their voicing rules; compounds split into
  known words; for anything else, letter-to-sound rules in the style of
  Elovitz et al. (1976) with a simple stress rule; numbers and years in words.
  Flaps ("water"), glottal stops ("button"), dark l and r-coloured vowels come
  from the lexicon's American forms. Across words, inside a phrase, a final
  /t d/ links the American way: a flap between vowels ("it is", "get up"), a
  /t/ held by a glottal stop and not released before a consonant ("it
  rains": the folds close with the tongue, so no pressure builds up behind
  it), dropped between consonants ("just two").
- **IPA** between slashes, with ˈ ˌ and ː.
- **Sequencer** (src/dsp/speech/sequencer.ts): the phones are syllabified
  (legal onsets, geminates close the syllable before), grouped into words and
  phrases (commas, full stops, questions), and turned into a gestural score.
  Each ingredient of natural speech can be switched off in the speak panel:
  - *Timing*: English durations follow Klatt (1979): every sound has an
    inherent and a minimum duration, and multiplicative rules scale the
    compressible part (phrase-final lengthening x1.4, non-final shortening,
    polysyllabic and unstressed shortening, the next consonant: x1.6 before a
    voiced fricative, x0.7 before a voiceless stop, cluster shortening).
    Italian uses rules of the same form: stressed vowels long in open
    syllables (x1.55) and short before a geminate or a coda, unstressed and
    function-word vowels short, geminates x1.85, phrase-final lengthening.
  - *Intonation*: the Fujisaki model (Fujisaki & Hirose 1984): ln F0 = ln Fb
    + phrase commands (impulses through α² t e^(-αt), α = 2/s: the slow rise
    and declination of each phrase) + accent commands (steps through
    1 - (1 + βt) e^(-βt), capped at 0.9) on the stressed syllables of content
    words, 5 semitones by default, with a gentle downstep (x0.9 per accent,
    never below 60 %). Each command lasts at least 130-170 ms, so that short
    syllables still reach their peak. English accents rise through the
    stressed syllable and peak inside its vowel; Italian prenuclear accents
    peak late (L+H*), at the end of the vowel rather than on the next
    consonant, where a voiceless sound would hide them; the statement nucleus
    falls onto the stressed syllable (H+L*). The engine follows this curve
    with only a 6 ms smoothing (a slider gets 25 ms), so the accents keep
    their height. Statements end with a final
    lowering, yes/no questions rise, questions with a question word fall, a
    comma leaves a small continuation rise.
  - *Micro-variation*: intrinsic F0 of vowels (+0.7 st for i u, -0.5 st for
    a), the push of the previous consonant on the vowel onset (+1.3 st after a
    voiceless obstruent, -0.8 st after a voiced one, decaying in 35 ms), and
    flutter, the slow F0 wander of Klatt & Klatt (1990): F0 (1 + FL/5000 (sin
    2π 12.7 t + sin 2π 7.1 t + sin 2π 4.7 t)), FL = 25.
  - *Voice quality*: more lung pressure (+14 %) and a tenser source (Rd -0.12)
    on stressed syllables; lower pressure and a breathier source (Rd +0.55)
    over the last 280 ms of each phrase; quiet pauses (the lungs hold back
    instead of blowing through the open glottis). The utterance starts with
    the folds already together, so there is no breathy onset, and ends when
    the last sound ends, without a trailing breath.
  - *Coarticulation*: consonants only set the articulators they need; the
    others are interpolated from the neighbouring vowels (Öhman 1966), so lips
    round ahead of /u/ and the tongue glides through /p/. After a consonant,
    the articulators it used are released at once toward their next target
    (the tip leaves the ridge, the lip the teeth) instead of drifting back
    through the following sounds, where they would close the tract again.
    Off: every sound sets every articulator.
  Consonant gestures are timed so that their sound happens when planned
  (scripts/landmarks.ts): fricatives, nasals and approximants start 20 ms
  ahead and overlap the vowel before, so a 50 ms /v/ still reaches its slit;
  stops aim beyond the contact and close in time anyway. Every consonant lets
  its target go just before the planned release, earlier for the slower
  articulators (tongue body, jaw, velum, in proportion to their time
  constants), so that all of them open together. In the tract model the
  tucked lower lip of /f v/ rises to the upper teeth whatever the jaw (motor
  equivalence, as for bilabial closure). The result: nasals dip 6-13 dB below
  their vowels and /v/ 8-18 dB, as in the relative intensities of speech
  sounds (Fletcher 1953; Fry 1979).
  Stops are split into closure and release. English voiceless stops at the
  start of a stressed syllable (not after /s/) keep the glottis open past the
  release: aspiration, a voice onset time of about 60-70 ms; Italian ones
  adduct before the release (about 10 ms). Taps and trills are ballistic
  raised-cosine flicks of the tongue tip added on top of the smoothed posture
  (one for /ɾ/, two to four contacts at 26 Hz for the Italian /r/, Recasens
  1991); their height is computed from the tip's smoothed position, so they
  really close against the ridge and build up oral pressure. After the last
  sound the mouth relaxes to rest, releasing a final stop. A drawn contour
  replaces the intonation.
- **Target approximation** (Birkholz 2007; Prom-on, Xu & Thipakorn 2009):
  every articulator follows its targets through three identical first-order
  sections (critically damped, no overshoot), with articulator-specific time
  constants (tip faster than jaw).

### Analysis

- Spectrum: Hann-windowed FFT of the output. Predicted harmonics are the LF
  source harmonics times the reference filter |H(f)|.
- Spectrogram: 5 ms hop, window 3-80 ms. Log-mel: 80 triangular bands
  (HTK mel scale, mel = 2595 log10(1 + f/700)), 0-8 kHz, natural log.
- Microphone: LPC formants (autocorrelation, after decimation) and YIN pitch
  (de Cheveigné & Kawahara 2002), shown on the vowel map and spectrum.

## Main parameters

| Parameter | Default | Range | Meaning |
|---|---|---|---|
| F0 | 120 Hz | 40-900 | fundamental frequency |
| lung pressure | 8 cmH2O | 0-20 | drives flow, loudness and noise |
| Rd | 1.0 | 0.3-2.7 | LF shape: pressed to breathy |
| peak glottal area | 0.12 cm² | | sets the pulse amplitude |
| chink | 0.01 cm² | 0-0.2 | posterior leak, breathiness |
| abduction | 0 | 0-1 | open glottis (h, voiceless consonants, breathing) |
| source-tract interaction | 0.6 | 0-1 | glottal loading of the tract |
| two-mass tension Q / asymmetry | auto / 0 | | pitch and raspiness |
| jitter / shimmer | 0.4 % / 2 % | | cycle-to-cycle perturbation |
| size (scale) | 1 | 0.62-1.18 | 1 = adult male, about 17.5 cm |
| slit width | 22 mm | | lateral width of the incisal slit |
| losses | 1 | 0.3-3 | multiplier of the waveguide losses |
| noise trims | 0 dB | | per source |

## Validation

`npm run validate` (or `npm test`) reproduces these numbers. Formant targets
in brackets are the adult male targets described under Speech.

| Check | Result |
|---|---|
| Uniform 17.5 cm tube, lossless, ideal open end | 500.0 / 1500.0 / 2500.0 Hz (theory 500 / 1500 / 2500) |
| Same tube, lossy + piston radiation | 523 (B 37) / 1451 (B 34) / 2406 (B 63) / 3370 (B 100) Hz |
| Real-time waveguide on the same tube | 529 / 1452 / 2406 / 3370 Hz |
| Waveguide vs reference, /i/ | 290 / 2261 / 2994 vs 288 / 2260 / 2995 Hz |
| Waveguide vs reference, /a/ | 773 / 1308 / 2685 vs 772 / 1308 / 2686 Hz |
| Waveguide vs reference, /u/ | 307 / 910 / 2434 vs 304 / 911 / 2433 Hz |
| Waveguide vs reference, /ɛ/ /o/ | 535 / 1851 / 2417 and 479 / 900 / 2516 Hz (ref 534 / 1850 / 2417 and 475 / 902 / 2515) |
| Waveguide vs reference, MRI shapes | worst F1-F3 difference 1.3 % over the 11 measured vowels |
| MRI areas, frequency model | mean difference from the formants Story (2008) computed from the same areas: F1 4.8 %, F2 2.2 %, F3 0.8 % |
| Vowel shapes vs MRI | log-area distance mean 0.59, worst /ɔ/ 0.80 (the drawing's own vowels: 0.98); no vowel narrower than the measured one |
| Vowels F1 / F2 (target) | i 288 / 2260 (270 / 2290), ɪ 393 / 2005 (390 / 1990), e 442 / 2058 (440 / 2050), ɛ 534 / 1850 (530 / 1840), æ 666 / 1724 (660 / 1720), a 772 / 1308 (740 / 1300), ɑ 726 / 1083 (730 / 1090), ɔ 575 / 856 (570 / 840), o 475 / 902 (470 / 900), ʊ 447 / 1035 (440 / 1020), u 304 / 911 (300 / 870), ʌ 643 / 1189 (640 / 1190), ə 500 / 1506 (500 / 1500) |
| F1 vs tract length (uniform) | 12 cm 729 Hz, 14.5 cm 603 Hz, 17.5 cm 500 Hz, 20 cm 438 Hz (1/L) |
| /a/ scaled to 0.75 | F2 ratio 1.329 (ideal 1.333) |
| LF spectral slope, Rd 1, 1-5 kHz | -11.8 dB/oct (flow derivative), -17.9 dB/oct (flow) |
| LF H1-H2 | Rd 0.5: -2.0 dB, Rd 1: 3.8 dB, Rd 2.5: 17.5 dB (pressed to breathy) |
| Two-mass F0 vs tension | Q 0.7: 95 Hz, Q 1.2: 163 Hz, Q 1.8: 241 Hz; automatic tension within 4 % of the target |
| /s/ | peak 4500 Hz, centroid 6233 Hz, -9.2 dB re /a/ (male /s/: peak 4-5 kHz, mean 5-6 kHz, Jongman et al. 2000); in sentences (scripts/sibilants.ts) mean about 5.2 kHz for the man, 6.5 kHz for the woman |
| /ʃ/ | peak 3141 Hz, centroid 3952 Hz, 0.7-1.8 kHz band 7.8 dB below the 2-3.5 kHz band, -7.6 dB re /a/ (1.6 dB louder than /s/; Jongman et al. 2000: peak about 3-4 kHz, mean 4.2 kHz, lower for men); before the fit peak 3844, centroid 3055 Hz, low band 1.5 dB above |
| Fricative spectrum, waveguide vs reference | /ʃ/ obstacle source: worst difference 1.1 dB over 8 bands, 0.5-8 kHz |
| Jet losses | the sharpest resonance below 4 kHz widens 3.6 times in /ʃ/ (600 cm³/s), 1.15 times in /i/ (150 cm³/s) |
| /f/ | centroid 7267 Hz, flat (2-10 kHz spread 7.6 dB vs 12.8 dB for /s/), -18.4 dB re /a/, -9.3 dB re /s/ |
| Teeth | opening the incisal slit by 6 mm lowers /s/ in 4-10 kHz by 15.3 dB |
| Breathiness | HF/LF ratio +11.5 dB with a 0.12 cm² chink and Rd 2.2 (+18.8 dB before the vowels took the MRI shapes: the narrower pharynx and epilarynx carry less breathy airflow) |
| Aspiration | F0 envelope modulation depth: steady 0.054, pulsed 0.540 |
| Period boundaries | jitter 1 % and shimmer 6 % change the 8-16 kHz energy by +0.1 dB (+32 dB when the pulse mean jumped at each period) |
| Control rate | voice onset from rest: 3-8 kHz at -41.2 dB re 0-1 kHz (-6.5 dB with stepped control values) |
| User pink noise | -2.99 dB/oct (theory -3.01) |
| "sasso" | geminate /sː/ 187 ms vs single /s/ 107 ms; HF/LF +6.1 dB in /sː/ vs -37.3 dB in /a/ |
| "mamma" | nasal murmur 800-3000 / 80-400 Hz balance -31.0 dB vs -9.8 dB in the vowel |
| Nasal murmur, waveguide vs reference | lowest resonance /m/ 317 vs 316, /n/ 332 vs 327, /ŋ/ 323 vs 311 Hz (392-416 Hz in the reference while it gave the nose soft walls) |
| Nasal cycle | /m/ with one passage congested (cycle 0.6): a new resonance at 2210 Hz with its antiresonance; first resonance 320 -> 310 Hz |
| Pinched nostril | /m/ with the left nostril pinched: first resonance 320 -> 240 Hz, new antiresonance at 560 Hz |
| Asymmetric nose, waveguide vs reference | congested left side, right nostril 40 % open, lossless: worst difference 0.41 % over 7 resonances below 3 kHz |
| Pinched nose | held /m/: nasal airflow 236 -> 0 cm³/s, mouth pressure 8.0 cmH2O (the lung pressure), the hum silent |
| Italian G2P | sasso, mamma, voce, rosa (northern /z/), gnocchi, figlio (long ʎ), scena, chiesa, città; IPA parsing |
| English G2P | 89 321-word lexicon; voice v ɔɪ s, water w ɔ ɾ ɚ, little l ɪ ɾ ə ɫ, 1984 "nineteen eighty four", blick (rules) b l ɪ k; weak forms; wh-questions marked |
| American linking | it is ɪ ɾ ɪ z, get up g ɛ ɾ ʌ p, just two dʒ ʌ s t u; oral pressure behind the /t/ of "it rains" 0.7 cmH2O (glottal stop, no puff) vs 6.5 cmH2O in "it." |
| American r | /ɹ/ 427 / 1185 / 1639 Hz, /ɝ/ 484 / 1360 / 1777 Hz (Peterson & Barney /ɝ/ 490 / 1350 / 1690), narrowest passage 0.3 cm² (no hiss) |
| Dark l | F2 clear /l/ 1519 Hz, dark /ɫ/ 982 Hz |
| Klatt durations | /i/ in bead 223 ms vs beat 153 ms; "heed heed heed": first 121 ms, last 223 ms |
| Italian durations | stressed /a/ in fato 156 ms vs fatto 104 ms |
| Voice onset time | /t/ English 79 ms, Italian 7 ms (Lisker & Abramson: English /t/ about 70 ms, range 30-105; Italian 10-25 ms) |
| Trill and tap | tongue-tip closures: "carro" 4, "caro" 2 |
| Consonant dips | nasals 5.9-12.0 dB, /v/ 13.3-20.0 dB below their vowels (natural speech: nasals 6-12 dB, voiced fricatives 12-20 dB; 8.3-17.7 dB without the jet losses) ("la mamma vuole la nonna e il vino", "Every voice you have ever heard is raining in."); no complete closure in /v w l/, the narrowest /v/ 0.08 cm² (0.03 before the lip could slide out from under the teeth); /ŋ/ in front of the nasal port in every vowel context |
| Fujisaki intonation | final F0: statement 106 Hz, wh-question 101 Hz, yes/no question 180 Hz (base 120 Hz) |
| Melody | "Every voice you have ever heard is made of just two ingredients.": planned F0 range 10.2 st; the voice follows the plan within 0.58 st (90 %), 1.9 st with the slider smoothing |
| Log-mel | 80 bands; a 1 kHz tone lands in band 25-29 |

## Simplifications and limits

- The head is a canonical adult male mid-sagittal drawing. Its vowels are
  fitted to the MRI shapes of one speaker (Story 2008) as far as its
  articulators allow (shape distance 0.59, not 0); the consonants are not.
  Areas come from widths through power laws; the lateral shape of the tract is
  not modelled except at the lips and the teeth. Each grid line takes one air
  passage: just behind nearly closed lips a line can jump between the cavity
  in front of the teeth and the lip opening, and the formants jump by a few
  per cent (F2 of /u/ by about 5 %) for a tiny movement.
- The epilaryngeal tube has a fixed width: real speakers narrow it for a
  pressed voice and widen it for a breathy one.
- One-dimensional plane-wave acoustics: no cross modes (fine below about
  5 kHz for an adult tract), no 3D flow. The noise sources are lumped dipoles
  with laws and constants calibrated to match measured fricative levels and
  spectra; the jet is not simulated as a flow field. The jet losses use the
  mean flow of the single oral constriction the aerodynamic model knows; the
  slit and lip losses do not feed back into that flow.
- The consonant postures are fitted to formants and fricative spectra, not to
  measured area functions.
- The nasal branch has a fixed number of sections that scales with the
  speaker. Its damping in the waveguide is set by the level of /m/, not by
  measured bandwidths: the murmur's peaks are wider than in the frequency
  model, which keeps the plain wall losses (the resonance frequencies agree).
  No frontal or ethmoid sinuses; a pinched nose is silent (no sound through
  the tissues).
- The slow aerodynamics run at control rate (every 32 samples), ramped
  linearly in the sample loop; a strong closure damping term keeps closed
  cavities stable.
- The two-mass model is the 4-mass asymmetric form without collision
  dynamics beyond the contact spring.
- English pronunciation is American only; unknown words use letter-to-sound
  rules, which miss many irregular spellings. Homographs (read, live) take one
  pronunciation. Italian open and close e/o are only known where an accent is
  written. Prosody is rule-based: it has no idea which word the sentence is
  about, so the nuclear accent always falls on the last content word.
- The machine-voice tab describes only the excitation as the video narration
  presents it; it does not model any trained network.
- The colourful field and particle visualisations are illustrative (the
  colours follow the real per-section pressure / velocity / flow, the
  particles are decorative).

## References

- Abbs, J. H. & Gracco, V. L. (1984). Control of complex motor gestures. J. Neurophysiol. 51.
- Birkholz, P. (2007). Control of an articulatory speech synthesizer based on dynamic approximation of spatial articulatory targets. Interspeech.
- Birkholz, P. (2014). Enhanced area functions for noise source modeling in the vocal tract. 10th International Seminar on Speech Production, Cologne.
- Birkholz, P., Jackèl, D. & Kröger, B. J. (2007). Simulation of losses due to turbulence in the time-varying vocal system. IEEE Trans. Audio, Speech, and Language Processing 15.
- Dang, J., Honda, K. & Suzuki, H. (1994). Morphological and acoustical analysis of the nasal and the paranasal cavities. JASA 96.
- Dang, J. & Honda, K. (1996). Acoustic characteristics of the human paranasal sinuses derived from transmission characteristic measurement and morphological observation. JASA 100.
- de Cheveigné, A. & Kawahara, H. (2002). YIN, a fundamental frequency estimator for speech and music. JASA 111.
- Fant, G. (1960). Acoustic Theory of Speech Production. Mouton.
- Fant, G., Liljencrants, J. & Lin, Q. (1985). A four-parameter model of glottal flow. STL-QPSR 4.
- Fant, G. (1995). The LF-model revisited. Transformations and frequency domain analysis. STL-QPSR 2-3.
- Flanagan, J. L. (1972). Speech Analysis, Synthesis and Perception, 2nd ed. Springer.
- Flanagan, J. L. & Cherry, L. (1969). Excitation of vocal-tract synthesizers. JASA 45.
- Heinz, J. M. & Stevens, K. N. (1965). On the relations between lateral cineradiographs, area functions and acoustic spectra of speech. ICA 5.
- Hillenbrand, J., Getty, L. A., Clark, M. J. & Wheeler, K. (1995). Acoustic characteristics of American English vowels. JASA 97.
- Ishizaka, K. & Flanagan, J. L. (1972). Synthesis of voiced sounds from a two-mass model of the vocal cords. Bell Syst. Tech. J. 51.
- Ishizaka, K., French, J. C. & Flanagan, J. L. (1975). Direct determination of vocal tract wall impedance. IEEE Trans. ASSP 23.
- Kelly, J. L. & Lochbaum, C. C. (1962). Speech synthesis. Proc. 4th Int. Congr. Acoustics.
- Maeda, S. (1990). Compensatory articulation during speech. In Speech Production and Speech Modelling. Kluwer.
- Öhman, S. E. G. (1966). Coarticulation in VCV utterances. JASA 39.
- Peterson, G. E. & Barney, H. L. (1952). Control methods used in a study of the vowels. JASA 24.
- Prom-on, S., Xu, Y. & Thipakorn, B. (2009). Modeling tone and intonation in Mandarin and English as a process of target approximation. JASA 125.
- Recasens, D. (1991). On the production characteristics of apicoalveolar taps and trills. J. Phonetics 19.
- Elovitz, H. S., Johnson, R., McHugh, A. & Shore, J. E. (1976). Automatic translation of English text to phonetics by means of letter-to-sound rules. NRL Report 7948.
- Espy-Wilson, C. Y., Boyce, S. E., Jackson, M., Narayanan, S. & Alwan, A. (2000). Acoustic modeling of American English /r/. JASA 108.
- Fujisaki, H. & Hirose, K. (1984). Analysis of voice fundamental frequency contours for declarative sentences of Japanese. J. Acoust. Soc. Jpn. (E) 5.
- Klatt, D. H. (1979). Synthesis by rule of segmental durations in English sentences. In Frontiers of Speech Communication Research. Academic Press.
- Klatt, D. H. & Klatt, L. C. (1990). Analysis, synthesis, and perception of voice quality variations among female and male talkers. JASA 87.
- Lisker, L. & Abramson, A. S. (1964). A cross-language study of voicing in initial stops: acoustical measurements. Word 20.
- Fletcher, H. (1953). Speech and Hearing in Communication. Van Nostrand.
- Fry, D. B. (1979). The Physics of Speech. Cambridge University Press.
- Fujimura, O. (1962). Analysis of nasal consonants. JASA 34.
- Jongman, A., Wayland, R. & Wong, S. (2000). Acoustic characteristics of English fricatives. JASA 108.
- Jongman, A. (2024). Phonetics of fricatives. Oxford Research Encyclopedia of Linguistics.
- Zue, V. W. & Laferriere, M. (1979). Acoustic study of medial /t, d/ in American English. JASA 66.
- Shadle, C. H. (1985). The acoustics of fricative consonants. PhD thesis, MIT.
- Sondhi, M. M. & Schroeter, J. (1987). A hybrid time-frequency domain articulatory speech synthesizer. IEEE Trans. ASSP 35.
- Steinecke, I. & Herzel, H. (1995). Bifurcations in an asymmetric vocal-fold model. JASA 97.
- Stevens, K. N. (1971). Airflow and turbulence noise for fricative and stop consonants. JASA 50.
- Stevens, K. N. (1998). Acoustic Phonetics. MIT Press.
- Story, B. H., Titze, I. R. & Hoffman, E. A. (1996). Vocal tract area functions from magnetic resonance imaging. JASA 100.
- Story, B. H. (2008). Comparison of magnetic resonance imaging-based vocal tract area functions obtained from the same speaker in 1994 and 2002. JASA 123.
- Sundberg, J., Johansson, C., Wilbrand, H. & Ytterbergh, C. (1987). From sagittal distance to area. Phonetica 44.
- Titze, I. R. (1984). Parameterization of the glottal area, glottal flow, and vocal fold contact area. JASA 75.
- Titze, I. R. & Sundberg, J. (1992). Vocal intensity in speakers and singers. JASA 91.
- Young, S. et al. The HTK Book (mel filterbank).

## Developer scripts

```bash
npx tsx scripts/say.ts out/            # render example sentences to WAV, print phones, durations and pitch range
npx tsx scripts/say.ts out/ en "any sentence"   # one sentence; add --flat for the robot version
npx tsx scripts/g2p.ts en "the water bottle"    # phones of a text and where each English word came from
npx tsx scripts/trace.ts it "il carro"          # every 2 ms: phone, constriction area, oral pressure, voicing
npx tsx scripts/build-lexicon.ts us_gold.json   # rebuild public/lexicon/en-us.lex
npx tsx scripts/tune-rhotic.ts 490,1350,1690 ɹ  # fit an articulation to F1/F2/F3 with tip and lips free
npx tsx scripts/areas.ts ɹ ɝ j l w              # narrowest passage and formants of each phoneme's posture
npx tsx scripts/melody.ts en "is it raining?"   # planned F0 at each phone
npx tsx scripts/noisemap.ts en "every voice"    # level of each noise source per phone
npx tsx scripts/contrast.ts it "il vino"        # how deep each consonant dips below its vowels
npx tsx scripts/landmarks.ts                    # when constrictions form and open, against the plan
npx tsx scripts/sibilants.ts a.wav b.wav        # peak and spectral mean of the hissing frames of recordings
npx tsx scripts/pitch.ts a.wav b.wav            # pitch track, level and F0 spread of recordings
npx tsx scripts/hnr.ts a.wav b.wav              # harmonics-to-noise ratio, full band and above 2 kHz
npx tsx scripts/specpng.ts out.png a.wav b.wav  # stacked spectrograms with pitch tracks
npx tsx scripts/explore.ts a out.wav   # one phoneme: level, F0, LPC formants
npx tsx scripts/tune-vowels.ts a --keys=jaw,tongueX,tongueY,tongueRoot --minarea=0.3   # fit vowel articulations to reference formants
npx tsx scripts/fit-mri.ts             # fit the vowels to formants and to the MRI shapes (--write updates phonemes.ts)
npx tsx scripts/mri.ts --profiles      # acoustic model on the MRI areas; our vowels against the measured shapes
npx tsx scripts/tune-consonants.ts     # consonant tuning helper
npx tsx scripts/tune-sibilant.ts ʃ 3000 4000   # fit a sibilant to a spectral peak and mean (frequency model, then rendered)
npx tsx scripts/noise-transfer.ts s    # transfer from a noise source at each front junction
npx tsx scripts/scan-variants.ts ʃ '[{"jaw":0.2}]'
npx tsx scripts/debug-geometry.ts geometry.html
```

In development builds the store is exposed as `window.voiceStore` for
debugging.
