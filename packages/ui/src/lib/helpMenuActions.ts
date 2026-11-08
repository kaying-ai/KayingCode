import type { FeedbackSubmitDraft } from "@/feedback/feedbackStore.js";

interface HelpMenuActionHandlers {
  openIssueReport: () => Promise<void>;
}

export function createHelpMenuActionHandlers({
  openSubmit,
}: {
  openSubmit: (draft?: FeedbackSubmitDraft) => void;
}): HelpMenuActionHandlers {
  return {
    openIssueReport: async () => {
      openSubmit({
        type: "bug",
        module: "其它",
        severity: "P2-中",
        includeLogs: false,
        screenshots: [],
      });
    },
  };
}
