import assert from "node:assert/strict";
import { test } from "vitest";
import { RelayAttachments } from "./relayAttachments.js";

test("upload cancellation releases a pending RPC without sending chunks or waiting for abort ACK", async () => {
  const calls: string[] = [];
  const transfer = new RelayAttachments(
    {
      attachmentBeginV4: () => {
        calls.push("begin");
        return new Promise(() => {});
      },
      attachmentChunkV4: async () => {
        calls.push("chunk");
        throw new Error("unexpected");
      },
      attachmentCommitV4: async () => {
        calls.push("commit");
        throw new Error("unexpected");
      },
      attachmentAbortV4: () => {
        calls.push("abort");
        return new Promise(() => {});
      },
      attachmentReadV4: async () => {
        throw new Error("unused");
      },
    },
    { workspacePath: "workspace" },
    () => true,
  );
  const controller = new AbortController();
  const result = transfer.put({
    sessionId: "session",
    fileName: "a.txt",
    mime: "text/plain",
    bytes: new Uint8Array([1]),
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(result, /cancelled/);
  assert.deepEqual(calls, ["begin", "abort"]);
});

test("upload validates acknowledgement cursors and aborts a failed transaction", async () => {
  const calls: string[] = [];
  const service = {
    attachmentBeginV4: async () => {
      calls.push("begin");
      return { state: "staging" as const, uploadId: "test", nextChunkIndex: 0 };
    },
    attachmentChunkV4: async () => {
      calls.push("chunk");
      return { uploadId: "test", nextChunkIndex: 9 };
    },
    attachmentCommitV4: async () => {
      calls.push("commit");
      return { ref: "ref" };
    },
    attachmentAbortV4: async () => {
      calls.push("abort");
    },
    attachmentReadV4: async () => {
      throw new Error("unused");
    },
  };
  const transfer = new RelayAttachments(service, { workspacePath: "workspace" }, () => true);
  await assert.rejects(
    transfer.put({
      sessionId: "session",
      fileName: "a.txt",
      mime: "text/plain",
      bytes: new Uint8Array([1]),
    }),
    /invalidCursor/,
  );
  assert.deepEqual(calls, ["begin", "chunk", "abort"]);
});

test("attachment read honors the terminal null cursor and rejects incomplete previews", async () => {
  let nextOffset: number | null = null;
  const transfer = new RelayAttachments(
    {
      attachmentReadV4: async () => ({
        dataBase64: "AQI=",
        mediaType: "image/png",
        totalBytes: 2,
        nextOffset,
      }),
      attachmentBeginV4: async () => {
        throw new Error("unused");
      },
      attachmentChunkV4: async () => {
        throw new Error("unused");
      },
      attachmentCommitV4: async () => {
        throw new Error("unused");
      },
      attachmentAbortV4: async () => {},
    },
    { workspacePath: "workspace" },
    () => true,
  );
  assert.deepEqual(
    (await transfer.read({ sessionId: "session", ref: "ref" })).bytes,
    new Uint8Array([1, 2]),
  );
  nextOffset = 2;
  await assert.rejects(transfer.read({ sessionId: "session", ref: "ref" }));
});
