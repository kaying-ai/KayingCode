import { ChannelAttachments } from "@kayingcode/mobile-client-core";
import { previewMobileFile } from "../ports/filePreview";
import { flow } from "./store";

export async function openZcodeAttachment(
  sessionId: string,
  ref: string,
  fileName: string,
  mime: string,
): Promise<void> {
  const session = flow.getZcodeSession();
  if (!session?.bridge || !session.workspaceTarget) throw new Error("当前链路无法读取附件");
  const bridge = session.bridge;
  const file = await new ChannelAttachments(bridge, session.workspaceTarget).read(sessionId, ref);
  if (flow.getZcodeSession()?.bridge !== bridge) return;
  await previewMobileFile(fileName, file.mediaType ?? mime, file.bytes);
}
