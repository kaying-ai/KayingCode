// composer parity：v4 composer 的 per-session 草稿持久化（新做，轻量 localStorage）。
//
// 旧草稿面（kayingcodeSessionStore composerDraftByScopeId + chatComposerDraftStorage 写路径）
// 已随 store 收尾删除；本模块是 v4 侧替代——键空间独立（v4 前缀），不与旧键互写，
// 旧键清理仍归 chatComposerDraftStorage 的 janitor。
// 语义：scope = sessionId（draft 态 = "__draft__"）；保存 text + editorStateJson，外部预填在
// Lexical 尚未挂载时额外保存 mention（保证重挂载不降级为纯文本）。
// mode/modelSelection 与正文同 scope 保存；发送只清内容，显式清理才删除整个 scope。
// 附件不入草稿（objectUrl/File 不可序列化，localPath 附件重启后归属难校验——
// 与「v4 composer 不做附件草稿持久化」的裁决一致）。
import { logger } from "@/logger.js";
import {
  modelSelectionSchema,
  remoteHostIdFromWorkspaceIdentity,
  type ModelSelection,
} from "@zcode/shared";
import { submissionModeSchema, type SubmissionMode } from "@zcode/shared/kayingcode-protocol-v4";
import type { ComposerMentionPrefill } from "@/store/kayingcodeSessionStoreTypes.js";

export interface V4ComposerDraft {
  text: string;
  /** 未提交草稿的组织意图；真实任务归属始终由 Host 管理。 */
  projectId?: string | null;
  taskGroupId?: string | null;
  editorStateJson?: string;
  mention?: ComposerMentionPrefill;
  /** 有合法 mode 表示已经初始化；没有模型仍是明确空态，不能按旧文本草稿补默认。 */
  mode?: SubmissionMode;
  planEnabled?: boolean;
  /** 已处理的工具变更，防止重连快照再次覆盖用户选择。 */
  lastPlanTransitionId?: string;
  lastPermissionGrantId?: string;
  modelSelection?: ModelSelection;
  /** 首次分享导入等待公共新任务初始化；不能由空 Session snapshot 抢先填充。 */
  initializeFromNewTask?: true;
  updatedAt: number;
}

interface V4DraftFile {
  version: 1;
  /** 新项目 key 已认领旧目录草稿后，旧 key 不再作为回退来源。 */
  legacyClaimed?: boolean;
  scopes: Record<string, V4ComposerDraft>;
}

const STORAGE_KEY_PREFIX = "kayingcode-v4-composer-drafts:v1:";
/** 同目录可有多个项目；新建草稿按项目归属隔离到独立 key。 */
const PROJECT_DRAFT_STORAGE_KEY_PREFIX = "kayingcode-v4-composer-project-drafts:v1:";
const WORKSPACE_SCOPE_STORAGE_KEY_PREFIX = "kayingcode-composer-workspace-scope:v1:";

export const V4_DRAFT_SCOPE_ROOT = "__draft__";
const warnedStorageKeys = new Set<string>();

/**
 * 新建草稿的组织身份：客户端命名空间 + Host + 项目。
 * session 草稿仍按 workspace 隔离，只有 `__draft__` 使用该 scope 决定持久化 key。
 */
export interface ComposerScope {
  clientNamespace: string;
  hostId: string;
  projectId: string | null;
}

export function composerScopeKey(scope: ComposerScope): string {
  return JSON.stringify([scope.clientNamespace, scope.hostId, scope.projectId]);
}

export function resolveComposerScope(
  projectId: string | null | undefined,
  workspaceIdentity?: string,
  clientNamespace = "desktop",
): ComposerScope {
  return {
    clientNamespace,
    hostId: workspaceIdentity
      ? (remoteHostIdFromWorkspaceIdentity(workspaceIdentity) ?? workspaceIdentity)
      : "local",
    projectId: projectId ?? null,
  };
}

