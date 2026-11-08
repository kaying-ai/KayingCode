// 实现已下沉到 @zcode/client/v4/command-factory（mobile-client-core 抽取批：
// 移动核心依赖方向 core→client，不允许依赖桌面 UI 包）。本文件保留原导入路径与
// 导出面，ui 内部与桌面消费方无感。
export {
  createCommandEnvelope,
  getV4ClientId,
  uuidv7,
} from "@zcode/client/v4/command-factory";
