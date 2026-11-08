// Diff 视图：把 toolDetail.extractDiff 的结构画成等宽行。
//
// 与 Flutter 的取舍一致：不显示行号、不做内部折叠（折叠由外层工具卡控制）、
// 超过 400 行截断并给出提示。左侧符号已并入行文本（`+`/`-`/前导空格），
// 这样复制出去仍是可用的 unified diff 片段。
import { View, Text } from "@tarojs/components";
import { DIFF_TRUNCATE_LIMIT, type DiffData } from "./toolDetail";

export function DiffView({ diff }: { diff: DiffData }) {
  const visible = diff.lines.slice(0, DIFF_TRUNCATE_LIMIT);
  const truncated = diff.lines.length > DIFF_TRUNCATE_LIMIT;
  return (
    <View className="diff">
      {diff.filePath ? <Text className="diff-path">{diff.filePath}</Text> : null}
      <View className="diff-body">
        {visible.map((line, index) => (
          <Text key={index} className={`diff-line diff-${line.type}`}>
            {line.text.length > 0 ? line.text : " "}
          </Text>
        ))}
      </View>
      {truncated ? <Text className="diff-note">…（diff 过长已截断）</Text> : null}
    </View>
  );
}

/** 文件变更计数徽（回合头与洞察面板共用）。 */
export function DiffStat({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <Text className="diff-stat">
      <Text className="diff-add">+{additions}</Text>
      <Text className="diff-del">-{deletions}</Text>
    </Text>
  );
}
