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
npm test           # 59 automated tests (physics, speech, analysis)
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
| Tube | The tract as a tube of sections with the field and the standing waves of F1-F3; in tube mode you draw the area function directly (16 points) and set its length. |
| Spectrogram | Scrolling, 0-8 kHz linear or 80-band log-mel; analysis window from 3 to 80 ms with a plain explanation of the time-frequency trade-off. |

Control tabs:

| Tab | Controls |
|---|---|
| Source | Blow, voicing, buzz only (no filter), F0, lung pressure, glottal opening, vibrato; voice presets (man, woman, child, deep, whisper, vocal fry, breathy, pressed, raspy); LF (Rd or Oq / alpha_m / Ra) or two-mass (tension, asymmetry, rest area); peak area, source-tract interaction, posterior chink; jitter, shimmer, diplophonia. |
| Tract & person | Articulators as sliders, phoneme buttons (IPA), anatomy (size, pharynx length and width, nasal leak), timbre presets, losses. |
| Teeth & slit | Front view and side view of the incisors with the jet; slit width, extra opening, diastema, overjet, advance, upper / lower incisor length, tongue groove; presets (open bite, gap teeth, overjet, short teeth); s / ʃ / f / θ / z shortcuts; live jet readouts (velocity, Reynolds number, share of the jet hitting the teeth). |
| Noise | The physical sources (aspiration, constriction jet, teeth obstacle, release bursts) with trims and pulsing; your own noise: colour (white, pink, brown, blue, violet), a drawable 32-point spectrum, band limits, level, pulsing by the glottal flow, injection point (glottis, constriction, teeth, lips or anywhere along the tract) or straight to the ears (bypassing the tract). |
| Speak | English or Italian text (numbers are read out), or IPA between slashes; rate, accent strength; examples in both languages; a phone timeline that follows the playback; "what makes it sound natural": timing, intonation, micro-variation, voice quality and coarticulation, each switchable, with a plain explanation and a one-click robot voice. |
| Melody | Draw a pitch contour (erase = unvoiced) and play it with the buzz alone or through the current vowel; contour presets (sample sentence, question, flat); a two-octave keyboard (mouse or computer keys) with vibrato. |
| A/B experiment | Eight ready-made experiments (same filter other pitch, same pitch other filter, same vowel another body, dark vs bright, velum closed vs open, steady vs pulsed hiss, voice vs whisper, LF vs two-mass) plus your own A/B captures, rendered offline, played and overlaid as long-term spectra. |
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
    tract/nasal.ts        nasal tract with maxillary and sphenoidal sinuses
    tract/waveguide.ts    real-time Kelly-Lochbaum waveguide
    tract/acoustics.ts    frequency-domain reference (lossy ABCD chain)
    aero/aero.ts          slow aerodynamics, jets, Reynolds number, obstacle
    noise/noise.ts        turbulence sources and user noise shaping
    engine/engine.ts      the voice engine (one sample loop, telemetry)
    speech/               phonemes, G2P (it/en), sequencer, target approximation
    analysis/             LPC formants, YIN pitch, mel filterbank
    data/vowels.ts        reference vowel formants
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
Lung and intraoral pressures are smoothed per sample, so a closure never
produces steps.

### Vocal tract

**Articulatory geometry** (in the spirit of Maeda 1990 and Birkholz's
VocalTractLab): rigid and deformable structures in the mid-sagittal plane
(posterior pharyngeal wall, velum, hard palate, incisors, lips, jaw, tongue
body and tip) are cut by a semi-polar grid of lines; the mid-sagittal widths
d(s) become areas with region-specific power laws A = alpha d^beta (Heinz &
Stevens 1965; Sundberg et al. 1987), except at the lips (elliptic opening) and
at the teeth (the explicit slit between the incisor edges). The centreline
length is measured, so lip protrusion and a lowered larynx really lengthen
the tube. 12 articulators: jaw, tongue body x/y, tip x/y, blade groove, lip
opening, rounding, protrusion, labiodental tuck, velum, larynx height. The
anatomy (size, pharynx length and width, nasal leak) is the persistent
"person" part of the filter.

