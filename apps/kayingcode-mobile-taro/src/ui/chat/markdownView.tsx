// Markdown 渲染：把 markdownParse 的块/行内结构画成 Taro 视图。
//
// 两处与移动端平台约束相关的取舍：
// - 代码块不依赖 rich-text，直接用等宽 Text，保证 weapp 与 H5 同一份实现；
// - 链接不可跳转（weapp 无 url_launcher 等价能力，Flutter 侧同样不跳），点按改为
//   复制链接并提示，避免给用户一个看起来能点却没有反应的控件。
//
// 流式节流与 Flutter 一致：250ms 窗口内最多重解析一次，正文完成时立即全量解析。
import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { parseMarkdown, type MdBlock, type MdInline } from "./markdownParse";

const STREAM_WINDOW_MS = 250;

export function Markdown({
  text,
  fontSize = 14,
}: {
  text: string;
  fontSize?: number;
}) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <View className="md" style={{ fontSize: `${fontSize}px` }}>
      {blocks.map((block, index) => (
        <Block key={`${index}-${block.kind}`} block={block} fontSize={fontSize} />
      ))}
    </View>
  );
}

/** 流式正文：重复文本不重解析；streaming 结束立即解析最终文本。 */
export function StreamingMarkdown({
  text,
  streaming,
  fontSize = 13,
}: {
  text: string;
  streaming: boolean;
  fontSize?: number;
}) {
  const [rendered, setRendered] = useState(text);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(text);

  useEffect(() => {
    latest.current = text;
    if (!streaming) {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      setRendered(text);
      return;
    }
    if (text === rendered || timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      setRendered(latest.current);
    }, STREAM_WINDOW_MS);
  }, [text, streaming, rendered]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return <Markdown text={rendered} fontSize={fontSize} />;
}

function Inlines({ inlines }: { inlines: MdInline[] }) {
  return (
    <>
      {inlines.map((inline, index) => (
        <Text key={index} className={inlineClass(inline)} onClick={() => onInlineTap(inline)}>
          {inline.text}
        </Text>
      ))}
    </>
  );
}

function inlineClass(inline: MdInline): string {
  switch (inline.kind) {
    case "code":
      return "md-code";
    case "strong":
      return "md-strong";
    case "em":
      return "md-em";
    case "del":
      return "md-del";
    case "link":
      return "md-link";
    default:
      return "";
  }
}

function onInlineTap(inline: MdInline): void {
  if (inline.kind !== "link") return;
  void Taro.setClipboardData({ data: inline.href })
    .then(() => Taro.showToast({ title: "链接已复制", icon: "none" }))
    .catch(() => undefined);
}

function Block({ block, fontSize }: { block: MdBlock; fontSize: number }) {
  switch (block.kind) {
    case "heading":
      return (
        <View className={`md-heading md-h${block.level}`}>
          <Text className="md-heading-text" style={{ fontSize: `${headingSize(block.level, fontSize)}px` }}>
            <Inlines inlines={block.inlines} />
          </Text>
        </View>
      );
    case "paragraph":
      return (
        <View className="md-p">
          <Text>
            <Inlines inlines={block.inlines} />
          </Text>
        </View>
      );
    case "code":
      return <CodeBlock language={block.language} text={block.text} fontSize={fontSize} />;
    case "list":
      return (
        <View className="md-list">
          {block.items.map((item, index) => (
            <View
              key={index}
              className="md-li"
              style={{ paddingLeft: `${item.depth * 16}px` }}
            >
              <Text className="md-li-marker">
                {block.ordered ? `${index + 1}.` : item.marker === "-" || item.marker === "*" || item.marker === "+" ? "•" : item.marker}
              </Text>
              <Text className="md-li-text">
                <Inlines inlines={item.inlines} />
              </Text>
            </View>
          ))}
        </View>
      );
    case "quote":
      return (
        <View className="md-quote">
          {block.blocks.map((inner, index) => (
            <Block key={index} block={inner} fontSize={fontSize} />
          ))}
        </View>
      );
    case "hr":
      return <View className="md-hr" />;
    case "table":
      return (
        <View className="md-table">
          <View className="md-tr md-thead">
            {block.head.map((cell, index) => (
              <Text key={index} className="md-td">
                {cell}
              </Text>
            ))}
          </View>
          {block.rows.map((row, rowIndex) => (
            <View key={rowIndex} className="md-tr">
              {row.map((cell, cellIndex) => (
                <Text key={cellIndex} className="md-td">
                  {cell}
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
  }
}

function headingSize(level: number, base: number): number {
  if (level === 1) return base + 6;
  if (level === 2) return base + 4;
  if (level === 3) return base + 2;
  if (level === 4) return base + 1;
  return base;
}

function CodeBlock({
  language,
  text,
  fontSize,
}: {
  language: string;
  text: string;
  fontSize: number;
}) {
  const copy = () => {
    void Taro.setClipboardData({ data: text })
      .then(() => Taro.showToast({ title: "已复制", icon: "none" }))
      .catch(() => undefined);
  };
  return (
    <View className="md-code-block">
      <View className="md-code-head">
        <Text className="md-code-lang">{language || "code"}</Text>
        <Text className="md-code-copy" onClick={copy}>
          复制
        </Text>
      </View>
      <View className="md-code-body">
        <Text className="md-code-text" style={{ fontSize: `${Math.max(fontSize - 1.5, 10)}px` }}>
          {text.replace(/\n$/, "")}
        </Text>
      </View>
    </View>
  );
}

/** 纯文本降级（无 Markdown 语境，如工具输出预览）。 */
export function PlainText({ text, className }: { text: string; className?: string }) {
  return <Text className={className}>{text}</Text>;
}
