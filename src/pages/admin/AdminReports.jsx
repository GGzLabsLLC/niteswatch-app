import { useEffect, useMemo, useRef, useState } from "react";
import {
  REPORT_STATUSES,
  subscribeToMessageModeration,
  subscribeToModerationActionsForReport,
  subscribeToReports,
  getQueueCountsFromReports,
  getUserModerationHistory,
  markReportReviewed,
  dismissReport,
  escalateReport,
  hideMessageFromReport,
  unhideMessageFromReport,
  saveModeratorNote,
  warnUserFromReport,
  deleteMessageFromReport,
} from "../../lib/moderation/moderationService";
import {
  SUSPENSION_TYPES,
  suspendUser,
  unsuspendUser,
} from "../../lib/suspensionsFirestore";
import { pushToast } from "../../utils/notifications";
import ReportDetailModal from "./ReportDetailModal";
import ReportQueue from "./ReportQueue";

const FILTERS = [
  { key: "all", label: "All" },
  { key: REPORT_STATUSES.OPEN, label: "Open" },
  { key: REPORT_STATUSES.REVIEWED, label: "Reviewed" },
  { key: REPORT_STATUSES.DISMISSED, label: "Dismissed" },
  { key: REPORT_STATUSES.ESCALATED, label: "Escalated" },
];

