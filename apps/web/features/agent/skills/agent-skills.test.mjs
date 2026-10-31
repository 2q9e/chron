import assert from "node:assert/strict";
import test from "node:test";
import { reviewSourceQuality, validateClaimCitations } from "./evidence.ts";
import { prepareAgentTurn } from "./prepare-turn.ts";
import { activateSkills, planEvidence, selectBuiltinSkills } from "./selection.ts";

const userOnlyRequest = {
  task: "summarize",
  evidenceDomain: "academic",
  asksForSources: false,
  requiresCurrentInformation: false,
  usesUserMaterials: true,
  userMaterialsOnly: true,
  explicitlyRequestsExternalVerification: false,
  involvesHighConsequenceClaims: false,
  disputedOrComparative: false,
  requiresPreciseFactualClaims: false,
};

function makeSource(overrides = {}) {
  return {
    sourceId: "source-a",
    sourceVersion: "2026-10-30:revision-1",
    sourceRole: "official-record",
    provenance: "verified",
    publicationStatus: "published",
    directlySupportsClaimIds: ["claim-a"],
    methodIsTransparent: "not-applicable",
    sponsoredOrMateriallyInterested: false,
    retrievedAt: "2026-10-30T12:00:00.000Z",
    independenceGroup: "origin-a",
    ...overrides,
  };
}

function makeWebCitation(overrides = {}) {
  const excerpt = "Direct support";
  return {
    citationId: "citation-a",
    sourceId: "source-a",
    ownerId: "user-a",
    sourceRole: "official-record",
    sourceVersion: "2026-10-30:revision-1",
    excerptStart: 0,
    excerptEnd: excerpt.length,
    excerpt,
    url: "https://records.example.org/item",
    sourceDeleted: false,
    sourceChangedSinceRetrieval: false,
    ...overrides,
  };
}

test("source-only document work does not trigger outside retrieval", () => {
  const plan = planEvidence(userOnlyRequest, new Set(["documents.user.read"]));
  const skills = selectBuiltinSkills(userOnlyRequest, plan);
  const activation = activateSkills(skills, new Set(["documents.user.read"]));

  assert.equal(plan.useUserMaterials, true);
  assert.equal(plan.useExternalSources, false);
  assert.equal(plan.retrieval, "required");
  assert.ok(skills.some((skill) => skill.id === "research.user-document-grounding"));
  assert.ok(skills.some((skill) => skill.id === "safety.retrieved-content-isolation"));
  assert.ok(!skills.some((skill) => skill.id === "research.safe-web-retrieval"));
  assert.ok(activation.blocked.some((item) => item.skill.id === "research.user-document-grounding"));
});

test("conflicting document-only scope and outside verification requires clarification", () => {
  const plan = planEvidence(
    {
      ...userOnlyRequest,
      task: "verify",
      explicitlyRequestsExternalVerification: true,
    },
    new Set(["documents.user.read", "research.web.read"]),
  );

  assert.equal(plan.retrieval, "clarify");
  assert.equal(plan.useExternalSources, false);
  assert.ok(plan.reasons.some((reason) => reason.includes("clarify")));
});

test("academic research routes to current, claim-aware evidence skills", () => {
  const request = {
    ...userOnlyRequest,
    task: "research",
    usesUserMaterials: false,
    userMaterialsOnly: false,
    asksForSources: true,
    requiresCurrentInformation: true,
    requiresPreciseFactualClaims: true,
    disputedOrComparative: true,
  };
  const plan = planEvidence(request, new Set(["research.web.read"]));
  const skills = selectBuiltinSkills(request, plan);
  const ids = new Set(skills.map((skill) => skill.id));

  assert.equal(plan.retrieval, "required");
  assert.deepEqual(plan.preferredSourceRoles, ["peer-reviewed-synthesis", "original-study"]);
  assert.ok(ids.has("research.scholarly-evidence"));
  assert.ok(ids.has("research.methodology-review"));
  assert.ok(ids.has("research.source-quality-assessment"));
  assert.ok(ids.has("research.independent-corroboration"));
  assert.ok(ids.has("research.conflict-synthesis"));
  assert.ok(ids.has("research.claim-citation-audit"));
  assert.ok(ids.has("research.safe-web-retrieval"));
});

test("missing web access remains visible and cannot be represented as research", () => {
  const request = { ...userOnlyRequest, task: "research", userMaterialsOnly: false, usesUserMaterials: false };
  const plan = planEvidence(request, new Set());
  const skills = selectBuiltinSkills(request, plan);
  const activation = activateSkills(skills, new Set());

  assert.deepEqual(plan.missingCapabilities, ["research.web.read"]);
  assert.ok(activation.blocked.some((item) => item.skill.id === "research.safe-web-retrieval"));
  assert.ok(plan.reasons.some((reason) => reason.includes("no source lookup may be claimed")));
});

test("Meta inference permission is required before agent instructions are prepared", () => {
  const request = {
    ...userOnlyRequest,
    task: "research",
    usesUserMaterials: false,
    userMaterialsOnly: false,
  };
  const blocked = prepareAgentTurn(request, new Set(["research.web.read"]));
  const ready = prepareAgentTurn(
    request,
    new Set(["research.web.read", "inference.meta.authorized"]),
  );

  assert.equal(blocked.status, "capability-unavailable");
  assert.ok(blocked.missingCapabilities.includes("inference.meta.authorized"));
  assert.ok(!("instructions" in blocked));
  assert.equal(ready.status, "ready");
  assert.ok(ready.instructions.includes("when the server has granted"));
  assert.ok(ready.instructions.includes("Never invent a source, quote, page, locator, or completed retrieval."));
});

