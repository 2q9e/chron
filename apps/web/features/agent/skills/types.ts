import type { UserProvidedPublicHttpsSourceURL } from "../../research/server/url-policy.ts";
import type { TrustedExternalSourceIntent } from "./source-intent.ts";

export type SkillDomain = "research" | "study" | "calendar" | "safety";

export type AgentTaskKind =
  | "explain"
  | "research"
  | "verify"
  | "compare"
  | "summarize"
  | "study"
  | "quiz"
  | "flashcards"
  | "schedule"
  | "public-discussion";

export type AgentCapability =
  | "inference.meta.authorized"
  | "research.web.discover"
  | "research.web.read"
  | "documents.user.read"
  | "calendar.read"
  | "calendar.draft.write"
  | "study.progress.read"
  | "study.progress.write";

export type FreshnessNeed = "none" | "current";

export type EvidenceDomain = "general" | "academic" | "policy" | "technical" | "public-discussion";

export interface SkillRequestSignals {
  readonly task: AgentTaskKind;
  readonly evidenceDomain: EvidenceDomain;
  /** Opaque server-issued scope derived from explicit user intent, not model output. */
  readonly externalSourceIntent: TrustedExternalSourceIntent | null;
  /** Parse only URLs explicitly supplied by the user with the user-input parser. */
  readonly userProvidedSourceUrls: readonly UserProvidedPublicHttpsSourceURL[];
  readonly asksForSources: boolean;
  readonly requiresCurrentInformation: boolean;
  readonly usesUserMaterials: boolean;
  readonly userMaterialsOnly: boolean;
  readonly explicitlyRequestsExternalVerification: boolean;
  readonly involvesHighConsequenceClaims: boolean;
  readonly disputedOrComparative: boolean;
  readonly requiresPreciseFactualClaims: boolean;
}

export interface BuiltinAgentSkill {
  readonly id: string;
  readonly version: number;
  readonly name: string;
  readonly domain: SkillDomain;
  readonly whenToUse: string;
  readonly doNotUseWhen: string;
  readonly requiredCapabilities: readonly AgentCapability[];
  readonly workflow: readonly string[];
  readonly outputRules: readonly string[];
}

export interface SelectedSkillContract {
  readonly id: string;
  readonly version: number;
}

export interface EvidencePlan {
  readonly retrieval: "required" | "not-needed" | "clarify";
  readonly externalSourceMode: "none" | "known-url" | "discovery";
  readonly clarificationReason:
    | "none"
    | "conflicting-source-scopes"
    | "invalid-source-intent"
    | "invalid-user-url"
    | "missing-user-url";
  readonly approvedUserSourceUrls: readonly string[];
  readonly useUserMaterials: boolean;
  readonly useExternalSources: boolean;
  readonly freshness: FreshnessNeed;
  readonly preferredSourceRoles: readonly SourceRole[];
  readonly reasons: readonly string[];
  readonly requiredCapabilities: readonly AgentCapability[];
  readonly missingCapabilities: readonly AgentCapability[];
}

export type SourceRole =
  | "user-provided-document"
  | "official-record"
  | "official-policy-or-standard"
  | "official-product-documentation"
  | "original-study"
  | "peer-reviewed-synthesis"
  | "government-or-institutional-data"
  | "reputable-reported-analysis"
  | "reference-work"
  | "public-discussion";

export type PublicationStatus = "published" | "preprint" | "retracted" | "unknown";

export type ProvenanceStatus = "verified" | "partial" | "unknown";

export interface ResearchSourceAssessment {
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly sourceRole: SourceRole;
  readonly provenance: ProvenanceStatus;
  readonly publicationStatus: PublicationStatus;
  readonly directlySupportsClaimIds: readonly string[];
  readonly methodIsTransparent: boolean | "not-applicable" | "unknown";
  readonly sponsoredOrMateriallyInterested: boolean | "unknown";
  readonly retrievedAt: string;
  readonly publishedAt?: string;
  readonly updatedAt?: string;
  readonly independenceGroup?: string;
}

export interface EvidenceCitation {
  readonly citationId: string;
  readonly sourceId: string;
  readonly ownerId: string;
  readonly sourceRole: SourceRole;
  readonly sourceVersion: string;
  readonly excerptStart: number;
  readonly excerptEnd: number;
  readonly excerpt: string;
  readonly locator?: string;
  readonly url?: string;
  readonly sourceDeleted: boolean;
  readonly sourceChangedSinceRetrieval: boolean;
}

export interface AnswerClaim {
  readonly claimId: string;
  readonly kind: "sourced-fact" | "inference" | "general-knowledge";
  readonly citationIds: readonly string[];
}