function workspaceScopeStorageKey(
  path: string,
  identity: string | undefined,
  clientNamespace: string,
): string {
  return `${WORKSPACE_SCOPE_STORAGE_KEY_PREFIX}${JSON.stringify([
    clientNamespace,
    identity?.trim() || path,
  ])}`;
}

/**
 * 记住某 workspace 当前草稿的项目 scope。
 * 重建 Root 后输入框还没挂载时，导航动作需要从同一客户端恢复项目归属。
 */
export function rememberComposerWorkspaceScope(
  path: string,
  identity: string | undefined,
  scope: ComposerScope,
): void {
  const key = workspaceScopeStorageKey(path, identity, scope.clientNamespace);
  try {
    getStorage()?.setItem(key, JSON.stringify(scope));
  } catch (error) {
    warnStorageFailure(key, error);
  }
}

/**
 * 读取 workspace 上次提交的草稿 scope；只接受同一 clientNamespace 且 host 身份一致的值。
 * 旧版没有导航身份，不能从目录猜项目，读取失败返回 undefined。
 */
export function readComposerWorkspaceScope(
  path: string,
  identity: string | undefined,
  clientNamespace = "desktop",
): ComposerScope | undefined {
  const key = workspaceScopeStorageKey(path, identity, clientNamespace);
  try {
    const raw = getStorage()?.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!isRecord(parsed)) {
      return undefined;
    }
    const projectId = parsed.projectId;
    if (
      parsed.clientNamespace === clientNamespace &&
      parsed.hostId === resolveComposerScope(null, identity, clientNamespace).hostId &&
      (projectId === null || typeof projectId === "string")
    ) {
      return {
        clientNamespace,
        hostId: parsed.hostId,
        projectId,
      };
    }
  } catch {
    /* 旧版没有导航身份，不能从目录猜项目。 */
  }
  return undefined;
}

function draftStorageKey(
  path: string,
  identity: string | undefined,
  scopeId: string,
  scope?: ComposerScope,
): string {
  // 同目录可以属于多个项目；新建草稿按组织归属隔离，正式 session 仍按工作区隔离。
  return scopeId === V4_DRAFT_SCOPE_ROOT && scope
    ? `${PROJECT_DRAFT_STORAGE_KEY_PREFIX}${composerScopeKey(scope)}`
    : getV4ComposerDraftStorageKey(path, identity);
}

