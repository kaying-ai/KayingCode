/** 当前 Cloudflare V2 Relay、账号与同源 Web 制品的宿主端口。 */
export interface RelayCloudflareEnv {
  WEB_REMOTE: DurableObjectNamespace;
  ASSETS: Fetcher;
  /** 受控部署可选的邀请/凭据有效期（天）；非法值由运行时回退默认。 */
  KAYINGCODE_REMOTE_INVITE_TTL_DAYS?: string;
  KAYINGCODE_REMOTE_INVITE_MAX_CLAIMS?: string;
  KAYINGCODE_REMOTE_TERMINAL_TTL_DAYS?: string;
}
