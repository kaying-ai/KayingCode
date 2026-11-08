import React from "react";

export const useServices = () => window.previewTest.services;
export const logger = { debug() {}, warn() {}, info() {}, error() {} };
export const useKayingCodeIntl = () => ({ intl: { formatMessage: ({ id }) => id } });
export function UnifiedBrowserView({ initialUrl, screenshotSurfaceRequest }) {
  return (
    <div
      data-testid="preview-guest"
      data-url={initialUrl}
      data-capture={screenshotSurfaceRequest?.requestId ?? ""}
    >
      Game viewport
    </div>
  );
}
