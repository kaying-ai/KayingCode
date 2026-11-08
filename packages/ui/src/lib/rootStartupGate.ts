interface RootStartupGateState {
  isResolvingStartupAuthState: boolean;
  isResolvingProviderStartupState: boolean;
  isRestoring: boolean;
  isBootstrappingInitialWorkspace: boolean;
}

interface RootStartupLoadingVisibilityState extends RootStartupGateState {
  isDesktop: boolean | undefined;
  welcomeScreenOpen: boolean;
}

interface FallbackWorkspaceCreateState {
  isMounted: boolean;
  activeWorkspacePath: string | null;
}

interface ProviderStartupSyncState {
  providerFamilyDomainMigrationComplete: boolean;
  modelSelectionViewHydrated: boolean;
}

interface ProviderStartupResolutionState {
  providerStartupSyncPending: boolean;
  providerAvailabilityStartupCheckCompleted: boolean;
}

export function shouldBlockRootRender(state: RootStartupGateState): boolean {
  return (
    state.isResolvingStartupAuthState ||
    state.isResolvingProviderStartupState ||
    state.isRestoring ||
    state.isBootstrappingInitialWorkspace
  );
}

export function shouldShowRootStartupLoading(state: RootStartupLoadingVisibilityState): boolean {
  // 登录入口是启动门禁的结果，不是可继续被门禁遮挡的后台状态。
  // 如果 WelcomeScreen 已经打开，继续返回启动 loading 会把未登录用户卡在黑屏 logo。
  return Boolean(state.isDesktop) && !state.welcomeScreenOpen && shouldBlockRootRender(state);
}

export function shouldEnableProviderAvailabilityLoginEntryGuard(): boolean {
  // KayingCode.localrun：启动直接进主界面；模型 API Key 在设置里配置，
  // 不在启动页强制引导。
  return false;
}

export function shouldResolveProviderStartupState(state: ProviderStartupResolutionState): boolean {
  return state.providerStartupSyncPending || !state.providerAvailabilityStartupCheckCompleted;
}

export function shouldOpenFallbackWorkspaceAfterCreate(
  state: FallbackWorkspaceCreateState,
): boolean {
  return state.isMounted && !state.activeWorkspacePath;
}

export function isProviderStartupSyncPending(state: ProviderStartupSyncState): boolean {
  return !state.providerFamilyDomainMigrationComplete || !state.modelSelectionViewHydrated;
}

interface StartupWorkspaceResolutionState {
  isDesktop: boolean | undefined;
  /** 首个 workspace 是否已经落定（恢复命中 shell / 进入设置页 / 兜底创建已发起）。 */
  isStartupWorkspaceResolved: boolean;
  workspaceShellPath: string | null | undefined;
  isSettingsTabActive: boolean;
  allowOpenWorkspace: boolean;
  isStartupProviderLoginEntryOpen: boolean;
  welcomeScreenOpen: boolean;
  isResolvingStartupAuthState: boolean;
  isResolvingProviderStartupState: boolean;
  isRestoring: boolean;
  isBootstrappingInitialWorkspace: boolean;
}

/**
 * 启动首个 workspace 的解析期。
 *
 * 上游门禁（auth / provider / tab 恢复）解开后，首个 workspace 仍可能来自 Root 的兜底创建。
 * 兜底创建是在 effect 里发起的，而门禁在 render 期求值：如果这段时间门禁先放行，
 * 用户会看到「主界面一闪 → 呼吸 loading 又弹回来」的两段启动。
 * 这里把兜底窗口一并纳入启动阻塞，保证启动 loading 只有连续的一段。
 *
 * `isStartupWorkspaceResolved` 是单向闩：解析期只覆盖启动阶段，
 * 否则用户之后关闭最后一个 tab 会被启动 loading 重新挡住。
 */
export function shouldAwaitStartupWorkspaceResolution(
  state: StartupWorkspaceResolutionState,
): boolean {
  return (
    Boolean(state.isDesktop) &&
    !state.isStartupWorkspaceResolved &&
    !state.workspaceShellPath &&
    !state.isSettingsTabActive &&
    state.allowOpenWorkspace &&
    !state.isStartupProviderLoginEntryOpen &&
    !state.welcomeScreenOpen &&
    !shouldBlockRootRender(state)
  );
}
