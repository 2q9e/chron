export type ExternalSourceIntentMode =
  | "automatic"
  | "provided-only"
  | "discover-additional";

export interface TrustedExternalSourceIntent {
  readonly mode: ExternalSourceIntentMode;
}

const issuedIntents = new WeakMap<object, ExternalSourceIntentMode>();
const acceptedModes = new Set<ExternalSourceIntentMode>([
  "automatic",
  "provided-only",
  "discover-additional",
]);

/** The caller must authenticate and bind this scope to the user's explicit choice. */
export function resolveUserExternalSourceIntent(
  value: unknown,
): TrustedExternalSourceIntent | null {
  if (typeof value !== "string" || !acceptedModes.has(value as ExternalSourceIntentMode)) {
    return null;
  }

  const intent = Object.freeze({ mode: value as ExternalSourceIntentMode });
  issuedIntents.set(intent, intent.mode);
  return intent;
}

export function readTrustedExternalSourceIntent(
  value: unknown,
): ExternalSourceIntentMode | null {
  if (typeof value !== "object" || value === null) return null;

  const issuedMode = issuedIntents.get(value);
  return issuedMode !== undefined && "mode" in value && value.mode === issuedMode
    ? issuedMode
    : null;
}
