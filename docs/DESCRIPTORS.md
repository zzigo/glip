# GLIP DESCRIPTOR REFERENCE

Timbral Action Entry (TAE) descriptors extracted by the librosa pipeline.
Each field is stored flat in the `descriptors` JSON column of PocketBase
and in the `desc_*` section of the TAE YAML.

Status codes: ✓ active · ⚙ in pipeline · ○ planned

---

## 1. Fundamental Frequency (pitched / harmonic sounds)

### desc_f0

| Property     | Value |
|---|---|
| YAML field   | `desc_f0` |
| Status       | ✓ active |
| Range        | 0 – ~4200 Hz (C2 ≈ 65 Hz · C7 ≈ 2093 Hz) |
| Display unit | Hz |
| VectorSpace  | available as Y/X axis |

**What it measures.** The mean fundamental frequency across voiced frames,
estimated by the probabilistic YIN algorithm (pYIN). Returns the pitch of
a harmonic signal — the lowest component of a theoretical harmonic series —
with high accuracy for monophonic pitched sources.

**Librosa command.**

```python
f0, voiced_flag, voiced_probs = librosa.pyin(
    y,
    fmin=librosa.note_to_hz('C2'),   # ~65 Hz
    fmax=librosa.note_to_hz('C7')    # ~2093 Hz
)
# stored as mean of non-NaN, non-zero voiced frames
desc_f0 = np.nanmean(f0[voiced_flag])
```

**Caveats.**
pYIN assumes a harmonic source. For inharmonic or noise-like timbres
(metallic percussion, extended techniques, breath, friction), most frames
are classified as unvoiced and `f0` returns NaN; the stored mean collapses
to 0. Use `desc_dom_freq` for reliable frequency data on such sounds.
Use `desc_voiced_prob` to assess whether `desc_f0` is trustworthy.

**Interpretation in GLIP.**
High `desc_f0` → bright pitched source (piccolo, violin harmonics).
Zero `desc_f0` + non-zero `desc_dom_freq` → inharmonic or noise source.

---

### desc_dom_freq

| Property     | Value |
|---|---|
| YAML field   | `desc_dom_freq` |
| Status       | ✓ active |
| Range        | 0 – ~20000 Hz (sub-20 Hz artefacts discarded) |
| Display unit | Hz |
| VectorSpace  | default Y axis (frequency ordering) |

**What it measures.** The mean dominant spectral frequency across all frames,
computed via parabolic interpolation on the Short-Time Fourier Transform
(piptrack). Identifies the frequency bin with maximum energy per frame,
regardless of whether the sound is harmonic or not. This makes it the most
universally reliable frequency descriptor across the full timbral range
of a TAE archive including metals, woods, membranes, breath, and electronics.

Unlike `desc_f0`, which models pitch via a harmonic prior, `desc_dom_freq`
makes no assumption about the spectral structure — it simply tracks the
most energetic frequency component at each moment.

**Librosa command.**

```python
pitches, magnitudes = librosa.piptrack(y=y, sr=sr)
dom_pitches = []
for i in range(magnitudes.shape[1]):
    col = magnitudes[:, i]
    idx = col.argmax()
    p = float(pitches[idx, i])
    dom_pitches.append(p if p > 20.0 else 0.0)   # discard sub-20 Hz artefacts
desc_dom_freq = np.mean([x for x in dom_pitches if x > 0])
```

**Caveats.**
For broadband noise or impulse-heavy sounds, the maximum energy bin can
jump frame-to-frame. The mean averages this out, but the value may not
correspond to a perceptible pitch. Combine with `desc_flatness` to
distinguish: high `desc_flatness` (→ 1) + any `desc_dom_freq` = noise
centroid, not a perceived pitch.

For sounds with strong inharmonic partials (bell, marimba, tam-tam),
`desc_dom_freq` often captures the loudest partial, which may be the
second or third inharmonic overtone rather than the fundamental.
In those cases, `desc_dom_freq` is better interpreted as "dominant register"
than "fundamental frequency."

**Interpretation in GLIP.**
`desc_dom_freq` is used as the default Y axis in the Vector Space Navigator,
ordering sounds from low-register (bottom) to high-register (top).
Combined with `desc_centroid` on the X axis, this creates a perceptually
meaningful 2D timbral space: register × spectral brightness.

**Relation to desc_f0.**

| Scenario | desc_f0 | desc_dom_freq | Meaning |
|---|---|---|---|
| Violin A4 | ~440 Hz | ~440 Hz | Clearly pitched, harmonic |
| Bell (tam-tam) | 0 | 200–800 Hz | Inharmonic, dominant partial |
| White noise | 0 | variable | Noise, no stable frequency |
| Breath flutter | 0 | 800–4000 Hz | Inharmonic, spectral centroid-like |
| Bowed metal | ~180 Hz | ~180 Hz | Borderline, weakly harmonic |

