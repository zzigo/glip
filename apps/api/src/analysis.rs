use serde::{Serialize, Deserialize};
use std::process::Command;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct AnalysisData {
    pub waveform: Vec<f32>,
    pub harmonic: Vec<f32>,
    pub percussive: Vec<f32>,
    pub centroid: Vec<f32>,
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
S = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=64)
S_db = librosa.power_to_db(S, ref=np.max)

def downsample(data, target=500):
    if len(data.shape) > 1: data = data[0]
    if len(data) <= target: return data.tolist()
    return [float(x) for x in data[::len(data)//target]]

result = {{
    "waveform": downsample(y),
    "harmonic": downsample(y_h),
    "percussive": downsample(y_p),
    "centroid": downsample(cent),
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
