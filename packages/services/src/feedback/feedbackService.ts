import { basename } from "node:path";
import type {
  FeedbackAttachment,
  FeedbackAttachmentKind,
  FeedbackComment,
  FeedbackTicketDetail,
  FeedbackTicketSummary,
} from "@zcode/shared";
import type { FeedbackUploadProgress, IFeedbackService } from "./feedback.js";

/**
 * KayingCode.localrun 本地反馈 Mock。
 * 表单继续依赖 IFeedbackService，但所有工单只保存在当前 Host 进程内，不发网络请求。
 */
export interface CreateFeedbackServiceOptions {
  credentialService?: unknown;
  oauthService?: unknown;
  apiClient?: unknown;
  getDeviceMid?: () => string | undefined;
  apiBaseUrl?: string;
  createFullLogArchive?: unknown;
  revealPath?: (path: string) => Promise<void>;
}

export function createFeedbackService(options: CreateFeedbackServiceOptions): IFeedbackService {
  const tickets = new Map<string, FeedbackTicketDetail>();
  const canceledCreateOperations = new Set<string>();
  const progressListeners = new Map<string, Set<(progress: FeedbackUploadProgress) => unknown>>();
  let ticketSequence = 0;
  let attachmentSequence = 0;
  let commentSequence = 0;
  let eventSequence = 0;

  const getTicket = (id: string): FeedbackTicketDetail => {
    const ticket = tickets.get(id);
    if (!ticket) throw new Error(`Mock feedback ticket not found: ${id}`);
    return ticket;
  };

  const emitProgress = (id: string, progress: FeedbackUploadProgress) => {
    for (const listener of progressListeners.get(id) ?? []) listener(progress);
  };

  const addAttachment = (
    ticketId: string,
    kind: FeedbackAttachmentKind,
    file: { filename: string; contentType?: string; size?: number },
  ): FeedbackAttachment => {
    const ticket = getTicket(ticketId);
    const createdAt = new Date().toISOString();
    const attachment: FeedbackAttachment = {
      id: ++attachmentSequence,
      kind,
      filename: file.filename,
      size: file.size ?? 0,
      redacted: false,
      content_type: file.contentType ?? null,
      download_url: null,
      preview_url: null,
      created_at: createdAt,
    };
    ticket.attachments.push(attachment);
    ticket.updated_at = createdAt;
    return { ...attachment };
  };

  return {
    create: async (input, createOptions) => {
      if (createOptions?.operationId && canceledCreateOperations.has(createOptions.operationId)) {
        throw new Error(`Mock feedback create canceled: ${createOptions.operationId}`);
      }
      const createdAt = new Date().toISOString();
      const sequence = ++ticketSequence;
      const ticketId = `MOCK-${createdAt.slice(0, 10).replaceAll("-", "")}-${String(sequence).padStart(4, "0")}`;
      const ticket: FeedbackTicketDetail = {
        id: ticketId,
        title: input.title,
        description: input.description,
        type: input.type,
        ...(input.severity ? { severity: input.severity } : {}),
        ...(input.module ? { module: input.module } : {}),
        ...(input.framework ? { framework: input.framework } : {}),
        status: "已提交",
        assignee_id: null,
        assignee_display: null,
        reporter_display: "Local Mock",
        unread: false,
        last_user_activity_at: createdAt,
        created_at: createdAt,
        updated_at: createdAt,
        reporter: input.reporter ? { ...input.reporter } : null,
        device: input.device ? { ...input.device } : null,
        attachments: [],
        comments: [],
        events: [
          {
            id: ++eventSequence,
            type: "created",
            summary: "Saved to local feedback mock",
            actor_display_name: "Local Mock",
            created_at: createdAt,
          },
        ],
        lark_record_id: null,
      };
      tickets.set(ticketId, ticket);
      return cloneTicket(ticket);
    },
    cancelCreate: async (operationId) => {
      canceledCreateOperations.add(operationId);
    },
    list: async (query = {}) => {
      const filtered = [...tickets.values()]
        .filter((ticket) => !query.status || ticket.status === query.status)
        .filter((ticket) => !query.type || ticket.type === query.type)
        .sort((left, right) => right.created_at.localeCompare(left.created_at));
      const offset = Math.max(0, query.offset ?? 0);
      const limit = Math.max(0, query.limit ?? filtered.length);
      return {
        items: filtered.slice(offset, offset + limit).map(toTicketSummary),
        total: filtered.length,
      };
    },
    get: async (id) => cloneTicket(getTicket(id)),
    comment: async (id, body) => {
      const ticket = getTicket(id);
      const createdAt = new Date().toISOString();
      const comment: FeedbackComment = {
        id: ++commentSequence,
        author_display_name: "Local Mock",
        body,
        attachments: [],
        is_staff: false,
        created_at: createdAt,
      };
      ticket.comments.push(comment);
      ticket.events.push({
        id: ++eventSequence,
        type: "user_replied",
        summary: body,
        actor_display_name: "Local Mock",
        created_at: createdAt,
      });
      ticket.updated_at = createdAt;
      ticket.last_user_activity_at = createdAt;
      return { ...comment, attachments: [] };
    },
    uploadAttachment: async (id, kind, file) =>
      addAttachment(id, kind, {
        filename: (file.filename ?? basename(file.path)) || "attachment",
        contentType: file.contentType,
      }),
    uploadAttachmentWithProgress: async (id, kind, file, progressId) => {
      emitProgress(progressId, {
        id: progressId,
        phase: "preparing",
        uploadedBytes: 0,
        totalBytes: 0,
      });
      const attachment = addAttachment(id, kind, {
        filename: (file.filename ?? basename(file.path)) || "attachment",
        contentType: file.contentType,
      });
      emitProgress(progressId, {
        id: progressId,
        phase: "complete",
        uploadedBytes: attachment.size,
        totalBytes: attachment.size,
      });
      return attachment;
    },
    cancelUpload: async (progressId) => {
      emitProgress(progressId, {
        id: progressId,
        phase: "canceled",
        uploadedBytes: 0,
        totalBytes: 0,
      });
    },
    onDynamicUploadProgress: (id) => (listener) => {
      const listeners = progressListeners.get(id) ?? new Set();
      listeners.add(listener);
      progressListeners.set(id, listeners);
      return {
        dispose: () => {
          listeners.delete(listener);
          if (listeners.size === 0) progressListeners.delete(id);
        },
      };
    },
    uploadAttachmentData: async (id, kind, file) =>
      addAttachment(id, kind, {
        filename: file.filename,
        contentType: file.contentType,
        size: estimateBase64Size(file.dataBase64),
      }),
    attachLogsFromExport: async (id) =>
      addAttachment(id, "log", {
        filename: "kayingcode-mock-logs.zip",
        contentType: "application/zip",
      }),
    getDeviceSnapshot: async () => ({
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      osType: process.platform,
      osPlatform: process.platform,
      osArch: process.arch,
      deviceMid: options.getDeviceMid?.(),
    }),
    prepareCompactLogArchive: async () => ({
      path: "mock://kayingcode-feedback-logs.zip",
      size: 0,
    }),
    cleanupPreparedLogArchive: async () => undefined,
    revealLogArchive: async () => undefined,
  };
}