function warnStorageFailure(key: string, error: unknown) {
  if (warnedStorageKeys.has(key)) return;
  warnedStorageKeys.add(key);
  logger.warn("[v4-composer-draft] 草稿持久化访问失败", {
    error: error instanceof Error ? error.message : String(error),
    key,
  });
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getV4ComposerDraftStorageKey(
  workspacePath: string,
  workspaceIdentity?: string,
): string {
  const workspaceKey = workspaceIdentity?.trim() || workspacePath;
  return `${STORAGE_KEY_PREFIX}${encodeURIComponent(workspaceKey)}`;
}

function readDraftFile(key: string): V4DraftFile {
  const storage = getStorage();
  try {
    const raw = storage?.getItem(key);
    if (!raw) return { version: 1, scopes: {} };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.scopes)) {
      return { version: 1, scopes: {} };
    }
    const scopes = Object.fromEntries(
      Object.entries(parsed.scopes).flatMap(([scopeId, value]) => {
        const draft = readDraft(value);
        return draft ? [[scopeId, draft]] : [];
      }),
    );
    // 读取可发生在 React render；旧空记录只过滤，物理清理由明确写入负责。
    return {
      version: 1,
      scopes,
      ...(parsed.legacyClaimed === true ? { legacyClaimed: true } : {}),
    };
  } catch (error) {
    warnStorageFailure(key, error);
    return { version: 1, scopes: {} };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readDraft(value: unknown): V4ComposerDraft | null {
  if (!isRecord(value) || typeof value.text !== "string") return null;
  const mode = submissionModeSchema.safeParse(value.mode);
  const selection = modelSelectionSchema.safeParse(value.modelSelection);
  // 坏 options 不应连带丢掉可确定的模型身份；不读取旧 provider/model/thought 别名。
  const identity = isRecord(value.modelSelection)
    ? modelSelectionSchema.safeParse({
        providerId: value.modelSelection.providerId,
        modelId: value.modelSelection.modelId,
      })
    : null;
  const modelSelection = selection.success
    ? selection.data
    : identity?.success
      ? identity.data
      : undefined;
  const mention = value.mention;
  const hasMention =
    isRecord(mention) &&
    ["id", "category", "label", "value", "markdown"].every(
      (key) => typeof mention[key] === "string",
    ) &&
    ["files", "skills", "commands", "subagents", "whiteboards", "sessions", "plugins"].includes(
      String(mention.category),
    );
  return {
    text: value.text,
    ...(value.taskGroupId === null || typeof value.taskGroupId === "string"
      ? { taskGroupId: value.taskGroupId as string | null }
      : {}),
    ...(value.projectId === null || (typeof value.projectId === "string" && value.projectId.trim())
      ? { projectId: value.projectId as string | null }
      : {}),
    ...(typeof value.editorStateJson === "string"
      ? { editorStateJson: value.editorStateJson }
      : {}),
    ...(hasMention ? { mention: mention as unknown as ComposerMentionPrefill } : {}),
    ...(mode.success ? { mode: mode.data === "plan" ? ("build" as const) : mode.data } : {}),
    ...(typeof value.planEnabled === "boolean"
      ? { planEnabled: value.planEnabled }
      : mode.success
        ? { planEnabled: mode.data === "plan" }
        : {}),
    ...(typeof value.lastPermissionGrantId === "string"
      ? { lastPermissionGrantId: value.lastPermissionGrantId }
      : {}),
    ...(typeof value.lastPlanTransitionId === "string"
      ? { lastPlanTransitionId: value.lastPlanTransitionId }
      : {}),
    ...(modelSelection ? { modelSelection } : {}),
    ...(value.initializeFromNewTask === true && !mode.success
      ? { initializeFromNewTask: true as const }
      : {}),
    updatedAt:
      typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt) ? value.updatedAt : 0,
  };
}

function writeDraftFile(key: string, file: V4DraftFile) {
  const storage = getStorage();
  if (!storage) {
    return false;
  }
  try {
    const serialized =
      Object.keys(file.scopes).length > 0 || file.legacyClaimed ? JSON.stringify(file) : null;
    if (storage.getItem(key) === serialized) {
      return true;
    }
    if (serialized === null) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, serialized);
    }
    warnedStorageKeys.delete(key);
    return true;
  } catch (error) {
    // 配额/隐私模式失败只降级为不持久化，不影响输入。
    warnStorageFailure(key, error);
    return false;
  }
}

export function readV4ComposerDraft(
  workspacePath: string,
  workspaceIdentity: string | undefined,
  scopeId: string,
  scope?: ComposerScope,
): V4ComposerDraft | null {
  const key = draftStorageKey(workspacePath, workspaceIdentity, scopeId, scope);
  const file = readDraftFile(key);
  const draft = file.scopes[scopeId];
  if (!draft || typeof draft.text !== "string") {
    // 旧记录只有显式项目归属才能认领；未归类历史不能靠最近目录猜测。
    if (!file.legacyClaimed && scopeId === V4_DRAFT_SCOPE_ROOT && scope?.projectId) {
      const legacy = readDraftFile(getV4ComposerDraftStorageKey(workspacePath, workspaceIdentity))
        .scopes[scopeId];
      if (legacy?.projectId === scope.projectId) return legacy;
    }
    return null;
  }
  return draft;
}

