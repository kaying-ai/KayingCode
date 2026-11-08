import { useEffect, useState } from "react";
import { View, Text, Button } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { MobileAccount } from "@kayingcode/mobile-client-core";
import { listRecentProjects, recentProjectPageUrl } from "../flow/recentProjects";
import { groupRecentProjects, projectKey, type RecentProject } from "../flow/projectNavigation";
import { Icon, Spinner } from "./icons/Icon";
import "./recentProjects.css";

export function RecentProjects({ accounts }: { accounts: MobileAccount[] }) {
  const [projects, setProjects] = useState<RecentProject[] | "error" | null>(null);
  useEffect(() => {
    let active = true;
    void listRecentProjects()
      .then((items) => {
        if (active) setProjects(items);
      })
      .catch(() => {
        if (active) setProjects("error");
      });
    return () => {
      active = false;
    };
  }, [accounts]);

  const groups = [...groupRecentProjects(Array.isArray(projects) ? projects : [])];
  const count = groups.reduce((total, [, items]) => total + items.length, 0);
  const labels = new Map(accounts.map((account) => [account.id, account.label]));

  return (
    <View className="screen recent-projects">
      <View className="recent-projects-header">
        <View>
          <Text className="recent-projects-title text-ui-xl">项目列表</Text>
          <Text className="recent-projects-caption text-ui-sm">最近打开的工作区</Text>
        </View>
        {count ? <Text className="recent-projects-count text-ui-sm">{count} 个项目</Text> : null}
      </View>

      {count === 0 ? (
        <View className="recent-projects-status">
          {projects === null ? (
            <Spinner size={18} />
          ) : (
            <View className="recent-projects-mark">
              <Icon name={projects === "error" ? "error_outline" : "grid_view_rounded"} size={20} />
            </View>
          )}
          <Text className="recent-projects-status-title text-ui-base">
            {projects === null
              ? "正在读取最近项目"
              : projects === "error"
                ? "暂时无法读取项目"
                : "还没有最近项目"}
          </Text>
          {projects !== null ? (
            <Text className="recent-projects-caption text-ui-sm">
              {projects === "error"
                ? "请重新打开项目列表重试。"
                : "从会话列表进入工作台，打开过的项目会出现在这里。"}
            </Text>
          ) : null}
        </View>
      ) : null}

      {groups.map(([accountId, items]) => (
        <View className="recent-projects-group" key={accountId}>
          <View className="recent-projects-group-heading">
            <Icon name="desktop_windows_outlined" size={16} />
            <Text className="recent-projects-device text-ui-sm">
              {labels.get(accountId) || "桌面连接"}
            </Text>
          </View>
          <View className="recent-projects-list">
            {items.map((project) => (
              <Button
                key={projectKey(project)}
                className="recent-project"
                hoverClass="recent-project-pressed"
                onClick={() => {
                  void Taro.navigateTo({ url: recentProjectPageUrl(project) });
                }}
              >
                <View className="recent-projects-mark">
                  <Icon name="grid_view_rounded" size={18} />
                </View>
                <View className="recent-project-detail">
                  <Text className="recent-project-name text-ui-base">
                    {project.workspacePath.split(/[\\/]/).filter(Boolean).pop() ||
                      project.workspacePath}
                  </Text>
                  <Text className="recent-project-path text-ui-sm">{project.workspacePath}</Text>
                </View>
                <Icon className="recent-project-arrow" name="chevron_right" size={18} />
              </Button>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
