use serde::{Serialize, Deserialize};
use std::process::Command;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct AnalysisData {
    pub waveform: Vec<f32>,
    pub harmonic: Vec<f32>,
    pub percussive: Vec<f32>,
    pub centroid: Vec<f32>,
    pub rms: Vec<f32>,
    pub f0: Vec<f32>,
    pub dom_freq: Vec<f32>,     // piptrack dominant peak — works for inharmonic sounds
    pub voiced_prob: Vec<f32>,  // pyin voiced probability — confidence in f0
    pub zcr: Vec<f32>,
    pub flatness: Vec<f32>,
    pub spectrogram: Vec<Vec<f32>>,
}

pub fn get_analysis(audio_file: &str) -> Option<AnalysisData> {
    let path = PathBuf::from("/opt/glip/data/audio").join(audio_file);
    if !path.exists() { return None; }

    let output = Command::new("/opt/glip/apps/indexer/venv/bin/python3")
        .arg("-c")
        .arg(format!(r#"
import librosa
import numpy as np
import json
import sys

y, sr = librosa.load('{}', duration=30)
y_h, y_p = librosa.effects.hpss(y)
cent = librosa.feature.spectral_centroid(y=y, sr=sr)
rms = librosa.feature.rms(y=y)
f0, voiced_flag, voiced_probs = librosa.pyin(y, fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C7'))
zcr = librosa.feature.zero_crossing_rate(y)
flatness = librosa.feature.spectral_flatness(y=y)
S = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=64)
S_db = librosa.power_to_db(S, ref=np.max)

# piptrack: dominant frequency per frame by energy — works for inharmonic sounds
# where pyin returns NaN (unvoiced). Takes the peak with max magnitude each frame.
pitches, magnitudes = librosa.piptrack(y=y, sr=sr)
dom_pitches = []
for i in range(magnitudes.shape[1]):
    col = magnitudes[:, i]
    idx = int(col.argmax())
    p = float(pitches[idx, i])
    dom_pitches.append(p if p > 20.0 else 0.0)  # discard sub-20Hz artefacts
dom_freq = np.array(dom_pitches, dtype=np.float32)

def downsample(data, target=500):
    if hasattr(data, 'shape') and len(data.shape) > 1: data = data[0]
    data = np.nan_to_num(np.asarray(data, dtype=np.float32))
    if len(data) <= target: return data.tolist()
    return [float(x) for x in data[::len(data)//target]]

result = {{
    "waveform": downsample(y),
    "harmonic": downsample(y_h),
    "percussive": downsample(y_p),
    "centroid": downsample(cent),
    "rms": downsample(rms),
    "f0": downsample(f0),
    "dom_freq": downsample(dom_freq),
    "voiced_prob": downsample(voiced_probs),
    "zcr": downsample(zcr),
    "flatness": downsample(flatness),
    "spectrogram": S_db.tolist()
}}
print(json.dumps(result))
"#, path.to_str().unwrap()))
        .output()
        .ok()?;

    if output.status.success() {
        let out_str = String::from_utf8_lossy(&output.stdout);
        serde_json::from_str(&out_str).ok()
    } else {
        None
    }
}
