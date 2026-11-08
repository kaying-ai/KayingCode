import assert from "node:assert/strict";
import { test } from "vitest";
import { createFeedbackService } from "../src/feedback/feedbackService.js";

test("local feedback mock supports the form submission lifecycle without a remote endpoint", async () => {
  const service = createFeedbackService({});
  const ticket = await service.create({
    title: "编辑器拖拽异常",
    description: "项目无法拖到置顶段",
    type: "bug",
    severity: "P2-中",
    module: "UI布局 / 交互",
    source: "desktop-app",
    locale: "zh-CN",
  });

  assert.match(ticket.id, /^MOCK-/u);
  assert.equal(ticket.status, "已提交");
  assert.equal(ticket.description, "项目无法拖到置顶段");

  const screenshot = await service.uploadAttachmentData(ticket.id, "image", {
    dataBase64: "aGVsbG8=",
    filename: "screen.png",
    contentType: "image/png",
  });
  assert.equal(screenshot.filename, "screen.png");

  const comment = await service.comment(ticket.id, "补充复现步骤");
  assert.equal(comment.body, "补充复现步骤");

  const progressPhases: string[] = [];
  const subscription = service.onDynamicUploadProgress("log-progress")((progress) => {
    progressPhases.push(progress.phase);
  });
  await service.uploadAttachmentWithProgress(
    ticket.id,
    "log",
    { path: "mock-feedback.zip", contentType: "application/zip" },
    "log-progress",
  );
  subscription.dispose();
  assert.deepEqual(progressPhases, ["preparing", "complete"]);

  const detail = await service.get(ticket.id);
  assert.equal(detail.attachments.length, 2);
  assert.equal(detail.comments.length, 1);
  assert.deepEqual(
    (await service.list({ mine: true })).items.map((item) => item.id),
    [ticket.id],
  );
  await assert.rejects(() => service.get("MOCK-missing"), /Mock feedback ticket not found/u);
});

test("local feedback mock creates feature requests and provides a local device snapshot", async () => {
  const service = createFeedbackService({});
  const ticket = await service.create({
    title: "增加批量操作",
    description: "希望支持批量置顶",
    type: "feature",
    severity: "P3-低",
    module: "其它",
  });
  const snapshot = await service.getDeviceSnapshot();

  assert.equal(ticket.type, "feature");
  assert.equal(typeof snapshot.nodeVersion, "string");
  assert.equal(typeof snapshot.osPlatform, "string");
});
