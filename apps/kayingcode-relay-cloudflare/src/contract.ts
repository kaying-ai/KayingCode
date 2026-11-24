/** 当前 Cloudflare V2 Relay、账号与同源 Web 制品的宿主端口。 */
export interface RelayCloudflareEnv {
  WEB_REMOTE: DurableObjectNamespace;
  ASSETS: Fetcher;
  /** 受控部署可选的邀请/凭据有效期（天）；非法值由运行时回退默认。 */
  KAYINGCODE_REMOTE_INVITE_TTL_DAYS?: string;
  KAYINGCODE_REMOTE_INVITE_MAX_CLAIMS?: string;
  KAYINGCODE_REMOTE_TERMINAL_TTL_DAYS?: string;
  /** `/api/v1/client/*` 模式：mock 返回共享 fixtures，proxy 转发到固定上游。缺省不开放。 */
  KAYINGCODE_API_MODE?: string;
  /** proxy 模式的上游 origin；必须是 https 且不带路径/query。 */
  KAYINGCODE_API_UPSTREAM_ORIGIN?: string;
}
