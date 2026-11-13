//! Pixel-exact comparison for two same-sized PNG screenshots.
//!
//! The profile owns all thresholds. The CLI never resizes or crops silently:
//! every metric is calculated at the same source/target `(x, y)` coordinate.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use image::{ImageBuffer, ImageReader, Rgb, RgbImage};
use serde::{Deserialize, Serialize};

use crate::util::{ensure_dir, read_text, CliError, CliResult};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CompareProfile {
    schema_version: u32,
    checkpoint: String,
    reason: String,
    /// Deterministic checkpoint state (e.g. `title`, `race-paused`).
    #[serde(default)]
    state: Option<String>,
    /// How time/animation was frozen (e.g. `self.st=4.5`, `paused`).
    #[serde(default)]
    freeze: Option<String>,
    thresholds: Thresholds,
    #[serde(default)]
    regions: Vec<RegionProfile>,
    #[serde(default)]
    masks: Vec<MaskProfile>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Thresholds {
    pixel_delta: u8,
    changed_pixel_ratio_max: f64,
    rgb_mae_max: f64,
    rgb_rmse_max: f64,
    ssim_min: f64,
    median_luma_delta_max: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RegionProfile {
    id: String,
    reason: String,
    rect: Rect,
    #[serde(default = "default_true")]
    required: bool,
    thresholds: Thresholds,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MaskProfile {
    id: String,
    reason: String,
    rect: Rect,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Rect {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MetricsDocument {
    schema_version: u32,
    checkpoint: String,
    reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    state: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    freeze: Option<String>,
    dimensions: Dimensions,
    source_file: String,
    target_file: String,
    diff_file: String,
    masks: Vec<MaskMetric>,
    global: RegionMetric,
    regions: Vec<RegionMetric>,
    verdict: Verdict,
}

#[derive(Serialize)]
struct Dimensions {
    width: u32,
    height: u32,
}

#[derive(Serialize)]
struct MaskMetric {
    id: String,
    reason: String,
    rect: Rect,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RegionMetric {
    id: String,
    reason: String,
    required: bool,
    rect: Rect,
    included_pixels: u64,
    changed_pixels: u64,
    changed_pixel_ratio: f64,
    rgb_mae: Channels,
    rgb_rmse: Channels,
    ssim: f64,
    median_luma: MedianLuma,
    thresholds: Thresholds,
    passed: bool,
    failed_checks: Vec<String>,
}

#[derive(Serialize)]
struct Channels {
    r: f64,
    g: f64,
    b: f64,
    mean: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MedianLuma {
    source: f64,
    target: f64,
    absolute_delta: f64,
    relative_delta: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Verdict {
    passed: bool,
    failed_required_regions: Vec<String>,
}

#[derive(Debug)]
pub struct CompareResult {
    pub passed: bool,
    pub changed_pixel_ratio: f64,
    pub rgb_mae: f64,
    pub rgb_rmse: f64,
    pub ssim: f64,
    pub json: String,
}

pub fn run(
    source_path: &Path,
    target_path: &Path,
    profile_path: &Path,
    out: &Path,
) -> CliResult<CompareResult> {
    let profile: CompareProfile = serde_json::from_str(&read_text(profile_path)?)
        .map_err(|error| CliError(format!("parse {}: {error}", profile_path.display())))?;
    validate_profile(&profile)?;
    let state_ok = profile
        .state
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty());
    let freeze_ok = profile
        .freeze
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty());
    if !state_ok || !freeze_ok {
        crate::errln!(
            "warn: compare profile 缺 state/freeze —— 动画/计时画面可能不是同一相位；\
             建议写 state（如 title/race-paused）和 freeze（如 self.st=4.5 或 paused）"
        );
    }

    let source = decode_rgb(source_path)?;
    let target = decode_rgb(target_path)?;
    if source.dimensions() != target.dimensions() {
        return Err(CliError(format!(
            "image dimensions differ: source={}x{}, target={}x{}; resize/crop is never implicit",
            source.width(),
            source.height(),
            target.width(),
            target.height()
        )));
    }
    let bounds = Rect {
        x: 0,
        y: 0,
        width: source.width(),
        height: source.height(),
    };
    validate_rects(&profile, bounds)?;
    ensure_dir(out)?;

    let source_out = out.join("source.png");
    let target_out = out.join("target.png");
    let diff_out = out.join("diff.png");
    copy_evidence(source_path, &source_out)?;
    copy_evidence(target_path, &target_out)?;
    write_diff(&source, &target, &profile.masks, &diff_out)?;

    let global = calculate_region(
        "global",
        &profile.reason,
        true,
        bounds,
        &profile.thresholds,
        &source,
        &target,
        &profile.masks,
    )?;
    let regions = profile
        .regions
        .iter()
        .map(|region| {
            calculate_region(
                &region.id,
                &region.reason,
                region.required,
                region.rect,
                &region.thresholds,
                &source,
                &target,
                &profile.masks,
            )
        })
        .collect::<CliResult<Vec<_>>>()?;

    let mut failed_required_regions = Vec::new();
    if !global.passed {
        failed_required_regions.push(global.id.clone());
    }
    failed_required_regions.extend(
        regions
            .iter()
            .filter(|region| region.required && !region.passed)
            .map(|region| region.id.clone()),
    );
    let passed = failed_required_regions.is_empty();
    let summary = CompareResult {
        passed,
        changed_pixel_ratio: global.changed_pixel_ratio,
        rgb_mae: global.rgb_mae.mean,
        rgb_rmse: global.rgb_rmse.mean,
        ssim: global.ssim,
        json: String::new(),
    };
    let document = MetricsDocument {
        schema_version: 1,
        checkpoint: profile.checkpoint,
        reason: profile.reason,
        state: profile.state,
        freeze: profile.freeze,
        dimensions: Dimensions {
            width: source.width(),
            height: source.height(),
        },
        source_file: source_out.display().to_string(),
        target_file: target_out.display().to_string(),
        diff_file: diff_out.display().to_string(),
        masks: profile
            .masks
            .into_iter()
            .map(|mask| MaskMetric {
                id: mask.id,
                reason: mask.reason,
                rect: mask.rect,
            })
            .collect(),
        global,
        regions,
        verdict: Verdict {
            passed,
            failed_required_regions,
        },
    };
    let json = serde_json::to_string_pretty(&document)
        .map_err(|error| CliError(format!("serialize metrics: {error}")))?
        + "\n";
    fs::write(out.join("metrics.json"), &json)
        .map_err(|error| CliError(format!("write {}/metrics.json: {error}", out.display())))?;
    Ok(CompareResult { json, ..summary })
}

fn decode_rgb(path: &Path) -> CliResult<RgbImage> {
    let reader = ImageReader::open(path)
        .map_err(|error| CliError(format!("open {}: {error}", path.display())))?
        .with_guessed_format()
        .map_err(|error| CliError(format!("detect {}: {error}", path.display())))?;
    if reader.format() != Some(image::ImageFormat::Png) {
        return Err(CliError(format!("{} is not a PNG image", path.display())));
    }
    reader
        .decode()
        .map(|image| image.to_rgb8())
        .map_err(|error| CliError(format!("decode {}: {error}", path.display())))
}

fn validate_profile(profile: &CompareProfile) -> CliResult<()> {
    if profile.schema_version != 1 {
        return Err(CliError(format!(
            "unsupported compare profile schemaVersion {}",
            profile.schema_version
        )));
    }
    if profile.checkpoint.trim().is_empty() || profile.reason.trim().is_empty() {
        return Err(CliError(
            "profile checkpoint and reason must be non-empty".into(),
        ));
    }
    validate_thresholds(&profile.thresholds, "global thresholds")?;
    let mut ids = HashSet::new();
    for region in &profile.regions {
        if region.id.trim().is_empty()
            || region.reason.trim().is_empty()
            || !ids.insert(format!("region:{}", region.id))
        {
            return Err(CliError(format!(
                "invalid or duplicate region id '{}'",
                region.id
            )));
        }
        validate_thresholds(
            &region.thresholds,
            &format!("region '{}' thresholds", region.id),
        )?;
    }
    for mask in &profile.masks {
        if mask.id.trim().is_empty()
            || mask.reason.trim().is_empty()
            || !ids.insert(format!("mask:{}", mask.id))
        {
            return Err(CliError(format!(
                "invalid or duplicate mask id '{}'",
                mask.id
            )));
        }
    }
    Ok(())
}

fn validate_thresholds(value: &Thresholds, label: &str) -> CliResult<()> {
    let values = [
        value.changed_pixel_ratio_max,
        value.rgb_mae_max,
        value.rgb_rmse_max,
        value.ssim_min,
        value.median_luma_delta_max,
    ];
    if values.iter().any(|number| !number.is_finite())
        || !(0.0..=1.0).contains(&value.changed_pixel_ratio_max)
        || !(0.0..=255.0).contains(&value.rgb_mae_max)
        || !(0.0..=255.0).contains(&value.rgb_rmse_max)
        || !(0.0..=1.0).contains(&value.ssim_min)
        || !(0.0..=255.0).contains(&value.median_luma_delta_max)
    {
        return Err(CliError(format!("{label} contain out-of-range values")));
    }
    Ok(())
}

fn validate_rects(profile: &CompareProfile, bounds: Rect) -> CliResult<()> {
    for (kind, id, rect) in profile
        .regions
        .iter()
        .map(|entry| ("region", entry.id.as_str(), entry.rect))
        .chain(
            profile
                .masks
                .iter()
                .map(|entry| ("mask", entry.id.as_str(), entry.rect)),
        )
    {
        if rect.width == 0
            || rect.height == 0
            || rect
                .x
                .checked_add(rect.width)
                .is_none_or(|right| right > bounds.width)
            || rect
                .y
                .checked_add(rect.height)
                .is_none_or(|bottom| bottom > bounds.height)
        {
            return Err(CliError(format!("{kind} '{id}' is outside image bounds")));
        }
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn calculate_region(
    id: &str,
    reason: &str,
    required: bool,
    rect: Rect,
    thresholds: &Thresholds,
    source: &RgbImage,
    target: &RgbImage,
    masks: &[MaskProfile],
) -> CliResult<RegionMetric> {
    let mut count = 0u64;
    let mut changed = 0u64;
    let mut abs = [0f64; 3];
    let mut squares = [0f64; 3];
    let mut source_luma = Vec::new();
    let mut target_luma = Vec::new();
    for y in rect.y..rect.y + rect.height {
        for x in rect.x..rect.x + rect.width {
            if masks.iter().any(|mask| contains(mask.rect, x, y)) {
                continue;
            }
            let left = source.get_pixel(x, y).0;
            let right = target.get_pixel(x, y).0;
            let mut changed_pixel = false;
            for channel in 0..3 {
                let delta = (f64::from(left[channel]) - f64::from(right[channel])).abs();
                abs[channel] += delta;
                squares[channel] += delta * delta;
                changed_pixel |= delta > f64::from(thresholds.pixel_delta);
            }
            changed += u64::from(changed_pixel);
            count += 1;
            source_luma.push(luma(left));
            target_luma.push(luma(right));
        }
    }
    if count == 0 {
        return Err(CliError(format!("region '{id}' has no unmasked pixels")));
    }
    let divisor = count as f64;
    let mae_values = abs.map(|value| value / divisor);
    let rmse_values = squares.map(|value| (value / divisor).sqrt());
    let rgb_mae = channels(mae_values);
    let rgb_rmse = channels(rmse_values);
    let ssim = structural_similarity(&source_luma, &target_luma);
    let source_median = median(&mut source_luma);
    let target_median = median(&mut target_luma);
    let luma_delta = (source_median - target_median).abs();
    let changed_pixel_ratio = changed as f64 / divisor;
    let mut failed_checks = Vec::new();
    if changed_pixel_ratio > thresholds.changed_pixel_ratio_max {
        failed_checks.push("changedPixelRatio".into());
    }
    if rgb_mae.mean > thresholds.rgb_mae_max {
        failed_checks.push("rgbMae".into());
    }
    if rgb_rmse.mean > thresholds.rgb_rmse_max {
        failed_checks.push("rgbRmse".into());
    }
    if ssim < thresholds.ssim_min {
        failed_checks.push("ssim".into());
    }
    if luma_delta > thresholds.median_luma_delta_max {
        failed_checks.push("medianLumaDelta".into());
    }
    Ok(RegionMetric {
        id: id.into(),
        reason: reason.into(),
        required,
        rect,
        included_pixels: count,
        changed_pixels: changed,
        changed_pixel_ratio,
        rgb_mae,
        rgb_rmse,
        ssim,
        median_luma: MedianLuma {
            source: source_median,
            target: target_median,
            absolute_delta: luma_delta,
            relative_delta: luma_delta / source_median.max(1.0),
        },
        thresholds: thresholds.clone(),
        passed: failed_checks.is_empty(),
        failed_checks,
    })
}

fn channels(value: [f64; 3]) -> Channels {
    Channels {
        r: value[0],
        g: value[1],
        b: value[2],
        mean: value.iter().sum::<f64>() / 3.0,
    }
}

fn luma(pixel: [u8; 3]) -> f64 {
    0.2126 * f64::from(pixel[0]) + 0.7152 * f64::from(pixel[1]) + 0.0722 * f64::from(pixel[2])
}

fn median(values: &mut [f64]) -> f64 {
    values.sort_by(f64::total_cmp);
    let middle = values.len() / 2;
    if values.len() % 2 == 0 {
        (values[middle - 1] + values[middle]) / 2.0
    } else {
        values[middle]
    }
}

fn structural_similarity(source: &[f64], target: &[f64]) -> f64 {
    let count = source.len() as f64;
    let source_mean = source.iter().sum::<f64>() / count;
    let target_mean = target.iter().sum::<f64>() / count;
    let divisor = (count - 1.0).max(1.0);
    let source_variance = source
        .iter()
        .map(|value| (value - source_mean).powi(2))
        .sum::<f64>()
        / divisor;
    let target_variance = target
        .iter()
        .map(|value| (value - target_mean).powi(2))
        .sum::<f64>()
        / divisor;
    let covariance = source
        .iter()
        .zip(target)
        .map(|(left, right)| (left - source_mean) * (right - target_mean))
        .sum::<f64>()
        / divisor;
    let c1 = (0.01_f64 * 255.0).powi(2);
    let c2 = (0.03_f64 * 255.0).powi(2);
    (((2.0 * source_mean * target_mean + c1) * (2.0 * covariance + c2))
        / ((source_mean.powi(2) + target_mean.powi(2) + c1)
            * (source_variance + target_variance + c2)))
        .clamp(-1.0, 1.0)
}

fn write_diff(
    source: &RgbImage,
    target: &RgbImage,
    masks: &[MaskProfile],
    path: &Path,
) -> CliResult<()> {
    let mut diff: RgbImage = ImageBuffer::new(source.width(), source.height());
    for (x, y, pixel) in diff.enumerate_pixels_mut() {
        if masks.iter().any(|mask| contains(mask.rect, x, y)) {
            *pixel = Rgb([32, 32, 32]);
            continue;
        }
        let left = source.get_pixel(x, y).0;
        let right = target.get_pixel(x, y).0;
        let delta = (0..3)
            .map(|channel| left[channel].abs_diff(right[channel]))
            .max()
            .unwrap_or(0);
        *pixel = Rgb([delta.saturating_mul(4), delta / 4, delta / 8]);
    }
    diff.save(path)
        .map_err(|error| CliError(format!("write {}: {error}", path.display())))
}

fn contains(rect: Rect, x: u32, y: u32) -> bool {
    x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height
}

fn copy_evidence(source: &Path, destination: &Path) -> CliResult<()> {
    let source_abs = absolute(source)?;
    let destination_abs = absolute(destination)?;
    if source_abs == destination_abs {
        return Ok(());
    }
    fs::copy(source, destination).map(|_| ()).map_err(|error| {
        CliError(format!(
            "copy {} to {}: {error}",
            source.display(),
            destination.display()
        ))
    })
}

fn absolute(path: &Path) -> CliResult<PathBuf> {
    if path.is_absolute() {
        Ok(path.to_path_buf())
    } else {
        std::env::current_dir()
            .map(|cwd| cwd.join(path))
            .map_err(|error| CliError(format!("resolve {}: {error}", path.display())))
    }
}

fn default_true() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn identical_images_pass_and_write_evidence() {
        let root = temp("pass");
        fs::create_dir_all(&root).unwrap();
        let source = root.join("left.png");
        let target = root.join("right.png");
        let profile = root.join("profile.json");
        let out = root.join("out");
        let image = ImageBuffer::from_pixel(4, 4, Rgb([20u8, 30u8, 40u8]));
        image.save(&source).unwrap();
        image.save(&target).unwrap();
        fs::write(&profile, profile_json(0.0)).unwrap();
        let result = run(&source, &target, &profile, &out).unwrap();
        assert!(result.passed);
        assert_eq!(result.changed_pixel_ratio, 0.0);
        assert!(out.join("diff.png").is_file());
        assert!(out.join("metrics.json").is_file());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn changed_required_region_fails() {
        let root = temp("fail");
        fs::create_dir_all(&root).unwrap();
        let source = root.join("left.png");
        let target = root.join("right.png");
        let profile = root.join("profile.json");
        let out = root.join("out");
        ImageBuffer::from_pixel(4, 4, Rgb([0u8, 0u8, 0u8]))
            .save(&source)
            .unwrap();
        ImageBuffer::from_pixel(4, 4, Rgb([255u8, 255u8, 255u8]))
            .save(&target)
            .unwrap();
        fs::write(&profile, profile_json(0.0)).unwrap();
        let result = run(&source, &target, &profile, &out).unwrap();
        assert!(!result.passed);
        assert_eq!(result.changed_pixel_ratio, 1.0);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn mask_excludes_known_dynamic_pixel_and_required_roi_still_passes() {
        let root = temp("mask-roi");
        fs::create_dir_all(&root).unwrap();
        let source = root.join("left.png");
        let target = root.join("right.png");
        let profile = root.join("profile.json");
        let out = root.join("out");
        let left = ImageBuffer::from_pixel(4, 4, Rgb([20u8, 30u8, 40u8]));
        let mut right = left.clone();
        right.put_pixel(0, 0, Rgb([255u8, 255u8, 255u8]));
        left.save(&source).unwrap();
        right.save(&target).unwrap();
        fs::write(
            &profile,
            r#"{
              "schemaVersion": 1,
              "checkpoint": "paused",
              "reason": "deterministic frame",
              "thresholds": {
                "pixelDelta": 0,
                "changedPixelRatioMax": 0,
                "rgbMaeMax": 0,
                "rgbRmseMax": 0,
                "ssimMin": 1,
                "medianLumaDeltaMax": 0
              },
              "regions": [{
                "id": "board",
                "reason": "required board pixels",
                "rect": { "x": 1, "y": 1, "width": 2, "height": 2 },
                "required": true,
                "thresholds": {
                  "pixelDelta": 0,
                  "changedPixelRatioMax": 0,
                  "rgbMaeMax": 0,
                  "rgbRmseMax": 0,
                  "ssimMin": 1,
                  "medianLumaDeltaMax": 0
                }
              }],
              "masks": [{
                "id": "timer",
                "reason": "known dynamic pixel",
                "rect": { "x": 0, "y": 0, "width": 1, "height": 1 }
              }]
            }"#,
        )
        .unwrap();
        let result = run(&source, &target, &profile, &out).unwrap();
        assert!(result.passed);
        assert_eq!(result.changed_pixel_ratio, 0.0);
        assert!(result.json.contains("\"board\""));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn dimension_mismatch_never_resizes_implicitly() {
        let root = temp("dimensions");
        fs::create_dir_all(&root).unwrap();
        let source = root.join("left.png");
        let target = root.join("right.png");
        let profile = root.join("profile.json");
        ImageBuffer::from_pixel(4, 4, Rgb([0u8, 0u8, 0u8]))
            .save(&source)
            .unwrap();
        ImageBuffer::from_pixel(3, 4, Rgb([0u8, 0u8, 0u8]))
            .save(&target)
            .unwrap();
        fs::write(&profile, profile_json(0.0)).unwrap();
        let error = run(&source, &target, &profile, &root.join("out")).unwrap_err();
        assert!(error.0.contains("resize/crop is never implicit"));
        fs::remove_dir_all(root).unwrap();
    }

    fn profile_json(changed_max: f64) -> String {
        format!(
            r#"{{
              "schemaVersion": 1,
              "checkpoint": "paused",
              "reason": "deterministic frame",
              "thresholds": {{
                "pixelDelta": 0,
                "changedPixelRatioMax": {changed_max},
                "rgbMaeMax": 0,
                "rgbRmseMax": 0,
                "ssimMin": 1,
                "medianLumaDeltaMax": 0
              }},
              "regions": [],
              "masks": []
            }}"#
        )
    }

    fn temp(label: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "t3m-compare-{label}-{}-{stamp}",
            std::process::id()
        ))
    }
}