function estimateBase64Size(dataBase64: string): number {
  const payload = dataBase64.includes(",") ? (dataBase64.split(",").at(-1) ?? "") : dataBase64;
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

function toTicketSummary(ticket: FeedbackTicketDetail): FeedbackTicketSummary {
  return {
    id: ticket.id,
    title: ticket.title,
    type: ticket.type,
    ...(ticket.severity ? { severity: ticket.severity } : {}),
    ...(ticket.module ? { module: ticket.module } : {}),
    status: ticket.status,
    assignee_id: ticket.assignee_id,
    assignee_display: ticket.assignee_display,
    reporter_display: ticket.reporter_display,
    unread: ticket.unread,
    last_user_activity_at: ticket.last_user_activity_at,
    created_at: ticket.created_at,
    updated_at: ticket.updated_at,
  };
}

function cloneTicket(ticket: FeedbackTicketDetail): FeedbackTicketDetail {
  return {
    ...ticket,
    reporter: ticket.reporter ? { ...ticket.reporter } : ticket.reporter,
    device: ticket.device ? { ...ticket.device } : ticket.device,
    attachments: ticket.attachments.map((attachment) => ({ ...attachment })),
    comments: ticket.comments.map((comment) => ({
      ...comment,
      attachments: comment.attachments?.map((attachment) => ({ ...attachment })),
    })),
    events: ticket.events.map((event) => ({
      ...event,
      payload: event.payload ? { ...event.payload } : event.payload,
    })),
  };
}
