/**
 * TapMaker 恢复后的本地项目登记与列表候选目录。
 *
 * 原因：新项目侧栏以 Host 项目库为项目行的唯一事实源，`tabStore.addTab` 只建立工作区入口；
 * 恢复流程此前只开 tab，侧栏没有项目行，列表也无法从项目库反查本地目录。
 */

/** 打开 TapMaker 项目的目标：目录 + 已登记的项目身份。 */
export interface TapMakerOpenProjectTarget {
  path: string;
  projectId?: string;
}

/** 只依赖项目服务写入口，测试可注入最小实现。 */
export interface TapMakerProjectRegistrationPort {
  saveProject(input: { reuseExistingRoot?: boolean; roots?: string[] }): Promise<{ id: string }>;
}

/** 项目库 roots 的结构子集；`VirtualProject` 可直接传入。 */
export interface TapMakerProjectRootSource {
  deleted: boolean;
  roots: ReadonlyArray<{ rootPath: string }>;
}

/**
 * 把恢复目录登记进项目库。
 * `reuseExistingRoot` 在同一写事务内按目录复用未删除项目或创建新项目，
 * 既避免多窗口并发恢复产生重复项目，也不改写已有项目的名称、roots、排序和置顶。
 * 该模式只接受 roots；新项目名称由项目服务按目录基准名生成，与“打开目录”一致。
 */
export async function ensureTapMakerLocalProject(
  projectService: TapMakerProjectRegistrationPort,
  input: { projectRoot: string },
): Promise<{ id: string }> {
  return projectService.saveProject({
    reuseExistingRoot: true,
    roots: [input.projectRoot],
  });
}

/**
 * 列表候选目录 = 本地 workspace tab 目录 ∪ 本地项目库 roots。
 * 项目库让关闭 tab 或手动创建的项目仍能被关联；去重后按协议上限截断到 500。
 */
export function collectTapMakerCandidateDirectories(input: {
  tabDirectories: readonly string[];
  projects: readonly TapMakerProjectRootSource[];
}): string[] {
  const directories = new Set<string>();
  const add = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) directories.add(trimmed);
  };
  for (const directory of input.tabDirectories) add(directory);
  for (const project of input.projects)
    if (!project.deleted) for (const root of project.roots) add(root.rootPath);
  return [...directories].slice(0, 500);
}
