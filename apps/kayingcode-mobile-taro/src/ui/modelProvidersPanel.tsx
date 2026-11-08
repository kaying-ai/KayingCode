import { useCallback, useEffect, useState } from "react";
import { Button, Input, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import {
  ChannelModelProviders,
  describeError,
  type ModelProviderRecord,
} from "@kayingcode/mobile-client-core";
import { randomHex } from "../ports/randomSource";
import { flow } from "../flow/store";
import { useFlow } from "../flow/useFlow";

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const FORMATS = ["anthropic-messages", "openai-chat", "gemini"] as const;

export function ModelProvidersPanel() {
  useFlow();
  const bridge = flow.getZcodeSession()?.bridge ?? null;
  const bridgeGeneration = bridge?.recovered ?? -1;
  const [providers, setProviders] = useState<ModelProviderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState("");
  const [format, setFormat] = useState<(typeof FORMATS)[number]>(FORMATS[0]);

  const load = useCallback(async () => {
    if (!bridge) return;
    const generation = bridge.recovered;
    setLoading(true);
    try {
      const next = await new ChannelModelProviders(bridge).getAll();
      if (flow.getZcodeSession()?.bridge === bridge && bridge.recovered === generation) {
        setProviders(next);
        setError("");
      }
    } catch (caught) {
      if (flow.getZcodeSession()?.bridge === bridge && bridge.recovered === generation)
        setError(describeError(caught));
    } finally {
      if (flow.getZcodeSession()?.bridge === bridge && bridge.recovered === generation)
        setLoading(false);
    }
  }, [bridge, bridgeGeneration]);
  useEffect(() => {
    setProviders([]);
    void load();
  }, [load]);

  const mutate = async (
    operation: (api: ChannelModelProviders) => Promise<void>,
  ): Promise<boolean> => {
    if (!bridge || loading) return false;
    const generation = bridge.recovered;
    setLoading(true);
    try {
      await operation(new ChannelModelProviders(bridge));
      if (flow.getZcodeSession()?.bridge !== bridge || bridge.recovered !== generation)
        return false;
      await load();
      return true;
    } catch (caught) {
      if (flow.getZcodeSession()?.bridge === bridge && bridge.recovered === generation)
        setError(describeError(caught));
      return false;
    } finally {
      if (flow.getZcodeSession()?.bridge === bridge && bridge.recovered === generation)
        setLoading(false);
    }
  };

  const save = async () => {
    if (!name.trim() || !baseUrl.trim()) {
      setError("请填写名称和 Base URL");
      return;
    }
    const kind = format.startsWith("anthropic")
      ? "anthropic"
      : format.startsWith("openai")
        ? "openai"
        : "gemini";
    const now = Date.now();
    const modelIds = models
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    const saved = await mutate((api) =>
      api.save({
        id: `custom:${randomHex(16)}`,
        name: name.trim(),
        enabled: true,
        endpoints: { baseURL: baseUrl.trim(), paths: { [kind]: "/v1/messages" } },
        apiFormat: format,
        source: "custom",
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        defaultKind: kind,
        models: modelIds.map((id, index) => ({
          id,
          kinds: [kind],
          defaultKind: kind,
          modalities: { input: ["text"], output: ["text"] },
          priority: 100 + index,
        })),
        createdAt: now,
        updatedAt: now,
      }),
    );
    if (saved) {
      setAdding(false);
      setApiKey("");
    }
  };

  const remove = async (provider: ModelProviderRecord) => {
    const result = await Taro.showModal({
      title: "删除模型供应商？",
      content: text(provider.name),
    });
    if (result.confirm) await mutate((api) => api.delete(text(provider.id)));
  };

  if (!bridge)
    return (
      <View className="surface-card">
        <Text className="list-title">模型供应商</Text>
        <Text className="caption">请先连接 ZCode 工作区</Text>
      </View>
    );
  return (
    <View className="surface-card">
      <Text className="list-title">模型供应商</Text>
      {error ? <Text className="message">{error}</Text> : null}
      {providers.map((provider) => (
        <View className="list-card" key={text(provider.id)}>
          <View className="list-main">
            <Text className="list-title">{text(provider.name) || text(provider.id)}</Text>
            <Text className="list-subtitle">
              {text(provider.apiFormat)} · {provider.enabled === false ? "已停用" : "已启用"}
            </Text>
            <Text className="caption">
              {Array.isArray(provider.models) ? `${provider.models.length} 个模型` : "无模型"}
            </Text>
          </View>
          <Button
            className="action action-ghost"
            disabled={loading}
            onClick={() =>
              void mutate((api) =>
                api.save({
                  ...provider,
                  enabled: provider.enabled === false,
                  updatedAt: Date.now(),
                }),
              )
            }
          >
            {provider.enabled === false ? "启用" : "停用"}
          </Button>
          {provider.source === "custom" ? (
            <Button
              className="action action-danger"
              disabled={loading}
              onClick={() => void remove(provider)}
            >
              删除
            </Button>
          ) : null}
        </View>
      ))}
      {providers.length === 0 ? (
        <Text className="empty">{loading ? "加载中…" : "暂无供应商"}</Text>
      ) : null}
      {adding ? (
        <View>
          <Input
            className="control"
            value={name}
            placeholder="名称"
            onInput={(event) => setName(event.detail.value)}
          />
          {FORMATS.map((candidate) => (
            <Text
              key={candidate}
              className={`theme-choice ${format === candidate ? "chosen" : ""}`}
              onClick={() => setFormat(candidate)}
            >
              {candidate}
            </Text>
          ))}
          <Input
            className="control"
            value={baseUrl}
            placeholder="Base URL"
            onInput={(event) => setBaseUrl(event.detail.value)}
          />
          <Input
            className="control"
            value={apiKey}
            password
            placeholder="API Key（可选）"
            onInput={(event) => setApiKey(event.detail.value)}
          />
          <Input
            className="control"
            value={models}
            placeholder="模型 ID，逗号分隔"
            onInput={(event) => setModels(event.detail.value)}
          />
          <Button
            className="action action-primary full-action"
            disabled={loading}
            onClick={() => void save()}
          >
            保存
          </Button>
          <Button className="action action-ghost full-action" onClick={() => setAdding(false)}>
            取消
          </Button>
        </View>
      ) : (
        <Button className="action action-ghost full-action" onClick={() => setAdding(true)}>
          添加供应商
        </Button>
      )}
      <Button className="action action-ghost full-action" onClick={() => void load()}>
        刷新
      </Button>
    </View>
  );
}
