import { useEffect, useState } from "react";
import {
  ChannelWorkspacePrep,
  describeError,
  type ChannelSkillEntry,
  type RelayAgentConnection,
} from "@kayingcode/mobile-client-core";
import type { WorkspaceConfigState } from "@zcode/shared/kayingcode-protocol-v4";
import { flow } from "../../flow/store";

/** ZCode 的旧 task/skills 目录随桥代数重读，不持有服务端事实。 */
export function useZcodeWorkspacePrep(connection: RelayAgentConnection | null) {
  const [config, setConfig] = useState<WorkspaceConfigState | null>(null);
  const [skills, setSkills] = useState<ChannelSkillEntry[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const session = flow.getZcodeSession();
    if (!connection || !session?.bridge || !session.workspaceTarget) {
      setConfig(null);
      setSkills([]);
      return;
    }
    let cancelled = false;
    const source = session.bridge;
    setConfig(null);
    setSkills([]);
    setError("");
    const prep = new ChannelWorkspacePrep(source, session.workspaceTarget);
    void prep
      .prepare()
      .then((result) => {
        if (!cancelled && flow.getZcodeSession()?.bridge === source) setConfig(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled && flow.getZcodeSession()?.bridge === source)
          setError(describeError(caught));
      });
    void prep
      .skills()
      .then((result) => {
        if (!cancelled && flow.getZcodeSession()?.bridge === source) setSkills(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [connection]);
  return { config, skills, error };
}
