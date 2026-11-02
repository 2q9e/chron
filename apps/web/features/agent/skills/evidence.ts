import type {
  AnswerClaim,
  EvidenceCitation,
  ResearchSourceAssessment,
  SourceRole,
} from "./types.ts";

export type SourceDisposition = "usable" | "limited" | "exclude";

export interface SourceQualityReview {
  readonly sourceId: string;
  readonly disposition: SourceDisposition;
  readonly supportedClaimIds: readonly string[];
  readonly limitations: readonly string[];
  readonly corroboration: "shared-origin" | "no-shared-origin-identified" | "unknown";
  readonly corroborationLimitations: readonly string[];
}

export interface SourceQualityReport {
  readonly reviews: readonly SourceQualityReview[];
  readonly claimsWithoutUsableSupport: readonly string[];
}

export type CitationIssueCode =
  | "uncited-sourced-claim"
  | "duplicate-citation-id"
  | "unknown-citation"
  | "unknown-source"
  | "source-role-mismatch"
  | "wrong-owner"
  | "deleted-source"
  | "changed-source"
  | "invalid-source-version"
  | "source-version-mismatch"
  | "invalid-excerpt-range"
  | "excerpt-range-mismatch"
  | "missing-document-locator"
  | "invalid-source-url";

export interface CitationIssue {
  readonly code: CitationIssueCode;
  readonly claimId?: string;
  readonly citationId?: string;
}

export interface CitationValidationInput {
  readonly claims: readonly AnswerClaim[];
  readonly citations: readonly EvidenceCitation[];
  readonly sources: readonly Pick<ResearchSourceAssessment, "sourceId" | "sourceVersion" | "sourceRole">[];
  readonly expectedOwnerId: string;
}

const empiricalSourceRoles = new Set<SourceRole>([
  "original-study",
  "peer-reviewed-synthesis",
  "government-or-institutional-data",
  "reputable-reported-analysis",
]);

function isValidTimestamp(value: string | undefined): boolean {
  return value === undefined || (value.trim().length > 0 && Number.isFinite(Date.parse(value)));
}

