// v86: Tages-Digest formen (rein, testbar).
export function buildDigest(rows) {
  const r = rows || {};
  const openTasks = Array.isArray(r.openTasks) ? r.openTasks : [];
  const proposals = (Array.isArray(r.proposals) ? r.proposals : []).map((p) => ({
    task_id: p.task_id, title: p.title, proposal_model: p.proposal_model, cost_usd: p.cost_usd, updated_at: p.updated_at,
    excerpt: String(p.proposal || '').slice(0, 500),
  }));
  const siteChanges = Array.isArray(r.siteChanges) ? r.siteChanges : [];
  const memberPromptChanges = Array.isArray(r.memberPromptChanges) ? r.memberPromptChanges : [];
  return {
    generatedAt: r.generatedAt || new Date().toISOString(),
    openTasks,
    proposals,
    siteChanges,
    memberPromptChanges,
    counts: {
      openTasks: openTasks.length,
      proposals: proposals.length,
      siteChanges: siteChanges.length,
      memberPromptChanges: memberPromptChanges.length,
    },
  };
}
