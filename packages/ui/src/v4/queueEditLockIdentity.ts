// 队列编辑锁的编辑器身份（docs/ui/composer-edit-mode.md「锁归属」）。
// editorId 标识单个窗口/标签页实例，存 sessionStorage：刷新后不变、不同窗口不同。
// clientId 存 localStorage，同设备多窗口共享，不能单独区分锁的持有者，所以两者都要。
// 浏览器「复制标签页」会连同 sessionStorage 复制，因此 composer-edit-mode/editorIdentity
// 会用同名 Web Lock 确认唯一性，必要时调用 regenerateV4EditorId 换新 id。
import { uuidv7 } from "@zcode/shared";

const EDITOR_ID_STORAGE_KEY = "kayingcode-v4-editor-id:v1";
let cachedEditorId: string | null = null;

export function getV4EditorId(): string {
  if (cachedEditorId) return cachedEditorId;
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(EDITOR_ID_STORAGE_KEY);
  } catch {
    // 无 sessionStorage（测试/隐私模式）时退化为进程内稳定 id。
  }
  const editorId = stored ?? `editor-${uuidv7()}`;
  if (!stored) {
    try {
      sessionStorage.setItem(EDITOR_ID_STORAGE_KEY, editorId);
    } catch {
      // 同上，忽略。
    }
  }
  cachedEditorId = editorId;
  return editorId;
}

/**
 * 换一个新的 editorId 并写回 sessionStorage：复制标签页检测到同名 Web Lock 已被占用时使用。
 * 新 id 从下一次加锁开始生效，旧 id 遗留的锁按「其他端」处理并可手动解除。
 */
export function regenerateV4EditorId(): string {
  const editorId = `editor-${uuidv7()}`;
  cachedEditorId = editorId;
  try {
    sessionStorage.setItem(EDITOR_ID_STORAGE_KEY, editorId);
  } catch {
    // 同上，忽略。
  }
  return editorId;
}