---

### desc_voiced_prob

| Property     | Value |
|---|---|
| YAML field   | `desc_voiced_prob` |
| Status       | ✓ active |
| Range        | 0.0 – 1.0 |
| Display unit | probability |
| VectorSpace  | available as axis |

**What it measures.** Mean voiced probability per frame, output by pYIN.
A frame is "voiced" when the algorithm detects a periodic signal consistent
with a harmonic source. High values indicate a clearly pitched sound;
low values indicate noise, inharmonicity, or silence.

Acts as a **reliability flag for desc_f0**: if `desc_voiced_prob < 0.3`,
treat `desc_f0` as unreliable and prefer `desc_dom_freq`.

**Librosa command.** Computed alongside `desc_f0` (same pyin call, see above).

**Interpretation in GLIP.**
KIKI/BOUBA heuristic: `desc_voiced_prob < 0.3` biases toward Kiki (angular,
noisy glyph) independent of centroid value.

---

## 2. Spectral Shape

### desc_centroid

| Property     | Value |
|---|---|
| YAML field   | `desc_centroid` |
| Status       | ✓ active |
| Range        | ~100 – 8000 Hz (practical for acoustic sources) |
| Display unit | Hz |
| VectorSpace  | default X axis (spectral brightness) |

**What it measures.** The center of mass of the power spectrum. High values
indicate energy concentrated in high frequencies (bright, metallic, noisy);
low values indicate energy in low frequencies (dark, warm, tonal).
Not a frequency in the pitch sense — it is a weighted mean over the
entire spectrum including all partials and noise.

**Librosa command.**

```python
cent = librosa.feature.spectral_centroid(y=y, sr=sr)
desc_centroid = np.mean(cent)
```

---

### desc_flatness

| Property     | Value |
|---|---|
| YAML field   | `desc_flatness` |
| Status       | ✓ active |
| Range        | 0.0 – 1.0 |
| Display unit | ratio |
| VectorSpace  | available as axis |

**What it measures.** Ratio of geometric mean to arithmetic mean of the
power spectrum. Values near 1 indicate a flat, noise-like spectrum
(white noise = 1.0); values near 0 indicate a tonal, peaked spectrum
(pure sine = 0.0). Direct operationalization of the Kiki/Bouba axis
in spectral terms.

**Librosa command.**

```python
flatness = librosa.feature.spectral_flatness(y=y)
desc_flatness = np.mean(flatness)
```

---

## 3. Energy and Dynamics

### desc_rms

| Property     | Value |
|---|---|
| YAML field   | `desc_rms` |
| Status       | ✓ active |
| Range        | 0.0 – ~0.5 (normalized audio, rarely above 0.3) |
| Display unit | amplitude (linear) |
| VectorSpace  | available as axis |

**What it measures.** Root Mean Square energy — the mean perceptual loudness
of the signal. Maps to dot size in the Vector Space Navigator (larger = louder).

**Librosa command.**

```python
rms = librosa.feature.rms(y=y)
desc_rms = np.mean(rms)
```

---

## 4. Temporal Texture

### desc_zcr

| Property     | Value |
|---|---|
| YAML field   | `desc_zcr` |
| Status       | ✓ active |
| Range        | 0.0 – 0.5 (rate per sample) |
| Display unit | crossings/sample |
| VectorSpace  | available as axis |

**What it measures.** Zero-crossing rate — the frequency at which the
waveform crosses zero. High ZCR correlates with noise and high-frequency
content; low ZCR with slow, tonal signals. Fast approximation of
noisiness, computationally cheaper than flatness.

**Librosa command.**

```python
zcr = librosa.feature.zero_crossing_rate(y)
desc_zcr = np.mean(zcr)
```

---

## 5. Planned

| Field | Descriptor | Notes |
|---|---|---|
| `desc_bandwidth` | Spectral bandwidth | Spread around centroid — distinguishes narrow-band from broadband |
| `desc_rolloff` | Spectral rolloff | Frequency below which 85% of energy sits |
| `desc_onset_rate` | Onset density | Attacks per second — impulsive vs sustained |
| `desc_dur` | Duration | Segment length in seconds |
| `desc_mfcc_1`…`_13` | MFCC coefficients | Timbral fingerprint for ML/embedding |

---

## Vector Space Default Mapping

| Axis | Default field | Rationale |
|---|---|---|
| Y | `desc_dom_freq` | Frequency ordering low→high, works for all timbres |
| X | `desc_centroid` | Spectral brightness dark→bright |

This 2D space gives an intuitive perceptual layout:
bottom-left = dark, low, tonal (bass, cello sul tasto);
top-right = bright, high, noisy (piccolo, metal scrape, breath).
