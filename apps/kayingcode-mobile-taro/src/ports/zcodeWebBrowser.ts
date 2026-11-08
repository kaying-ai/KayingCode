/** H5 的跨域登录可由用户直接交给顶层浏览器；不访问 iframe 的 Cookie 或历史。 */
export function openZcodeInBrowser(url: string): void {
  if (process.env.TARO_ENV === "h5" && typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