**Waveguide** (Kelly & Lochbaum 1962): 44 equal sections of pressure waves
with one sample of delay each, run at fs_t = N c / L (88 kHz for 17.5 cm), so
any tract length is exact. Junctions:

    r = (A1 - A2)/(A1 + A2),  w = r (f_in - b_in),  f_out = f_in + w,  b_out = b_in + w
    three-way (velum, sinus ostia):  p_J = 2 sum(A_i p_i) / sum(A_i),  out_i = p_J - p_i
    dipole source p_s:   f_out += p_s (1 + r)/2,  b_out -= p_s (1 - r)/2
    monopole source u_s: f_out += rho c u_s / (A1 + A2),  b_out += rho c u_s / (A1 + A2)
    glottal end:         f_0 = r_g b_0 + Z_0 (1 + r_g)/2 U_g

Losses: per-section decay exp(-sigma/fs) with sigma = 70 + 45 sqrt(3/A) s⁻¹
(narrow sections lose more), calibrated against the frequency-domain model.
Yielding walls: a mass-spring-damper per section pair (Ishizaka, French &
Flanagan 1975: m = 1.5 g/cm², r = 1600 dyn s/cm³, k = 3e5 dyn/cm³) removes
air as a flow sink, which raises F1 in closed tracts and sets the
low-frequency bandwidths. Lips and nostrils: Flanagan's piston radiation
impedance (parallel R-L) as a first-order reflection filter (bilinear
transform); the sound is the time derivative of lip plus nostril flow. Areas,
losses and radiation coefficients glide sample by sample between control
updates, so articulations never click. The output is low-passed (8th-order
Butterworth) and resampled to the audio rate with Catmull-Rom interpolation.

**Nasal tract**: a fixed 28-section branch (about 11 cm, scaled with the
speaker) with the area profile of Dang, Honda & Suzuki (1994), joined at the
velopharyngeal port, with maxillary and sphenoidal sinuses as neck + closed
cavity side branches (resonating near 450-650 Hz, Dang & Honda 1996) and
higher wall losses for the convoluted turbinates.

