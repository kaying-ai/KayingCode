import Taro from "@tarojs/taro";
import { findMobileAccount } from "@kayingcode/mobile-client-core";
import { projectKey, parseProjectMessage, type RecentProject } from "./projectNavigation";
export { projectKey, parseProjectMessage, type RecentProject } from "./projectNavigation";
const key = "mobileRecentProjectsV1";
let writes = Promise.resolve();
export async function listRecentProjects(): Promise<RecentProject[]> {
  const info = await Taro.getStorageInfo();
  if (!("keys" in info) || !Array.isArray(info.keys)) throw new Error("无法读取项目存储");
  if (!info.keys.includes(key)) return [];
  {
    const { data } = await Taro.getStorage({ key });
    return Array.isArray(data)
      ? data.filter(
          (p): p is RecentProject =>
            p &&
            typeof p.accountId === "string" &&
            Number.isFinite(p.lastUsedAt) &&
            parseProjectMessage({ ...p, type: "kayingcode.project-opened.v1" }) !== null &&
            findMobileAccount(p.accountId)?.backendType === "kayingcode",
        )
      : [];
  }
}
export function rememberProject(accountId: string, value: unknown): Promise<void> {
  const project = parseProjectMessage(value);
  if (!project || findMobileAccount(accountId)?.backendType !== "kayingcode")
    return Promise.resolve();
  const next = writes
    .catch(() => {})
    .then(async () => {
      const entry = { ...project, accountId, lastUsedAt: Date.now() };
      const items = await listRecentProjects();
      await Taro.setStorage({
        key,
        data: [entry, ...items.filter((p) => projectKey(p) !== projectKey(entry))].slice(0, 50),
      });
    });
  writes = next;
  return next;
}
export function recentProjectPageUrl(p: RecentProject): string {
  return `/pages/zcode-web/index?accountId=${encodeURIComponent(p.accountId)}&workspace=${encodeURIComponent(p.workspaceIdentity?.trim() || p.workspacePath)}${p.deviceSid ? `&deviceSid=${encodeURIComponent(p.deviceSid)}` : ""}`;
}
