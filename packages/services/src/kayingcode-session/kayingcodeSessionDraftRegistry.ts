import type { KayingCodeSessionStateSnapshot } from "@zcode/shared";
import type {
  KayingCodeSessionWorkspaceTarget,
  KayingCodeTaskTarget,
} from "#src/kayingcode-session/kayingcodeSession.js";

function getWorkspaceKey(target: KayingCodeSessionWorkspaceTarget): string {
  return target.workspaceIdentity?.trim() || target.workspacePath;
}

function getSessionScopedKey(target: KayingCodeTaskTarget): string {
  return `${getWorkspaceKey(target)}\0${target.sessionId}`;
}

export function createKayingCodeDeferredDraftRegistry() {
  const sessionKeys = new Set<string>();

  return {
    remember(params: KayingCodeSessionWorkspaceTarget, snapshot: KayingCodeSessionStateSnapshot): void {
      sessionKeys.add(
        getSessionScopedKey({
          workspacePath: snapshot.session.workspace.workspacePath,
          workspaceIdentity:
            snapshot.session.workspace.workspaceIdentity ?? params.workspaceIdentity,
          sessionId: snapshot.session.sessionId,
        }),
      );
    },

    has(target: KayingCodeTaskTarget): boolean {
      return sessionKeys.has(getSessionScopedKey(target));
    },

    forget(target: KayingCodeTaskTarget): void {
      sessionKeys.delete(getSessionScopedKey(target));
    },
  };
}
