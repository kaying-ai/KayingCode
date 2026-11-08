// 实现已下沉到 @zcode/client/v4/topic-wire-decoder（mobile-client-core 抽取批：
// 移动核心依赖方向 core→client，不允许依赖桌面 UI 包）。
// 本文件保留原导入路径并注入 ui logger：生产构建 no-op、桌面 renderer 走 bridge
// 转发的既有日志语义不变；client 侧缺省 console.warn。
import { logger } from "@/logger.js";
import {
  TopicWireFrameAssembler,
  type TopicFrameDeliveryKind,
  type TopicWireAssemblyFault,
} from "@zcode/shared/kayingcode-protocol-v4";
import {
  createTopicWireDecoder as createTopicWireDecoderWithLogger,
  type TopicWireDecoder,
} from "@zcode/client/v4/topic-wire-decoder";

export {
  createTopicWireDecoder as createTopicWireDecoderWithLogger,
  type TopicWireDecoder,
  type TopicWireDecoderLogger,
} from "@zcode/client/v4/topic-wire-decoder";

export function createTopicWireDecoder<F extends { topic: string; subscriptionId: string }>(
  assembler: TopicWireFrameAssembler<F>,
  deliver: (frame: F, deliveryKind: TopicFrameDeliveryKind) => void,
  onFault?: (fault: TopicWireAssemblyFault) => void,
): TopicWireDecoder {
  return createTopicWireDecoderWithLogger(assembler, deliver, onFault, logger);
}
