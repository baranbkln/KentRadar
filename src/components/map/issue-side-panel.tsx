"use client";

import { X } from "lucide-react";
import { GlassPanel } from "@/components/map/glass-panel";
import { IssueDetailContent } from "@/components/map/issue-detail-content";
import type {
  IssueActionFeedback,
  IssueActionType,
  IssueUserState,
  PublicRoadIssue,
} from "@/lib/road-issues/types";

type IssueSidePanelProps = {
  actionFeedback: IssueActionFeedback | null;
  authStatus: "loading" | "authenticated" | "unauthenticated" | "unconfigured";
  issue: PublicRoadIssue;
  isAuthPromptVisible: boolean;
  loadingAction: IssueActionType | null;
  onAction: (action: IssueActionType, issue: PublicRoadIssue) => void;
  onClose: () => void;
  onWithdraw: (issue: PublicRoadIssue) => void;
  userState: IssueUserState | null;
};

export function IssueSidePanel({
  actionFeedback,
  authStatus,
  issue,
  isAuthPromptVisible,
  loadingAction,
  onAction,
  onClose,
  onWithdraw,
  userState,
}: IssueSidePanelProps) {
  return (
    <div className="pointer-events-none absolute bottom-5 right-5 top-28 z-[750] hidden w-[390px] md:block">
      <GlassPanel className="pointer-events-auto max-h-full p-3">
        <div className="mb-1 flex justify-end">
          <button
            aria-label="Detayı kapat"
            className="flex size-11 items-center justify-center rounded-full bg-white/70 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
            onClick={onClose}
            type="button"
          >
            <X className="size-5" />
          </button>
        </div>
        <IssueDetailContent
          actionFeedback={actionFeedback}
          authStatus={authStatus}
          issue={issue}
          isAuthPromptVisible={isAuthPromptVisible}
          loadingAction={loadingAction}
          onAction={onAction}
          onWithdraw={onWithdraw}
          userState={userState}
        />
      </GlassPanel>
    </div>
  );
}