**Frequency-domain reference** (Sondhi & Schroeter 1987; Story, Titze &
Hoffman 1996): the same area function as a chain of lossy ABCD sections with
viscous, thermal and wall losses and the radiation load. It draws the filter
envelope and formants in the UI and validates the waveguide.

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
it.

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
  /e o/, Italian /a/ between /æ/ and /ɑ/, and the uniform tube for /ə/. The
  American /ɹ/ and /ɝ/ have the tip up and back with rounded lips, which
  pulls F3 down to about 1600-1750 Hz (scripts/tune-rhotic.ts); the dark /ɫ/
  of English codas backs the tongue body (F2 about 1000 Hz). Gestures that
  cannot be held: the tap /ɾ/ (one flick of the tongue tip) and the glottal
  stop /ʔ/ (the folds pressed shut).
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
  from the lexicon's American forms.
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
    words, with downstep. English accents peak inside the stressed vowel;
    Italian prenuclear accents peak late (L+H*) and the statement nucleus
    falls onto the stressed syllable (H+L*). Statements end with a final
    lowering, yes/no questions rise, questions with a question word fall, a
    comma leaves a small continuation rise.
  - *Micro-variation*: intrinsic F0 of vowels (+0.7 st for i u, -0.5 st for
    a), the push of the previous consonant on the vowel onset (+1.3 st after a
    voiceless obstruent, -0.8 st after a voiced one, decaying in 35 ms), and
    flutter, the slow F0 wander of Klatt & Klatt (1990): F0 (1 + FL/5000 (sin
    2π 12.7 t + sin 2π 7.1 t + sin 2π 4.7 t)), FL = 25.
  - *Voice quality*: more lung pressure (+14 %) and a tenser source (Rd -0.12)
    on stressed syllables; lower pressure and a breathier source (Rd +0.55)
    over the last 280 ms of each phrase; quiet pauses.
  - *Coarticulation*: consonants only set the articulators they need; the
    others are interpolated from the neighbouring vowels (Öhman 1966), so lips
    round ahead of /u/ and the tongue glides through /p/. Off: every sound
    sets every articulator.
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
| Waveguide vs reference, /i/ | 276 / 2305 / 3035 vs 273 / 2304 / 3035 Hz |
| Waveguide vs reference, /a/ | 709 / 1300 / 2779 vs 707 / 1300 / 2779 Hz |
| Waveguide vs reference, /u/ | 303 / 869 / 2642 vs 298 / 870 / 2641 Hz |
| Waveguide vs reference, /ɛ/ /o/ | 509 / 1802 / 2806 and 475 / 900 / 2511 Hz (ref 508 / 1802 / 2806 and 471 / 900 / 2511) |
| Vowels F1 / F2 (target) | i 273 / 2304 (270 / 2290), ɪ 388 / 1981 (390 / 1990), e 420 / 1975 (440 / 2050), ɛ 508 / 1802 (530 / 1840), æ 651 / 1678 (660 / 1720), a 707 / 1300 (740 / 1300), ɑ 706 / 1104 (730 / 1090), ɔ 567 / 843 (570 / 840), o 471 / 900 (470 / 900), ʊ 442 / 1018 (440 / 1020), u 298 / 870 (300 / 870), ʌ 634 / 1201 (640 / 1190), ə 502 / 1510 (500 / 1500) |
| F1 vs tract length (uniform) | 12 cm 729 Hz, 14.5 cm 603 Hz, 17.5 cm 500 Hz, 20 cm 438 Hz (1/L) |
| /a/ scaled to 0.75 | F2 ratio 1.329 (ideal 1.333) |
| LF spectral slope, Rd 1, 1-5 kHz | -11.8 dB/oct (flow derivative), -17.9 dB/oct (flow) |
| LF H1-H2 | Rd 0.5: -2.0 dB, Rd 1: 3.8 dB, Rd 2.5: 17.5 dB (pressed to breathy) |
| Two-mass F0 vs tension | Q 0.7: 100 Hz, Q 1.2: 167 Hz, Q 1.8: 245 Hz; automatic tension within 4 % of the target |
| /s/ | peak 4875 Hz, centroid 4755 Hz, -9.8 dB re /a/ |
| /ʃ/ | peak 3797 Hz, centroid 3027 Hz, -2.4 dB re /a/ |
| /f/ | centroid 6543 Hz, flat (2-10 kHz spread 9.9 dB vs 15.8 dB for /s/), -19.5 dB re /a/, -9.7 dB re /s/ |
| Teeth | opening the incisal slit by 6 mm lowers /s/ in 4-10 kHz by 19.0 dB |
| Breathiness | HF/LF ratio +11.5 dB with a 0.12 cm² chink and Rd 2.2 |
| Aspiration | F0 envelope modulation depth: steady 0.043, pulsed 0.591 |
| User pink noise | -2.99 dB/oct (theory -3.01) |
| "sasso" | geminate /sː/ 187 ms vs single /s/ 107 ms; HF/LF -6.3 dB in /sː/ vs -32.2 dB in /a/ |
| "mamma" | nasal murmur 800-3000 / 80-400 Hz balance -31.8 dB vs -10.9 dB in the vowel |
| Italian G2P | sasso, mamma, voce, rosa (northern /z/), gnocchi, figlio (long ʎ), scena, chiesa, città; IPA parsing |
| English G2P | 89 321-word lexicon; voice v ɔɪ s, water w ɔ ɾ ɚ, little l ɪ ɾ ə ɫ, 1984 "nineteen eighty four", blick (rules) b l ɪ k; weak forms; wh-questions marked |
| American r | /ɹ/ 416 / 1151 / 1591 Hz, /ɝ/ 464 / 1290 / 1744 Hz (Peterson & Barney /ɝ/ 490 / 1350 / 1690) |
| Dark l | F2 clear /l/ 1497 Hz, dark /ɫ/ 985 Hz |
| Klatt durations | /i/ in bead 223 ms vs beat 153 ms; "heed heed heed": first 121 ms, last 223 ms |
| Italian durations | stressed /a/ in fato 156 ms vs fatto 104 ms |
| Voice onset time | /t/ English 69 ms, Italian 9 ms (typical 60-70 and 10-25 ms) |
| Trill and tap | tongue-tip closures: "carro" 3, "caro" 1 |
| Fujisaki intonation | final F0: statement 105 Hz, wh-question 101 Hz, yes/no question 163 Hz (base 120 Hz) |
| Log-mel | 80 bands; a 1 kHz tone lands in band 25-29 |

