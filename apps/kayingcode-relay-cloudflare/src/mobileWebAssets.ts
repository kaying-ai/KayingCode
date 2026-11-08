import type { RelayCloudflareEnv } from "./contract.js";

/** 可选同源托管，开放当前 Web 制品和指定的域名校验文件；API 由 V2 DO 处理。 */
export async function mobileWebAssetsResponse(
  request: Request,
  env: Pick<RelayCloudflareEnv, "ASSETS">,
): Promise<Response | null> {
  const url = new URL(request.url);
  // 图标和 PDF 静态资源的既有 UI URL 从站点根读取，只映射到同一受控制品目录。
  const rootAsset =
    url.pathname.startsWith("/material-icons/") || url.pathname.startsWith("/pdfjs/");
  // 微信校验请求访问域名根路径，必须在 Worker 的静态路径白名单里精确放行。
  const domainVerification = url.pathname === "/69txzPKb7q.txt";
  if (
    !domainVerification &&
    url.pathname !== "/remote" &&
    !url.pathname.startsWith("/remote/") &&
    !rootAsset
  )
    return null;
  if (!["GET", "HEAD"].includes(request.method))
    return new Response("Method not allowed", { status: 405 });
  if (url.pathname === "/remote") return Response.redirect(new URL("/remote/", url).href, 308);
  if (rootAsset) url.pathname = `/remote${url.pathname}`;
  // 修复依据：旧部署只有 admin 资源，扫码网页始终 404；当前资源来自同一 ASSETS 制品。
  const response = await env.ASSETS.fetch(new Request(url, request));
  // 官方 Web 使用 /remote/v4 等客户端路由；只为无扩展名的 remote 页面回落到同一制品。
  if (
    response.status === 404 &&
    url.pathname.startsWith("/remote/") &&
    !url.pathname.split("/").at(-1)?.includes(".")
  ) {
    // ASSETS 对 index.html 会返回规范路径重定向；必须直接读目录，保留浏览器的 /remote/v4 路由。
    url.pathname = "/remote/";
    return env.ASSETS.fetch(new Request(url, request));
  }
  return response;
}
