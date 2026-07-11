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

type IssueBottomSheetProps = {
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

export function IssueBottomSheet({
  actionFeedback,
  authStatus,
  issue,
  isAuthPromptVisible,
  loadingAction,
  onAction,
  onClose,
  onWithdraw,
  userState,
}: IssueBottomSheetProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[720] p-3 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden">
      <GlassPanel className="pointer-events-auto max-h-[58dvh] overflow-y-auto px-4 py-4">
        <div className="mb-3 flex justify-center">
          <div className="h-1 w-12 rounded-full bg-slate-300" />
        </div>
        <button
          aria-label="Detayı kapat"
          className="absolute right-6 top-6 flex size-11 items-center justify-center rounded-full bg-white/70 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
          onClick={onClose}
          type="button"
        >
          <X className="size-5" />
        </button>
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
