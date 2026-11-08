// ZCode 自动化管理；数据始终从当前桥的宿主通道读取。
import { useCallback, useEffect, useState } from "react";
import { Button, Input, ScrollView, Text, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import {
  ChannelAutomation,
  describeError,
  type AutomationRecord,
} from "@kayingcode/mobile-client-core";
import { flow } from "../../flow/store";
import { useFlow } from "../../flow/useFlow";
import { chatPageUrl } from "../../ui/chatRoute";
import { useTheme } from "../../ui/theme";
import { goBack } from "../../ui/navigation";
import { Icon } from "../../ui/icons/Icon";

const value = (item: unknown): string => (typeof item === "string" ? item : "");
const date = (item: unknown): string =>
  typeof item === "number" ? new Date(item).toLocaleString() : "—";

export default function AutomationPage() {
  const theme = useTheme();
  useFlow();
  const current = flow.getZcodeSession();
  const bridge = current?.bridge ?? null;
  const bridgeGeneration = bridge?.recovered ?? -1;
  const target = current?.workspaceTarget ?? null;
  const api = bridge && target ? new ChannelAutomation(bridge, target) : null;
  const [items, setItems] = useState<AutomationRecord[]>([]);
  const [queue, setQueue] = useState<AutomationRecord[]>([]);
  const [runs, setRuns] = useState<AutomationRecord[]>([]);
  const [selected, setSelected] = useState<AutomationRecord | null>(null);
  const [editor, setEditor] = useState(false);
  const [title, setTitle] = useState("");
  const [cronExpr, setCronExpr] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!bridge || !target) return;
    const generation = bridge.recovered;
    const service = new ChannelAutomation(bridge, target);
    setBusy(true);
    try {
      const [nextItems, nextQueue] = await Promise.all([service.list(), service.offPeakQueue()]);
      if (flow.getZcodeSession()?.bridge !== bridge || bridge.recovered !== generation) return;
      setItems(nextItems);
      setQueue(nextQueue);
      setError("");
    } catch (caught) {
      if (flow.getZcodeSession()?.bridge === bridge && bridge.recovered === generation)
        setError(describeError(caught));
    } finally {
      if (flow.getZcodeSession()?.bridge === bridge && bridge.recovered === generation)
        setBusy(false);
    }
  }, [bridge, bridgeGeneration, target]);
  useEffect(() => {
    setItems([]);
    setQueue([]);
    setSelected(null);
    setRuns([]);
    void load();
  }, [load]);

  const act = async (
    operation: () => Promise<unknown>,
    success: string | ((result: unknown) => string),
  ): Promise<boolean> => {
    if (!bridge || busy) return false;
    const generation = bridge.recovered;
    setBusy(true);
    try {
      const result = await operation();
      if (flow.getZcodeSession()?.bridge !== bridge || bridge.recovered !== generation)
        return false;
      setNotice(typeof success === "string" ? success : success(result));
      setError("");
      await load();
      return true;
    } catch (caught) {
      if (flow.getZcodeSession()?.bridge === bridge && bridge.recovered === generation)
        setError(describeError(caught));
      return false;
    } finally {
      if (flow.getZcodeSession()?.bridge === bridge && bridge.recovered === generation)
        setBusy(false);
    }
  };

  const detail = async (item: AutomationRecord) => {
    if (!api) return;
    const generation = bridge?.recovered;
    setSelected(item);
    setRuns([]);
    try {
      const next = await api.runs(value(item.automationId));
      if (flow.getZcodeSession()?.bridge === bridge && bridge?.recovered === generation)
        setRuns(next);
    } catch (caught) {
      if (flow.getZcodeSession()?.bridge === bridge && bridge?.recovered === generation)
        setError(describeError(caught));
    }
  };
  const edit = (item: AutomationRecord | null) => {
    setSelected(item);
    setTitle(value(item?.title));
    setCronExpr(value(item?.cronExpr));
    setPrompt(value(item?.prompt));
    setEditor(true);
  };
  const save = async () => {
    if (!api || !title.trim() || !cronExpr.trim() || !prompt.trim()) {
      setError("请填写名称、Cron 表达式和提示词");
      return;
    }
    const id = value(selected?.automationId);
    const saved = await act(
      () =>
        id
          ? api.update({
              automationId: id,
              title: title.trim(),
              cronExpr: cronExpr.trim(),
              prompt: prompt.trim(),
            })
          : api.create({ title: title.trim(), cronExpr: cronExpr.trim(), prompt: prompt.trim() }),
      id ? "已更新" : "已创建",
    );
    if (saved) {
      setEditor(false);
      setSelected(null);
    }
  };
  const remove = async (item: AutomationRecord) => {
    if (!api) return;
    const result = await Taro.showModal({ title: "删除自动化？", content: value(item.title) });
    if (!result.confirm) return;
    if (await act(() => api.delete(value(item.automationId)), "已删除")) setSelected(null);
  };

  return (
    <View className={theme.className}>
      <View className="screen">
        <View className="topbar settings-topbar">
          <Icon
            className="icon-button"
            name="arrow_back"
            size={20}
            onClick={() => (editor ? setEditor(false) : selected ? setSelected(null) : goBack())}
          />
          <View className="topbar-main">
            <Text className="screen-title">自动化</Text>
          </View>
          {api && !editor ? (
            <Icon className="icon-button" name="add" size={20} onClick={() => edit(null)} />
          ) : null}
        </View>
        {!api ? <Text className="empty">请先连接 ZCode 工作区</Text> : null}
        {error ? <Text className="message">{error}</Text> : null}
        {notice ? <Text className="caption">{notice}</Text> : null}
        {api && editor ? (
          <View className="surface-card">
            <Text className="list-title">{selected ? "编辑自动化" : "新建自动化"}</Text>
            <Input
              className="control"
              value={title}
              placeholder="名称"
              onInput={(event) => setTitle(event.detail.value)}
            />
            <Input
              className="control"
              value={cronExpr}
              placeholder="Cron 表达式"
              onInput={(event) => setCronExpr(event.detail.value)}
            />
            <Textarea
              className="control"
              value={prompt}
              placeholder="提示词"
              onInput={(event) => setPrompt(event.detail.value)}
            />
            <Button
              className="action action-primary full-action"
              disabled={busy}
              onClick={() => void save()}
            >
              保存
            </Button>
          </View>
        ) : null}
        {api && selected && !editor ? (
          <ScrollView className="session-list" scrollY>
            <View className="surface-card">
              <Text className="list-title">{value(selected.title)}</Text>
              <Text className="caption">
                {value(selected.cronExpr)} · {value(selected.lifecycleStatus) || "运行中"}
              </Text>
              <Text className="caption">
                下次：{date(selected.nextRunAt)} · 上次：{date(selected.lastRunAt)}
              </Text>
              <Text className="caption">{value(selected.prompt)}</Text>
              <Button
                className="action action-primary full-action"
                disabled={busy}
                onClick={() =>
                  void act(
                    async () => {
                      const status = await api.runNow(value(selected.automationId));
                      if (status === "failed") throw new Error("触发失败");
                      return status;
                    },
                    (status) =>
                      status === "duplicate" ? "该自动化已有执行在进行" : "已加入执行队列",
                  )
                }
              >
                立即运行
              </Button>
              <Button
                className="action action-ghost full-action"
                disabled={busy}
                onClick={() =>
                  void act(
                    () => api.setEnabled(value(selected.automationId), selected.enabled !== true),
                    "已更新",
                  )
                }
              >
                {selected.enabled === true ? "停用" : "启用"}
              </Button>
              <Button
                className="action action-ghost full-action"
                disabled={busy}
                onClick={() =>
                  void act(() => api.restart(value(selected.automationId)), "已重启排程")
                }
              >
                重启排程
              </Button>
              <Button className="action action-ghost full-action" onClick={() => edit(selected)}>
                编辑
              </Button>
              <Button
                className="action action-danger full-action"
                onClick={() => void remove(selected)}
              >
                删除
              </Button>
            </View>
            <Text className="caption section-label">执行历史</Text>
            {runs.map((run, index) => (
              <View
                className="list-card"
                key={String(run.runId ?? index)}
                onClick={() => {
                  if (typeof run.sessionId === "string")
                    void Taro.navigateTo({
                      url: chatPageUrl(run.sessionId),
                    });
                }}
              >
                <Text className="list-title">
                  {value(run.outcome) || value(run.dispatchStatus)}
                </Text>
                <Text className="caption">
                  {value(run.trigger)} · {date(run.scheduledAt)}
                </Text>
              </View>
            ))}
            {runs.length === 0 ? <Text className="empty">暂无执行记录</Text> : null}
          </ScrollView>
        ) : null}
        {api && !selected && !editor ? (
          <ScrollView className="session-list" scrollY>
            {items.map((item) => (
              <View
                className="list-card"
                key={value(item.automationId)}
                onClick={() => void detail(item)}
              >
                <View className="list-main">
                  <Text className="list-title">{value(item.title) || "未命名自动化"}</Text>
                  <Text className="list-subtitle">
                    {value(item.cronExpr)} ·{" "}
                    {value(item.lifecycleStatus) || (item.enabled === false ? "已停用" : "运行中")}
                  </Text>
                </View>
              </View>
            ))}
            {items.length === 0 ? (
              <Text className="empty">{busy ? "加载中…" : "暂无自动化"}</Text>
            ) : null}
            <Text className="caption section-label">闲时队列</Text>
            {queue.map((item, index) => (
              <View className="list-card" key={String(item.id ?? index)}>
                <Text className="list-title">
                  {value(item.title) || value(item.prompt) || "闲时任务"}
                </Text>
                <Text className="caption">{value(item.status)}</Text>
              </View>
            ))}
            {queue.length === 0 ? <Text className="empty">队列为空</Text> : null}
            <Button className="action action-ghost full-action" onClick={() => void load()}>
              刷新
            </Button>
          </ScrollView>
        ) : null}
      </View>
    </View>
  );
}
