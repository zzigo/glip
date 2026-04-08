use serde_json::Value;

pub struct GlilyResult {
    pub svg: String,
    pub lilypond: String,
}

pub fn parse_to_symbol(glily_str: &str, descriptors: Option<&Value>) -> GlilyResult {
    // Basic Kiki/Bouba inspired generative module
    
    let mut is_kiki = false; // Sharp, noisy, bright
    let mut size = 50.0;
    let mut stretch = 1.0;
    
    if let Some(desc) = descriptors {
        let centroid = desc.get("desc_centroid").and_then(|v| v.as_f64()).unwrap_or(2000.0);
        // desc_flatness: 0=pure tone (Bouba), 1=pure noise (Kiki). Use instead of missing desc_harmonicity.
        let flatness = desc.get("desc_flatness").and_then(|v| v.as_f64()).unwrap_or(0.3);
        let rms = desc.get("desc_rms").and_then(|v| v.as_f64()).unwrap_or(0.1);
        let dur = desc.get("audio_duration").and_then(|v| v.as_f64()).unwrap_or(1.0);

        // Kiki vs Bouba heuristic: high centroid or flat spectrum → spiky/noisy Kiki
        if centroid > 3000.0 || flatness > 0.5 {
            is_kiki = true;
        }
        
        size = 20.0 + (rms * 300.0).min(60.0); // Map rms to radius/size
        stretch = dur.max(0.2).min(5.0); // Map duration to width
    }
    
    // Override if explicit glily notation provided
    let mut svg = String::new();
    if glily_str.contains("cl.m") {
        svg = r#"<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="30" r="5" fill="white" stroke="white" stroke-width="2"/>
            <line x1="50" y1="35" x2="50" y2="80" stroke="white" stroke-width="2"/>
            <circle cx="45" cy="45" r="3" fill="white"/>
            <circle cx="55" cy="55" r="3" fill="none" stroke="white"/>
            <text x="10" y="95" fill="white" font-size="10">cl.m</text>
        </svg>"#.to_string();
    } else {
        // Generate SVG
        let w = 100.0 * stretch;
        let h = 100.0;
        let cx = w / 2.0;
        let cy = h / 2.0;
        
        if is_kiki {
            // Spiky (Kiki)
            let mut points = String::new();
            let num_points = 8;
            for i in 0..(num_points * 2) {
                let r = if i % 2 == 0 { size } else { size * 0.3 };
                let angle = (i as f64) * std::f64::consts::PI / (num_points as f64);
                let px = cx + r * angle.cos();
                let py = cy + r * angle.sin();
                points.push_str(&format!("{},{} ", px, py));
            }
            svg = format!(r##"<svg viewBox="0 0 {} {}" xmlns="http://www.w3.org/2000/svg">
                <polygon points="{}" fill="none" stroke="#00ff88" stroke-width="2"/>
            </svg>"##, w, h, points);
        } else {
            // Smooth (Bouba)
            svg = format!(r##"<svg viewBox="0 0 {} {}" xmlns="http://www.w3.org/2000/svg">
                <ellipse cx="{}" cy="{}" rx="{}" ry="{}" fill="none" stroke="#00ff88" stroke-width="2"/>
            </svg>"##, w, h, cx, cy, size * stretch.min(2.0), size);
        }
    }

    GlilyResult {
        svg,
        lilypond: r#"\relative c' { c4 d e f }"#.to_string(),
    }
}
