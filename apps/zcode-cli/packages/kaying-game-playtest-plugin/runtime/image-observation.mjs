import { writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export function validateRegion(region, shot) {
  if (!region) return { x: 0, y: 0, width: shot.width, height: shot.height };
  const { x, y, width, height } = region;
  if (
    ![x, y, width, height].every(Number.isInteger) ||
    x < 0 ||
    y < 0 ||
    width < 1 ||
    height < 1 ||
    x + width > shot.width ||
    y + height > shot.height
  )
    throw new Error("Observation region out of original screenshot bounds");
  return region;
}
export class FrameStability {
  push(pixels, now) {
    let delta = Infinity;
    if (this.previous?.length === pixels.length) {
      delta =
        pixels.reduce((sum, value, index) => sum + Math.abs(value - this.previous[index]), 0) /
        pixels.length /
        255;
    }
    if (delta <= 0.006) this.count++;
    else {
      this.count = 1;
      this.since = now;
    }
    this.previous = pixels;
    return this.count >= 3 && now - this.since >= 250;
  }
}
export async function sampleFrame(run, directory, frame, region) {
  const path = join(directory, "screenshots", `.sample-${randomUUID()}.png`);
  try {
    await writeFile(path, frame.bytes, { flag: "wx" });
    return await run(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-threads",
        "1",
        "-filter_threads",
        "1",
        "-i",
        path,
        "-vf",
        `crop=${region.width}:${region.height}:${region.x}:${region.y},scale=64:64:flags=area,format=gray`,
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "gray",
        "pipe:1",
      ],
      { timeoutMs: 5000 },
    );
  } finally {
    await rm(path, { force: true });
  }
}
export async function preview(run, path, shot, maxWidth) {
  if (!maxWidth || shot.width <= maxWidth) return {};
  const height = Math.round((shot.height * maxWidth) / shot.width);
  const previewImagePath = `${path}.preview.png`;
  try {
    await run(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-threads",
        "1",
        "-filter_threads",
        "1",
        "-i",
        path,
        "-vf",
        `scale=${maxWidth}:${height}`,
        "-frames:v",
        "1",
        "-y",
        previewImagePath,
      ],
      { timeoutMs: 5000 },
    );
    return {
      previewImagePath,
      preview: {
        width: maxWidth,
        height,
        scaleX: shot.width / maxWidth,
        scaleY: shot.height / height,
        coordinateSystem: "original-pixels",
      },
    };
  } catch {
    return { previewLimitation: "缩略图不可用，返回原图；原图仍是坐标基准。" };
  }
}
