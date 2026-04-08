use serde::Serialize;
use crate::glino::GlinoQuery;

#[derive(Debug, Serialize, Clone)]
pub struct TAE {
    pub id: String,
    pub score: f32,
    pub audio: String,
    pub symbol: String,
    pub descriptors: serde_json::Value,  // desc_centroid, desc_rms, desc_f0, etc.
}

#[derive(Debug, Serialize, Clone)]
pub struct TimelineEvent {
    pub tae_id: String,
    pub audio: String,
    pub symbol: String,
    pub start: f32,
    pub duration: f32,
    pub gain: f32,
    pub reverse: bool,
}

pub fn generate_timeline(results: Vec<TAE>, query: &GlinoQuery) -> Vec<TimelineEvent> {
    let mut timeline = Vec::new();
    let mut current_time = 0.0;

    // 1. Determine base timing from time_spec (e.g., 4t90)
    let mut step_duration = 0.25; // default step
    let mut event_duration = 0.3;  // default event length

    if let Some(time_spec) = &query.time_spec {
        if let Some(t_pos) = time_spec.find('t') {
            if let Ok(bpm) = time_spec[t_pos+1..].parse::<f32>() {
                let beat_duration = 60.0 / bpm;
                step_duration = beat_duration;
                event_duration = beat_duration * 1.1; 
            }
        }
    }

    // 2. Apply transformations
    if let Some(stretch) = query.transform_stretch {
        event_duration *= stretch;
    }
    
    let is_reverse = query.transform_reverse;

    // 3. Structure: Continuity
    let mut overlap = 0.0;
    if let Some(continuity) = query.struct_continuity {
        overlap = event_duration * (continuity / 10.0) * 0.5;
    }

    // 4. Sequence limit and Clustering
    let limit = query.struct_sequence.unwrap_or(results.len());
    let results_to_use = results.into_iter().take(limit);

    for result in results_to_use {
        timeline.push(TimelineEvent {
            tae_id: result.id.clone(),
            audio: result.audio.clone(),
            symbol: result.symbol.clone(),
            start: current_time,
            duration: event_duration,
            gain: 0.8,
            reverse: is_reverse,
        });

        current_time += step_duration - overlap;
        if current_time < 0.0 { current_time = 0.0; }
    }

    timeline
}
