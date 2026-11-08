import { DurableObject } from "cloudflare:workers";
/** 仅保留历史 migration 的类导出，避免升级时隐式删除旧 DO 数据；无 binding 或旧协议。 */
export class RelayObject extends DurableObject {
  fetch(): Response { return new Response("Retired", { status: 410 }); }
}
