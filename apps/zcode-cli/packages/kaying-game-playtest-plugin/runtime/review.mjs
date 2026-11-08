export function validateEvidence(session, ids, required = true) {
  if (required && !ids.length)
    throw new Error("Evidence required for covered claims, issues and scores");
  for (const id of ids)
    if (!session.artifacts.some((item) => item.id === id))
      throw new Error(`Unknown evidence id: ${id}`);
}

export function validateReview(session, review) {
  for (const collection of [review.sections ?? [], review.scores ?? []]) {
    const keys = collection.map((item) => item.key ?? item.dimension);
    if (new Set(keys).size !== keys.length) throw new Error("Duplicate review section/dimension");
  }
  for (const section of review.sections ?? []) {
    validateEvidence(
      session,
      section.evidenceIds,
      section.certainty !== "unverified" || ["verified", "partial"].includes(section.status),
    );
    for (const media of section.media ?? []) {
      const artifact = session.artifacts.find((item) => item.id === media.artifactId);
      if (
        !section.evidenceIds.includes(media.artifactId) ||
        !["screenshot", "recording", "highlight"].includes(artifact?.kind)
      )
        throw new Error("Section media must reference its own visual evidence");
    }
  }
  for (const score of review.scores ?? [])
    validateEvidence(session, score.evidenceIds, score.score !== null);
  for (const issue of review.issues ?? []) {
    validateEvidence(session, issue.evidenceIds);
    if (!issue.steps.length) throw new Error("Issue reproduction steps required");
  }
}
