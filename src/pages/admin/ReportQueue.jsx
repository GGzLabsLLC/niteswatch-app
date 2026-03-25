import ReportCard from "./ReportCard";

function ReportQueue({
  reports,
  onOpenReport,
  onReview,
  onDismiss,
  onEscalate,
  onHideMessage,
  onUnhideMessage,
  pendingActions = {},
}) {
  if (!reports.length) {
    return (
      <div className="admin-reports-empty">
        <h3>No reports in this view</h3>
        <p>When users submit reports, they’ll show up here.</p>
      </div>
    );
  }

  return (
    <div className="admin-reports-grid">
      {reports.map((report) => (
        <ReportCard
          key={report.id}
          report={report}
          onOpenReport={onOpenReport}
          onReview={onReview}
          onDismiss={onDismiss}
          onEscalate={onEscalate}
          onHideMessage={onHideMessage}
          onUnhideMessage={onUnhideMessage}
          pendingActions={pendingActions}
        />
      ))}
    </div>
  );
}

export default ReportQueue;