function hasValidPublicUrl(value: string | undefined): boolean {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

export function reviewSourceQuality(
  sources: readonly ResearchSourceAssessment[],
  requestedClaimIds: readonly string[],
): SourceQualityReport {
  const requested = new Set(requestedClaimIds);
  const groupCounts = new Map<string, number>();

  for (const source of sources) {
    if (source.independenceGroup) {
      groupCounts.set(
        source.independenceGroup,
        (groupCounts.get(source.independenceGroup) ?? 0) + 1,
      );
    }
  }

  const reviews = sources.map((source): SourceQualityReview => {
    const supportedClaimIds = source.directlySupportsClaimIds.filter((claimId) => requested.has(claimId));
    const limitations: string[] = [];

    if (supportedClaimIds.length === 0) limitations.push("No requested claim has a recorded direct evidence link.");
    if (source.provenance !== "verified") limitations.push("Source provenance is not fully verified.");
    if (source.publicationStatus === "preprint") limitations.push("This work is a preprint and has not been confirmed as peer reviewed.");
    if (source.publicationStatus === "unknown") limitations.push("Publication or correction status is unknown.");
    if (source.sponsoredOrMateriallyInterested === true) {
      limitations.push("The source has a disclosed or assessed material interest.");
    }
    if (source.sponsoredOrMateriallyInterested === "unknown") {
      limitations.push("Funding or material interests have not been established.");
    }
    if (empiricalSourceRoles.has(source.sourceRole) && source.methodIsTransparent !== true) {
      limitations.push("The method is not confirmed as transparent.");
    }
    if (!isValidTimestamp(source.retrievedAt) || !isValidTimestamp(source.publishedAt) || !isValidTimestamp(source.updatedAt)) {
      limitations.push("One or more source dates are malformed and need verification.");
    }
    const corroboration = source.independenceGroup
      ? (groupCounts.get(source.independenceGroup) ?? 0) > 1
        ? "shared-origin"
        : "no-shared-origin-identified"
      : "unknown";

    const corroborationLimitations = corroboration === "shared-origin"
      ? ["This source shares a recorded origin group with another candidate and is not independent corroboration."]
      : corroboration === "unknown"
        ? ["This source's independence from other candidates has not been established."]
        : [];
    const disposition: SourceDisposition =
      source.publicationStatus === "retracted" || supportedClaimIds.length === 0
        ? "exclude"
        : limitations.length === 0
          ? "usable"
          : "limited";

    return {
      sourceId: source.sourceId,
      disposition,
      supportedClaimIds,
      limitations,
      corroboration,
      corroborationLimitations,
    };
  });

  const usableClaimIds = new Set(
    reviews
      .filter((review) => review.disposition === "usable")
      .flatMap((review) => review.supportedClaimIds),
  );

  return {
    reviews,
    claimsWithoutUsableSupport: requestedClaimIds.filter((claimId) => !usableClaimIds.has(claimId)),
  };
}

export function validateClaimCitations({
  claims,
  citations,
  sources,
  expectedOwnerId,
}: CitationValidationInput): readonly CitationIssue[] {
  const issues: CitationIssue[] = [];
  const citationsById = new Map<string, EvidenceCitation>();
  const sourceRecords = new Map(sources.map((source) => [source.sourceId, source]));

  for (const citation of citations) {
    if (citationsById.has(citation.citationId)) {
      issues.push({ code: "duplicate-citation-id", citationId: citation.citationId });
      continue;
    }
    citationsById.set(citation.citationId, citation);

    const source = sourceRecords.get(citation.sourceId);
    if (!source) {
      issues.push({ code: "unknown-source", citationId: citation.citationId });
    } else {
      if (source.sourceVersion !== citation.sourceVersion) {
        issues.push({ code: "source-version-mismatch", citationId: citation.citationId });
      }
      if (source.sourceRole !== citation.sourceRole) {
        issues.push({ code: "source-role-mismatch", citationId: citation.citationId });
      }
    }
    if (citation.ownerId !== expectedOwnerId) {
      issues.push({ code: "wrong-owner", citationId: citation.citationId });
    }
    if (citation.sourceDeleted) issues.push({ code: "deleted-source", citationId: citation.citationId });
    if (citation.sourceChangedSinceRetrieval) issues.push({ code: "changed-source", citationId: citation.citationId });
    if (!citation.sourceVersion.trim()) {
      issues.push({ code: "invalid-source-version", citationId: citation.citationId });
    }
    if (
      !Number.isInteger(citation.excerptStart) ||
      !Number.isInteger(citation.excerptEnd) ||
      citation.excerptStart < 0 ||
      citation.excerptEnd <= citation.excerptStart
    ) {
      issues.push({ code: "invalid-excerpt-range", citationId: citation.citationId });
    } else if (citation.excerptEnd - citation.excerptStart !== citation.excerpt.length) {
      issues.push({ code: "excerpt-range-mismatch", citationId: citation.citationId });
    }

    if (citation.sourceRole === "user-provided-document") {
      if (!citation.locator?.trim()) {
        issues.push({ code: "missing-document-locator", citationId: citation.citationId });
      }
    } else if (!hasValidPublicUrl(citation.url)) {
      issues.push({ code: "invalid-source-url", citationId: citation.citationId });
    }
  }

  for (const claim of claims) {
    if (claim.kind === "sourced-fact" && claim.citationIds.length === 0) {
      issues.push({ code: "uncited-sourced-claim", claimId: claim.claimId });
    }

    for (const citationId of claim.citationIds) {
      if (!citationsById.has(citationId)) {
        issues.push({ code: "unknown-citation", claimId: claim.claimId, citationId });
      }
    }
  }

  return issues;
}
