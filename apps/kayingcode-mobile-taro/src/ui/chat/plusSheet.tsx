// 输入区「+」面板：先出分类入口，点进分类再列明细（对齐 Flutter chat_page.dart 的
// `_PlusSheet`）。选条目把 `$name ` / `/name ` 写回草稿；附件类入口直接调起选择器。
//
// 与斜杠列表共用同一份 `SlashEntry`：分类只按 `isSkill` 拆，不另建目录。
import { useState } from "react";
import { ScrollView, Text, View } from "@tarojs/components";
import { Icon } from "../icons/Icon";
import type { IconName } from "../icons/icons";
import type { SlashEntry } from "./sheets";

type Section = "skills" | "commands" | null;

function Category({
  icon,
  title,
  note,
  onClick,
}: {
  icon: IconName;
  title: string;
  note: string;
  onClick: () => void;
}) {
  return (
    <View className="choice-row" onClick={onClick}>
      <Icon className="choice-icon" name={icon} />
      <View className="choice-main">
        <Text className="choice-name">{title}</Text>
        <Text className="choice-sub">{note}</Text>
      </View>
      <Icon className="choice-tick" name="chevron_right" />
    </View>
  );
}

export function PlusSheet({
  entries,
  canAttach,
  onSelect,
  onAttach,
  onClose,
}: {
  entries: readonly SlashEntry[];
  canAttach: boolean;
  onSelect: (entry: SlashEntry) => void;
  onAttach: () => void;
  onClose: () => void;
}) {
  const [section, setSection] = useState<Section>(null);
  const skills = entries.filter((entry) => entry.isSkill);
  const commands = entries.filter((entry) => !entry.isSkill);
  const items = section === "skills" ? skills : section === "commands" ? commands : [];
  const title = section === "skills" ? "Skills" : section === "commands" ? "斜杠命令" : "添加";

  const back = () => {
    if (section === null) onClose();
    else setSection(null);
  };

  return (
    <View className="sheet-overlay">
      <View className="sheet-backdrop" onClick={onClose} />
      <View className="sheet">
        <View className="sheet-head">
          <Text className="sheet-title">{title}</Text>
          <Text className="sheet-close" onClick={back}>
            {section === null ? "关闭" : "返回"}
          </Text>
        </View>
        <ScrollView className="sheet-body" scrollY>
          {section === null ? (
            <>
              <Category
                icon="auto_awesome_outlined"
                title="Skills"
                note={`${skills.length} 项`}
                onClick={() => setSection("skills")}
              />
              <Category
                icon="terminal"
                title="斜杠命令"
                note={`${commands.length} 项`}
                onClick={() => setSection("commands")}
              />
              {canAttach ? (
                <Category icon="attach_file" title="附件" note="选择文件上传" onClick={onAttach} />
              ) : null}
              {canAttach ? (
                <Category
                  icon="data_object_outlined"
                  title="添加上下文"
                  note="选择文件并插入引用"
                  onClick={onAttach}
                />
              ) : null}
            </>
          ) : items.length === 0 ? (
            <Text className="sheet-note">无</Text>
          ) : (
            items.map((entry) => (
              <View
                key={`${entry.isSkill ? "$" : "/"}${entry.name}`}
                className="slash-item"
                onClick={() => onSelect(entry)}
              >
                <Text className="slash-prefix">{entry.isSkill ? "$" : "/"}</Text>
                <View className="slash-main">
                  <Text className="slash-name">{entry.name}</Text>
                  {entry.description ? (
                    <Text className="slash-desc">{entry.description}</Text>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}