## Simplifications and limits

- The head is a canonical adult male mid-sagittal drawing, not fitted to MRI.
  Areas come from widths through power laws; the lateral shape of the tract is
  not modelled except at the lips and the teeth.
- One-dimensional plane-wave acoustics: no cross modes (fine below about
  5 kHz for an adult tract), no 3D flow. The noise sources are lumped dipoles
  with laws and constants calibrated to match measured fricative levels and
  spectra; the jet is not simulated as a flow field.
- The nasal branch has a fixed number of sections that scales with the
  speaker; left and right passages are merged; only two sinus pairs.
- The slow aerodynamics run at control rate (every 32 samples) with per-sample
  smoothing; a strong closure damping term keeps closed cavities stable.
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
- Shadle, C. H. (1985). The acoustics of fricative consonants. PhD thesis, MIT.
- Sondhi, M. M. & Schroeter, J. (1987). A hybrid time-frequency domain articulatory speech synthesizer. IEEE Trans. ASSP 35.
- Steinecke, I. & Herzel, H. (1995). Bifurcations in an asymmetric vocal-fold model. JASA 97.
- Stevens, K. N. (1971). Airflow and turbulence noise for fricative and stop consonants. JASA 50.
- Stevens, K. N. (1998). Acoustic Phonetics. MIT Press.
- Story, B. H., Titze, I. R. & Hoffman, E. A. (1996). Vocal tract area functions from magnetic resonance imaging. JASA 100.
- Sundberg, J., Johansson, C., Wilbrand, H. & Ytterbergh, C. (1987). From sagittal distance to area. Phonetica 44.
- Titze, I. R. (1984). Parameterization of the glottal area, glottal flow, and vocal fold contact area. JASA 75.
- Young, S. et al. The HTK Book (mel filterbank).

## Developer scripts

```bash
npx tsx scripts/say.ts out/            # render example sentences to WAV, print phones, durations and pitch range
npx tsx scripts/say.ts out/ en "any sentence"   # one sentence; add --flat for the robot version
npx tsx scripts/g2p.ts en "the water bottle"    # phones of a text and where each English word came from
npx tsx scripts/trace.ts it "il carro"          # every 2 ms: phone, constriction area, oral pressure, voicing
npx tsx scripts/build-lexicon.ts us_gold.json   # rebuild public/lexicon/en-us.lex
npx tsx scripts/tune-rhotic.ts 490,1350,1690 ɹ  # fit an articulation to F1/F2/F3 with tip and lips free
npx tsx scripts/explore.ts a out.wav   # one phoneme: level, F0, LPC formants
npx tsx scripts/tune-vowels.ts         # fit vowel articulations to reference formants
npx tsx scripts/tune-consonants.ts     # consonant tuning helper
npx tsx scripts/noise-transfer.ts s    # transfer from a noise source at each front junction
npx tsx scripts/scan-variants.ts ʃ '[{"jaw":0.2}]'
npx tsx scripts/debug-geometry.ts geometry.html
```

In development builds the store is exposed as `window.voiceStore` for
debugging.