test("source-scope clarification is returned before any inference instructions", () => {
  const prepared = prepareAgentTurn(
    {
      ...userOnlyRequest,
      task: "verify",
      explicitlyRequestsExternalVerification: true,
    },
    new Set([
      "documents.user.read",
      "research.web.read",
      "inference.meta.authorized",
    ]),
  );

  assert.equal(prepared.status, "clarification-required");
  assert.ok(prepared.question.includes("only the supplied material"));
  assert.ok(!("instructions" in prepared));
});

test("timeless explanation needs no source retrieval unless the request asks for it", () => {
  const plan = planEvidence(
    {
      ...userOnlyRequest,
      task: "explain",
      evidenceDomain: "general",
      usesUserMaterials: false,
      userMaterialsOnly: false,
    },
    new Set(),
  );

  assert.equal(plan.retrieval, "not-needed");
  assert.equal(plan.useExternalSources, false);
  assert.deepEqual(plan.requiredCapabilities, []);
});

test("retracted and unsupported sources are excluded; preprints and unknown methods remain limited", () => {
  const sources = [
    makeSource(),
    makeSource({
      sourceId: "source-preprint",
      sourceRole: "original-study",
      publicationStatus: "preprint",
      methodIsTransparent: "unknown",
      sponsoredOrMateriallyInterested: "unknown",
      independenceGroup: "shared-origin",
    }),
    makeSource({
      sourceId: "source-syndicated",
      sourceRole: "reputable-reported-analysis",
      methodIsTransparent: true,
      sponsoredOrMateriallyInterested: false,
      independenceGroup: "shared-origin",
    }),
    makeSource({ sourceId: "source-retracted", publicationStatus: "retracted" }),
    makeSource({ sourceId: "source-irrelevant", directlySupportsClaimIds: ["other-claim"] }),
  ];
  const report = reviewSourceQuality(sources, ["claim-a", "claim-without-evidence"]);

  assert.equal(report.reviews[0].disposition, "usable");
  assert.equal(report.reviews[1].disposition, "limited");
  assert.equal(report.reviews[1].corroboration, "shared-origin");
  assert.equal(report.reviews[2].corroboration, "shared-origin");
  assert.equal(report.reviews[3].disposition, "exclude");
  assert.equal(report.reviews[4].disposition, "exclude");
  assert.deepEqual(report.claimsWithoutUsableSupport, ["claim-without-evidence"]);
});

test("citations must resolve to the right owner, source version, role, and exact locator", () => {
  const sources = [makeSource()];
  const validCitation = makeWebCitation();
  const claims = [{ claimId: "claim-a", kind: "sourced-fact", citationIds: ["citation-a"] }];

  assert.deepEqual(
    validateClaimCitations({
      claims,
      citations: [validCitation],
      sources,
      expectedOwnerId: "user-a",
    }),
    [],
  );

  const issues = validateClaimCitations({
    claims: [
      ...claims,
      { claimId: "claim-b", kind: "sourced-fact", citationIds: ["missing-citation"] },
      { claimId: "claim-c", kind: "sourced-fact", citationIds: [] },
    ],
    citations: [
      makeWebCitation({ ownerId: "user-b" }),
      makeWebCitation({ citationId: "citation-b", sourceVersion: "stale" }),
      makeWebCitation({ citationId: "citation-c", sourceRole: "public-discussion" }),
      makeWebCitation({ citationId: "citation-d", sourceId: "deleted-from-index", sourceDeleted: true }),
      makeWebCitation({ citationId: "citation-e", sourceChangedSinceRetrieval: true }),
      makeWebCitation({ citationId: "citation-f", excerptEnd: 2 }),
    ],
    sources,
    expectedOwnerId: "user-a",
  });
  const codes = new Set(issues.map((issue) => issue.code));

  assert.ok(codes.has("wrong-owner"));
  assert.ok(codes.has("source-version-mismatch"));
  assert.ok(codes.has("source-role-mismatch"));
  assert.ok(codes.has("unknown-source"));
  assert.ok(codes.has("deleted-source"));
  assert.ok(codes.has("changed-source"));
  assert.ok(codes.has("excerpt-range-mismatch"));
  assert.ok(codes.has("unknown-citation"));
  assert.ok(codes.has("uncited-sourced-claim"));
});

test("private document citations require a document locator", () => {
  const excerpt = "Course passage";
  const citation = {
    citationId: "document-citation",
    sourceId: "document-a",
    ownerId: "user-a",
    sourceRole: "user-provided-document",
    sourceVersion: "file-sha256:version-a",
    excerptStart: 0,
    excerptEnd: excerpt.length,
    excerpt,
    sourceDeleted: false,
    sourceChangedSinceRetrieval: false,
  };
  const source = {
    sourceId: "document-a",
    sourceVersion: "file-sha256:version-a",
    sourceRole: "user-provided-document",
  };
  const claim = { claimId: "claim-a", kind: "sourced-fact", citationIds: ["document-citation"] };

  assert.deepEqual(
    validateClaimCitations({
      claims: [claim],
      citations: [citation],
      sources: [source],
      expectedOwnerId: "user-a",
    }).map((issue) => issue.code),
    ["missing-document-locator"],
  );
});