function AdminReports({ currentUser }) {
  const [reports, setReports] = useState([]);
  const [filter, setFilter] = useState("all");
  const [selectedReport, setSelectedReport] = useState(null);
  const [selectedMessageModeration, setSelectedMessageModeration] =
    useState(null);
  const [reportedUserHistory, setReportedUserHistory] = useState(null);
  const [reportActions, setReportActions] = useState([]);
  const [reportUserHistoryMap, setReportUserHistoryMap] = useState({});
  const [counts, setCounts] = useState({
    all: 0,
    open: 0,
    reviewed: 0,
    dismissed: 0,
    escalated: 0,
  });
  const [pendingActions, setPendingActions] = useState({});

  const pendingActionKeysRef = useRef(new Set());

  const moderatorUid = currentUser?.uid || "";
  const moderatorDisplayName =
    currentUser?.handle ||
    currentUser?.displayName ||
    currentUser?.email ||
    "Moderator";

  function showNotice(type, message) {
    pushToast({
      message,
      variant: type === "error" ? "error" : "success",
      icon: type === "error" ? "⚠️" : "✅",
      meta: "Admin moderation",
    });
  }

  function ensureModeratorIdentity() {
    if (!moderatorUid) {
      throw new Error("Missing signed-in moderator uid.");
    }
  }

  function clearPendingActions() {
    pendingActionKeysRef.current.clear();
    setPendingActions({});
  }

  function startPending(key) {
    if (!key) return false;

    if (pendingActionKeysRef.current.has(key)) {
      return false;
    }

    pendingActionKeysRef.current.add(key);

    setPendingActions((prev) => ({
      ...prev,
      [key]: true,
    }));

    return true;
  }

  function finishPending(key) {
    if (!key) return;

    pendingActionKeysRef.current.delete(key);

    setPendingActions((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function runGuardedAction(key, action) {
    if (!key) {
      return { ok: false, skipped: true };
    }

    const canRun = startPending(key);

    if (!canRun) {
      console.warn("[runGuardedAction] skipped pending action", key, {
        refHasKey: pendingActionKeysRef.current.has(key),
        stateHasKey: !!pendingActions[key],
        pendingKeys: Array.from(pendingActionKeysRef.current),
      });
      return { ok: false, skipped: true };
    }

    try {
      const result = await action();
      return { ok: true, result };
    } finally {
      finishPending(key);
    }
  }

  async function refreshSelectedUserHistory(userId) {
    if (!userId) {
      setReportedUserHistory(null);
      return null;
    }

    try {
      const result = await getUserModerationHistory({ userId });

      if (!result?.ok) {
        throw new Error(
          result?.error?.message || "Failed to load user history."
        );
      }

      const history = result.data || null;
      setReportedUserHistory(history);

      setReportUserHistoryMap((prev) => ({
        ...prev,
        [userId]: history,
      }));

      return history;
    } catch (error) {
      console.error("Failed to refresh selected user history:", error);
      setReportedUserHistory(null);
      return null;
    }
  }

  useEffect(() => {
    const unsubscribe = subscribeToReports((nextReports) => {
      setReports(nextReports);
      setCounts(getQueueCountsFromReports(nextReports));

      if (selectedReport?.id) {
        const updated = nextReports.find(
          (report) => report.id === selectedReport.id
        );
        setSelectedReport(updated || null);
      }
    });

    return unsubscribe;
  }, [selectedReport?.id]);

  useEffect(() => {
    clearPendingActions();
  }, [selectedReport?.id]);

  useEffect(() => {
    let isMounted = true;

    async function loadQueueUserHistory() {
      const userIds = Array.from(
        new Set(reports.map((report) => report.reportedUserId).filter(Boolean))
      );

      if (!userIds.length) {
        setReportUserHistoryMap({});
        return;
      }

      try {
        const entries = await Promise.all(
          userIds.map(async (userId) => {
            const result = await getUserModerationHistory({ userId });
            return [userId, result?.ok ? result.data : null];
          })
        );

        if (!isMounted) return;

        const nextMap = Object.fromEntries(entries);
        setReportUserHistoryMap(nextMap);
      } catch (error) {
        console.error("Failed to load queue user histories:", error);
        if (isMounted) {
          setReportUserHistoryMap({});
        }
      }
    }

    loadQueueUserHistory();

    return () => {
      isMounted = false;
    };
  }, [reports]);

  useEffect(() => {
    if (!selectedReport?.targetId) {
      setSelectedMessageModeration(null);
      return;
    }

    const unsubscribe = subscribeToMessageModeration(
      selectedReport.targetId,
      (entry) => {
        setSelectedMessageModeration(entry);
      }
    );

    return unsubscribe;
  }, [selectedReport?.targetId]);

  useEffect(() => {
    let isMounted = true;

    async function loadReportedUserHistory() {
      if (!selectedReport?.reportedUserId) {
        setReportedUserHistory(null);
        return;
      }

      try {
        const result = await getUserModerationHistory({
          userId: selectedReport.reportedUserId,
        });

        if (!result?.ok) {
          throw new Error(
            result?.error?.message || "Failed to load user history."
          );
        }

        if (isMounted) {
          setReportedUserHistory(result.data || null);
        }
      } catch (error) {
        console.error("Failed to load reported user history:", error);
        if (isMounted) {
          setReportedUserHistory(null);
        }
      }
    }

    loadReportedUserHistory();

    return () => {
      isMounted = false;
    };
  }, [selectedReport?.id, selectedReport?.reportedUserId]);

  useEffect(() => {
    if (!selectedReport?.id) {
      setReportActions([]);
      return;
    }

    const unsubscribe = subscribeToModerationActionsForReport(
      selectedReport.id,
      (actions) => {
        setReportActions(actions || []);
      }
    );

    return unsubscribe;
  }, [selectedReport?.id]);

  const enrichedReports = useMemo(() => {
    return reports.map((report) => {
      const userHistory = reportUserHistoryMap[report.reportedUserId] || null;
      const warningCount =
        userHistory?.warningCount ?? userHistory?.warnings ?? 0;

      return {
        ...report,
        warningCount,
        isRepeatOffender: userHistory?.isRepeatOffender ?? warningCount >= 3,
      };
    });
  }, [reports, reportUserHistoryMap]);

  const filteredReports = useMemo(() => {
    if (filter === "all") return enrichedReports;
    return enrichedReports.filter((report) => report.status === filter);
  }, [enrichedReports, filter]);

  const handleOpenReport = (report) => {
    setSelectedReport(report);
  };

  const handleCloseReport = () => {
    clearPendingActions();
    setSelectedReport(null);
    setSelectedMessageModeration(null);
    setReportedUserHistory(null);
    setReportActions([]);
  };

  const handleReview = async (reportId) => {
    const key = `report:${reportId}:review`;

    try {
      const guarded = await runGuardedAction(key, async () => {
        ensureModeratorIdentity();

        const result = await markReportReviewed({
          reportId,
          moderatorUid,
          moderatorDisplayName,
          note: "Reviewed from Nite's Watch mod inbox",
        });

        if (!result?.ok) {
          throw new Error(result?.error?.message || "Failed to review report.");
        }

        return result;
      });

      if (guarded.skipped) return;
      showNotice("success", "Report marked reviewed.");
    } catch (error) {
      console.error("Failed to review report:", error);
      showNotice("error", error.message || "Failed to mark report reviewed.");
    }
  };

  const handleDismiss = async (reportId) => {
    const key = `report:${reportId}:dismiss`;

    try {
      const guarded = await runGuardedAction(key, async () => {
        ensureModeratorIdentity();

        const result = await dismissReport({
          reportId,
          moderatorUid,
          moderatorDisplayName,
          note: "Dismissed from Nite's Watch mod inbox",
        });

        if (!result?.ok) {
          throw new Error(result?.error?.message || "Failed to dismiss report.");
        }

        return result;
      });

      if (guarded.skipped) return;
      showNotice("success", "Report dismissed.");
    } catch (error) {
      console.error("Failed to dismiss report:", error);
      showNotice("error", error.message || "Failed to dismiss report.");
    }
  };

  const handleEscalate = async (reportId) => {
    const key = `report:${reportId}:escalate`;

    try {
      const guarded = await runGuardedAction(key, async () => {
        ensureModeratorIdentity();

        const result = await escalateReport({
          reportId,
          moderatorUid,
          moderatorDisplayName,
          note: "Escalated from Nite's Watch mod inbox",
        });

        if (!result?.ok) {
          throw new Error(result?.error?.message || "Failed to escalate report.");
        }

        return result;
      });

      if (guarded.skipped) return;
      showNotice("success", "Report escalated.");
    } catch (error) {
      console.error("Failed to escalate report:", error);
      showNotice("error", error.message || "Failed to escalate report.");
    }
  };

  const handleHideMessage = async (payload) => {
  const messageId =
    typeof payload === "string" ? payload : payload?.messageId || null;
  const reportId =
    typeof payload === "string"
      ? selectedReport?.id
      : payload?.reportId || selectedReport?.id || null;
  const targetUserId =
    typeof payload === "string"
      ? selectedReport?.reportedUserId
      : payload?.targetUserId || selectedReport?.reportedUserId || null;
  const roomId =
    typeof payload === "string"
      ? selectedReport?.roomId
      : payload?.roomId || selectedReport?.roomId || null;

  if (!messageId) return;

  const key = `message:${messageId}:hide`;

  try {
    const guarded = await runGuardedAction(key, async () => {
      ensureModeratorIdentity();

      const result = await hideMessageFromReport({
        reportId,
        messageId,
        targetUserId,
        roomId,
        moderatorUid,
        moderatorDisplayName,
        note: "Message manually hidden from admin reports dashboard.",
      });

      console.log("[handleHideMessage] service result", result, {
        reportId,
        messageId,
        targetUserId,
        roomId,
      });

      if (!result?.ok) {
        throw new Error(result?.error?.message || "Failed to hide message.");
      }

      if (targetUserId) {
        await refreshSelectedUserHistory(targetUserId);
      }

      return result;
    });

    if (guarded?.skipped) return;
    showNotice("success", "Message hidden.");
  } catch (error) {
    console.error("Failed to hide message:", error);
    showNotice("error", error.message || "Failed to hide message.");
  }
};

const handleUnhideMessage = async (payload) => {
  const messageId =
    typeof payload === "string" ? payload : payload?.messageId || null;
  const reportId =
    typeof payload === "string"
      ? selectedReport?.id
      : payload?.reportId || selectedReport?.id || null;
  const targetUserId =
    typeof payload === "string"
      ? selectedReport?.reportedUserId
      : payload?.targetUserId || selectedReport?.reportedUserId || null;
  const roomId =
    typeof payload === "string"
      ? selectedReport?.roomId
      : payload?.roomId || selectedReport?.roomId || null;

  if (!messageId) return;

  const key = `message:${messageId}:unhide`;

  try {
    const guarded = await runGuardedAction(key, async () => {
      ensureModeratorIdentity();

      const result = await unhideMessageFromReport({
        reportId,
        messageId,
        targetUserId,
        roomId,
        moderatorUid,
        moderatorDisplayName,
        note: "Message manually unhidden from admin reports dashboard.",
      });

      if (!result?.ok) {
        throw new Error(result?.error?.message || "Failed to unhide message.");
      }

      if (targetUserId) {
        await refreshSelectedUserHistory(targetUserId);
      }

      return result;
    });

    if (guarded.skipped) return;
    showNotice("success", "Message unhidden.");
  } catch (error) {
    console.error("Failed to unhide message:", error);
    showNotice("error", error.message || "Failed to unhide message.");
  }
};

  const handleSaveModeratorNote = async (reportId, note) => {
    const key = `report:${reportId}:note`;

    try {
      const guarded = await runGuardedAction(key, async () => {
        ensureModeratorIdentity();

        const result = await saveModeratorNote({
          reportId,
          messageId: selectedReport?.targetId,
          targetUserId: selectedReport?.reportedUserId,
          roomId: selectedReport?.roomId,
          moderatorUid,
          moderatorDisplayName,
          note,
        });

        if (!result?.ok) {
          throw new Error(
            result?.error?.message || "Failed to save moderator note."
          );
        }

        await refreshSelectedUserHistory(selectedReport?.reportedUserId);
        return result;
      });

      if (guarded.skipped) return;
      showNotice("success", "Moderator note saved.");
    } catch (error) {
      console.error("Failed to save moderator note:", error);
      showNotice("error", error.message || "Failed to save moderator note.");
    }
  };

  const handleWarnUser = async (reportId, note = "") => {
    const key = `report:${reportId}:warn`;

    console.log("[handleWarnUser] clicked", {
      reportId,
      note,
      selectedReport,
      moderatorUid,
      moderatorDisplayName,
    });

    try {
      const guarded = await runGuardedAction(key, async () => {
        ensureModeratorIdentity();

        console.log("[handleWarnUser] running guarded action", {
          reportId,
          messageId: selectedReport?.targetId,
          targetUserId: selectedReport?.reportedUserId,
          roomId: selectedReport?.roomId,
          moderatorUid,
          moderatorDisplayName,
          currentUser,
        });

        const result = await warnUserFromReport({
          reportId,
          messageId: selectedReport?.targetId,
          targetUserId: selectedReport?.reportedUserId,
          roomId: selectedReport?.roomId,
          moderatorUid,
          moderatorDisplayName,
          note,
        });

        console.log("[handleWarnUser] service result", result);

        if (!result?.ok) {
          throw new Error(result?.error?.message || "Failed to warn user.");
        }

        const refreshedHistory = await refreshSelectedUserHistory(
          selectedReport?.reportedUserId
        );

        console.log("[handleWarnUser] refreshed history", refreshedHistory);

        return result;
      });

      if (guarded.skipped) {
        console.warn("[handleWarnUser] skipped", {
          key,
          pendingKeys: Array.from(pendingActionKeysRef.current),
        });
        return;
      }

      showNotice("success", "User warned successfully.");
    } catch (error) {
      console.error("Failed to warn user:", error);
      showNotice("error", error.message || "Failed to warn user.");
    }
  };

  const handleDeleteMessage = async (reportId, note = "") => {
    const key = `report:${reportId}:delete-message`;

    try {
      const guarded = await runGuardedAction(key, async () => {
        ensureModeratorIdentity();

        const result = await deleteMessageFromReport({
          reportId,
          messageId: selectedReport?.targetId,
          targetUserId: selectedReport?.reportedUserId,
          roomId: selectedReport?.roomId,
          moderatorUid,
          moderatorDisplayName,
          note,
          metadata: {
            deleteReason: "Message removed by moderation",
          },
        });

        if (!result?.ok) {
          throw new Error(result?.error?.message || "Failed to delete message.");
        }

        await refreshSelectedUserHistory(selectedReport?.reportedUserId);
        return result;
      });

      if (guarded.skipped) return;
      showNotice("success", "Message deleted.");
    } catch (error) {
      console.error("Failed to delete message:", error);
      showNotice("error", error.message || "Failed to delete message.");
    }
  };

  const handleSuspendUser = async ({
    reportId,
    targetUserId,
    durationHours = 24,
    note = "",
    isPermanent = false,
  }) => {
    const key = `user:${targetUserId}:suspend:${
      isPermanent ? "permanent" : durationHours
    }`;

    try {
      const guarded = await runGuardedAction(key, async () => {
        ensureModeratorIdentity();

        const result = await suspendUser({
          targetUserId,
          moderator: {
            uid: moderatorUid,
            handle: moderatorDisplayName,
          },
          reason:
            note ||
            (isPermanent
              ? "Permanent suspension issued from admin reports."
              : "Temporary suspension issued from admin reports."),
          suspensionType: isPermanent
            ? SUSPENSION_TYPES.PERMANENT
            : SUSPENSION_TYPES.TEMPORARY,
          durationHours: isPermanent ? null : durationHours,
          reportId: reportId || selectedReport?.id || "",
          notes: note || "",
        });

        if (!result?.ok) {
          throw new Error(result?.error?.message || "Failed to suspend user.");
        }

        await refreshSelectedUserHistory(targetUserId);
        return result;
      });

      if (guarded.skipped) return;

      showNotice(
        "success",
        isPermanent
          ? "User permanently suspended."
          : `User suspended for ${durationHours} hour${
              durationHours === 1 ? "" : "s"
            }.`
      );
    } catch (error) {
      console.error("Failed to suspend user:", error);
      showNotice("error", error.message || "Failed to suspend user.");
    }
  };

  const handleUnsuspendUser = async ({
    reportId,
    targetUserId,
    note = "",
  }) => {
    const key = `user:${targetUserId}:unsuspend`;

    try {
      const guarded = await runGuardedAction(key, async () => {
        ensureModeratorIdentity();

        const result = await unsuspendUser({
          targetUserId,
          moderator: {
            uid: moderatorUid,
            handle: moderatorDisplayName,
          },
          reason: note || "Suspension lifted from admin reports.",
          reportId: reportId || selectedReport?.id || "",
        });

        if (!result?.ok) {
          throw new Error(result?.error?.message || "Failed to lift suspension.");
        }

        await refreshSelectedUserHistory(targetUserId);
        return result;
      });

      if (guarded.skipped) return;
      showNotice("success", "User suspension lifted.");
    } catch (error) {
      console.error("Failed to lift suspension:", error);
      showNotice("error", error.message || "Failed to lift suspension.");
    }
  };

  return (
    <section className="admin-reports-page">
      <div className="admin-reports-shell">
        <div className="admin-reports-hero">
          <p className="admin-reports-eyebrow">Nite's Watch Admin</p>
          <h1>Moderation Reports</h1>
          <p className="admin-reports-subtext">
            Review user and message reports captured by the in-app moderation
            flow.
          </p>
        </div>

        <div className="admin-reports-stats">
          <div className="admin-stat-card">
            <span className="admin-stat-label">Total</span>
            <strong>{counts.all}</strong>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-label">Open</span>
            <strong>{counts.open}</strong>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-label">Reviewed</span>
            <strong>{counts.reviewed}</strong>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-label">Dismissed</span>
            <strong>{counts.dismissed}</strong>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-label">Escalated</span>
            <strong>{counts.escalated}</strong>
          </div>
        </div>

        <div className="admin-reports-filters">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`admin-filter-chip ${
                filter === item.key ? "is-active" : ""
              }`}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <ReportQueue
          reports={filteredReports}
          onOpenReport={handleOpenReport}
          onReview={handleReview}
          onDismiss={handleDismiss}
          onEscalate={handleEscalate}
          onHideMessage={handleHideMessage}
          onUnhideMessage={handleUnhideMessage}
          pendingActions={pendingActions}
        />
      </div>

      <ReportDetailModal
        report={selectedReport}
        messageModeration={selectedMessageModeration}
        reportedUserHistory={reportedUserHistory}
        reportActions={reportActions}
        onClose={handleCloseReport}
        onReview={handleReview}
        onDismiss={handleDismiss}
        onEscalate={handleEscalate}
        onHideMessage={handleHideMessage}
        onUnhideMessage={handleUnhideMessage}
        onSaveModeratorNote={handleSaveModeratorNote}
        onWarnUser={handleWarnUser}
        onDeleteMessage={handleDeleteMessage}
        onSuspendUser={handleSuspendUser}
        onUnsuspendUser={handleUnsuspendUser}
        pendingActions={pendingActions}
      />
    </section>
  );
}

export default AdminReports;