import { createHash } from "node:crypto";
import { access, cp, mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function prepareRuntime(plan, lock) {
  await mkdir(dirname(plan.project), { recursive: true });
  let exists = false;
  try {
    await access(plan.project);
    exists = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!exists) {
    const stage = await mkdtemp(join(dirname(plan.project), ".project-"));
    try {
      // setuptools 会向源目录写 egg-info/build；只在缓存副本构建，保护随包快照及只读安装目录。
      await cp(plan.source, stage, { recursive: true });
      try {
        await rename(stage, plan.project);
      } catch (error) {
        if (!["ENOTEMPTY", "EEXIST", "EPERM"].includes(error.code)) throw error;
      }
    } finally {
      await rm(stage, { recursive: true, force: true });
    }
  }
  await verifyRuntimeProject(plan, lock);
}

export async function verifyRuntimeProject(plan, lock) {
  // uv 自己串行准备虚拟环境；缓存内构建产物可以存在，但受锁定的源文件不能漂移。
  for (const [path, expected] of Object.entries(lock.files)) {
    const actual = createHash("sha256")
      .update(await readFile(join(plan.project, path)))
      .digest("hex");
    if (actual !== expected)
      throw new Error(`Blender 缓存源码发生变化：${path}；请移除该 commit 的缓存后重新启用插件。`);
  }
}
