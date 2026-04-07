use regex::Regex;
use serde::Serialize;

#[derive(Debug, Default, Clone, Serialize)]
pub struct GlinoQuery {
    pub is_list: bool,
    pub source: Option<String>,
    pub filter_constraint: Option<String>,
    pub filter_descriptor: Option<String>,
    pub transform_mapping: Option<String>,
    pub transform_stretch: Option<f32>,
    pub transform_reverse: bool,
    pub struct_sequence: Option<usize>,
    pub struct_continuity: Option<f32>,
    pub struct_cluster: Option<usize>,
    pub time_spec: Option<String>,
}

/// A parser for GLINO v0.1
pub fn parse_query(q: &str) -> GlinoQuery {
    let mut query = GlinoQuery::default();

    if q.trim() == "list" {
        query.is_list = true;
        return query;
    }

    // 1. Source: glip:keyword
    let re_source = Regex::new(r"glip:([a-zA-Z0-9_*]+)").unwrap();
    if let Some(caps) = re_source.captures(q) {
        query.source = Some(caps[1].to_string());
    }

    // 2. Filter Constraint: '<0.5
    let re_constraint = Regex::new(r"'([<>=.0-9]+)").unwrap();
    if let Some(caps) = re_constraint.captures(q) {
        query.filter_constraint = Some(caps[1].to_string());
    }

    // 3. Filter Descriptor: #noisy
    let re_descriptor = Regex::new(r"#([a-zA-Z0-9_]+)").unwrap();
    if let Some(caps) = re_descriptor.captures(q) {
        query.filter_descriptor = Some(caps[1].to_string());
    }

    // 4. Transform Mapping: m(f+3)
    let re_mapping = Regex::new(r"m\(([^)]+)\)").unwrap();
    if let Some(caps) = re_mapping.captures(q) {
        query.transform_mapping = Some(caps[1].to_string());
    }

    // 5. Transform Stretch: .str8
    let re_stretch = Regex::new(r"\.str([0-9.]+)").unwrap();
    if let Some(caps) = re_stretch.captures(q) {
        query.transform_stretch = caps[1].parse::<f32>().ok();
    }

    // 6. Transform Reverse: .r
    if q.contains(".r") {
        query.transform_reverse = true;
    }

    // 7. Structure Sequence: [20]
    let re_sequence = Regex::new(r"\[([0-9]+)\]").unwrap();
    if let Some(caps) = re_sequence.captures(q) {
        query.struct_sequence = caps[1].parse::<usize>().ok();
    }

    // 8. Structure Continuity: *9
    let re_continuity = Regex::new(r"\*([0-9.]+)").unwrap();
    if let Some(caps) = re_continuity.captures(q) {
        query.struct_continuity = caps[1].parse::<f32>().ok();
    }

    // 9. Structure Cluster: .clu5
    let re_cluster = Regex::new(r"\.clu([0-9]+)").unwrap();
    if let Some(caps) = re_cluster.captures(q) {
        query.struct_cluster = caps[1].parse::<usize>().ok();
    }

    // 10. Time Spec: (4t90)
    let re_time = Regex::new(r"\(([^)]+)\)").unwrap();
    if let Some(caps) = re_time.captures(q) {
        query.time_spec = Some(caps[1].to_string());
    }

    // Fallback for old near("keyword") syntax
    if query.source.is_none() {
        let re_near = Regex::new(r#"near\("([^"]+)"\)"#).unwrap();
        if let Some(caps) = re_near.captures(q) {
            query.source = Some(caps[1].to_string());
        }
    }

    query
}
