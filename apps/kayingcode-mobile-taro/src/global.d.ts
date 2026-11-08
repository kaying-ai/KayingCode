// Taro 打包器环境的非 TS 资源声明。
declare module "*.css";
declare module "*.png" {
  const url: string;
  export default url;
}
