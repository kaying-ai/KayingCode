import Taro from "@tarojs/taro";
import { base64Encode, utf8Decode } from "@kayingcode/mobile-client-core";

/** 只对完整读回的受支持媒体打开预览，其余按文件下载/打开。 */
export async function previewMobileFile(
  fileName: string,
  mime: string,
  bytes: Uint8Array,
): Promise<void> {
  if (mime.startsWith("text/") || mime === "application/json") {
    await Taro.showModal({
      title: fileName,
      content: utf8Decode(bytes).slice(0, 4000),
      showCancel: false,
    });
    return;
  }
  if (process.env.TARO_ENV === "weapp") {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${Taro.env.USER_DATA_PATH}/preview-${Date.now()}-${safeName}`;
    await new Promise<void>((resolve, reject) => {
      Taro.getFileSystemManager().writeFile({
        filePath: path,
        data: bytes.buffer as ArrayBuffer,
        success: () => resolve(),
        fail: reject,
      });
    });
    if (mime.startsWith("image/")) await Taro.previewImage({ urls: [path] });
    else await Taro.openDocument({ filePath: path, showMenu: true });
    return;
  }
  if (mime.startsWith("image/")) {
    await Taro.previewImage({ urls: [`data:${mime};base64,${base64Encode(bytes)}`] });
    return;
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
