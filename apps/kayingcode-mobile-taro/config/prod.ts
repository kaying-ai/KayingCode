import type { UserConfigExport } from "@tarojs/cli";

export default {
  mini: {},
  h5: {
    /**
     * weapp 上传与 H5 静态托管共用压缩链路；保留 sourcemap 关闭与压缩打开的默认。
     * CI artifact（MOB-P-001）：build:h5 产物 = dist/h5，可直接托管或交 Capacitor 打壳。
     */
    miniCssExtractPluginOption: {
      ignoreOrder: true,
    },
  },
} satisfies UserConfigExport;
