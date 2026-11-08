// 回合文件变更清单 + 单文件 diff 下钻。
//
// 与 Flutter 的 showTurnFileChangesSheet 同链路：以 turnHeader 的行目标查询服务端
// （服务端只接受 turnHeader target），运行中不可查询，未完成时显式说明而不是给空列表。
import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import type {
  ConversationRowTarget,
  TurnHeaderRow,
  V4ConversationFileChangesResult,
} from "@zcode/shared/kayingcode-protocol-v4";
import { DiffStat, DiffView } from "./diffView";
import { JsonView, Sheet } from "./overlay";
import { describeError } from "@kayingcode/mobile-client-core";
import type { DiffData } from "./toolDetail";

export type FileChangeItem = V4ConversationFileChangesResult["items"][number];

export function TurnFilesSheet({
  header,
  load,
  onClose,
}: {
  header: TurnHeaderRow;
  load: (target: ConversationRowTarget) => Promise<V4ConversationFileChangesResult>;
  onClose: () => void;
}) {
  const [items, setItems] = useState<FileChangeItem[] | null>(null);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<FileChangeItem | null>(null);
  const target: ConversationRowTarget | null = header.entityId
    ? { rowId: header.rowId, entityId: header.entityId }
    : null;

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    void load(target)
      .then((result) => {
        if (!cancelled) setItems(result.items);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(describeError(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [load, target?.entityId, target?.rowId]);

  if (detail) {
    return <FileDiffSheet item={detail} onClose={() => setDetail(null)} />;
  }
  if (!target) {
    return (
      <Sheet title="文件变更" onClose={onClose}>
        <Text className="sheet-note">该回合缺少稳定身份，无法查询文件变更。</Text>
      </Sheet>
    );
  }
  const total = items ?? [];
  const additions = total.reduce((sum, item) => sum + item.additions, 0);
  const deletions = total.reduce((sum, item) => sum + item.deletions, 0);
  return (
    <Sheet title={`编辑 · ${total.length}`} onClose={onClose}>
      <View className="files-summary">
        <DiffStat additions={additions} deletions={deletions} />
      </View>
      {error ? <Text className="sheet-error">{`获取失败: ${error}`}</Text> : null}
      {items === null && !error ? <Text className="sheet-note">加载中…</Text> : null}
      {items !== null && total.length === 0 ? (
        <Text className="sheet-note">无文件变更数据</Text>
      ) : null}
      {total.map((item) => (
        <View key={item.path} className="file-row" onClick={() => setDetail(item)}>
          <View className="file-row-main">
            <Text className="file-row-name">{baseName(item.path)}</Text>
            <Text className="file-row-dir">{dirName(item.path)}</Text>
          </View>
          <DiffStat additions={item.additions} deletions={item.deletions} />
        </View>
      ))}
    </Sheet>
  );
}

function FileDiffSheet({ item, onClose }: { item: FileChangeItem; onClose: () => void }) {
  const diff = diffOf(item);
  return (
    <Sheet title={item.path} onClose={onClose}>
      {diff ? <DiffView diff={diff} /> : <JsonView value={item} />}
    </Sheet>
  );
}

/** patches → DiffData：hunk 的 lines 已是 `+`/`-`/空格 前缀的 unified 行。 */
export function diffOf(item: FileChangeItem): DiffData | null {
  if (item.patches.length === 0) return null;
  const lines = item.patches.flatMap((hunk) =>
    hunk.lines.map((line) => {
      if (line.startsWith("+")) return { type: "added" as const, text: line };
      if (line.startsWith("-")) return { type: "removed" as const, text: line };
      return { type: "context" as const, text: line };
    }),
  );
  return { filePath: item.path, lines, structured: true };
}

function baseName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

function dirName(path: string): string {
  const index = path.lastIndexOf("/");
  return index > 0 ? path.slice(0, index) : "";
}
