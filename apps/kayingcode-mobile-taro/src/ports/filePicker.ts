import Taro from "@tarojs/taro";

export interface PickedMobileFile {
  fileName: string;
  mime: string;
  bytes: Uint8Array;
}

function mimeFor(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const known: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
    json: "application/json",
    csv: "text/csv",
  };
  return known[ext ?? ""] ?? "application/octet-stream";
}

/** H5 与微信小程序各自选择并读取字节；取消返回空列表。 */
export async function pickMobileFiles(): Promise<PickedMobileFile[]> {
  if (process.env.TARO_ENV === "weapp") {
    try {
      const result = await Taro.chooseMessageFile({ count: 1, type: "file" });
      const file = result.tempFiles[0];
      if (!file) return [];
      const bytes = await new Promise<Uint8Array>((resolve, reject) => {
        Taro.getFileSystemManager().readFile({
          filePath: file.path,
          success: (read) => {
            if (read.data instanceof ArrayBuffer) resolve(new Uint8Array(read.data));
            else reject(new Error("无法读取文件字节"));
          },
          fail: reject,
        });
      });
      return [{ fileName: file.name, mime: mimeFor(file.name), bytes }];
    } catch (caught) {
      if (
        typeof caught === "object" &&
        caught !== null &&
        "errMsg" in caught &&
        String(caught.errMsg).includes("cancel")
      )
        return [];
      throw caught;
    }
  }
  return new Promise<PickedMobileFile[]>((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      void Promise.all(
        files.map(async (file) => ({
          fileName: file.name,
          mime: file.type || mimeFor(file.name),
          bytes: new Uint8Array(await file.arrayBuffer()),
        })),
      ).then(resolve, reject);
    };
    input.oncancel = () => resolve([]);
    input.click();
  });
}