export function persistV4ComposerDraft(
  workspacePath: string,
  workspaceIdentity: string | undefined,
  scopeId: string,
  draft: Omit<V4ComposerDraft, "updatedAt">,
  scope?: ComposerScope,
) {
  const key = draftStorageKey(workspacePath, workspaceIdentity, scopeId, scope);
  const file = readDraftFile(key);
  const hadDraft = Boolean(file.scopes[scopeId]);
  // 正文/模型各自更新草稿时不能抹掉项目意图；显式新建传 null 才清除项目归属。
  const savedGroupId = file.scopes[scopeId]?.taskGroupId;
  const savedProjectId = file.scopes[scopeId]?.projectId;
  const next: Omit<V4ComposerDraft, "updatedAt"> = {
    ...draft,
    ...(draft.taskGroupId === undefined && savedGroupId !== undefined
      ? { taskGroupId: savedGroupId }
      : {}),
    ...(draft.projectId === undefined && savedProjectId !== undefined
      ? { projectId: savedProjectId }
      : {}),
  };
  // promotion 以后任务归属由 Host 查询；浏览器 Session 草稿不保留组织态副本。
  if (scopeId !== V4_DRAFT_SCOPE_ROOT) {
    delete next.projectId;
    delete next.taskGroupId;
  }
  if (
    !next.text.trim() &&
    !next.editorStateJson &&
    !next.mention &&
    !next.mode &&
    !next.modelSelection &&
    !next.initializeFromNewTask
  ) {
    delete file.scopes[scopeId];
  } else {
    file.scopes[scopeId] = { ...next, updatedAt: Date.now() };
  }
  // 新 key 首次写入即结束旧目录认领；保留旧数据，避免删除失败或换目录后复活正文。
  if (
    scopeId === V4_DRAFT_SCOPE_ROOT &&
    scope?.projectId &&
    (hadDraft ||
      Boolean(file.scopes[scopeId]) ||
      readDraftFile(getV4ComposerDraftStorageKey(workspacePath, workspaceIdentity)).scopes[scopeId]
        ?.projectId === scope.projectId)
  ) {
    file.legacyClaimed = true;
  }
  return writeDraftFile(key, file);
}

/** 关闭分组草稿只撤销组织意图；不能连带清空正在编辑的正文和项目。 */
export function clearV4ComposerDraftTaskGroup(
  workspacePath: string,
  workspaceIdentity?: string,
  scope?: ComposerScope,
) {
  const key = draftStorageKey(workspacePath, workspaceIdentity, V4_DRAFT_SCOPE_ROOT, scope);
  const file = readDraftFile(key);
  const draft = readV4ComposerDraft(workspacePath, workspaceIdentity, V4_DRAFT_SCOPE_ROOT, scope);
  if (!draft || draft.taskGroupId === undefined) return true;
  // 分组只是草稿的组织意图；关闭时必须沿用项目 key，不能修改同目录的其他项目。
  delete draft.taskGroupId;
  file.scopes[V4_DRAFT_SCOPE_ROOT] = draft;
  if (scope?.projectId) file.legacyClaimed = true;
  return writeDraftFile(key, file);
}

export function clearV4ComposerDraft(
  workspacePath: string,
  workspaceIdentity: string | undefined,
  scopeId: string,
  scope?: ComposerScope,
) {
  const key = draftStorageKey(workspacePath, workspaceIdentity, scopeId, scope);
  const file = readDraftFile(key);
  const hadDraft = Boolean(file.scopes[scopeId]);
  delete file.scopes[scopeId];
  // 新 key 首次写入即结束旧目录认领；保留旧数据，避免删除失败或换目录后复活正文。
  if (
    scopeId === V4_DRAFT_SCOPE_ROOT &&
    scope?.projectId &&
    (hadDraft ||
      Boolean(file.scopes[scopeId]) ||
      readDraftFile(getV4ComposerDraftStorageKey(workspacePath, workspaceIdentity)).scopes[scopeId]
        ?.projectId === scope.projectId)
  ) {
    file.legacyClaimed = true;
  }
  return writeDraftFile(key, file);
}
