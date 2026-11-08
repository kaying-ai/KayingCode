export function rendererInfo(output) {
  const renderer =
    output
      .split(/\r?\n/)
      .find((line) => /^\s*GLES:/.test(line))
      ?.trim() ?? null;
  const softwareRendering = renderer
    ? /SwiftShader|llvmpipe|softpipe|software raster/i.test(renderer)
    : null;
  return {
    renderer,
    softwareRendering,
    renderingWarning:
      softwareRendering === true
        ? "检测到软件渲染；已有模拟器不会自动重启。下次启动优先 host GPU，并再次检查实际 GLES。"
        : renderer
          ? null
          : "未取得 GLES 渲染器，不能确认硬件加速。",
  };
}

export async function inspectRendering(adapter) {
  let output = "";
  try {
    output = (await adapter.adb(["shell", "dumpsys", "SurfaceFlinger"])).toString();
  } catch {
    /* 设备可操作但渲染诊断不可用。 */
  }
  return rendererInfo(output);
}
