const stableContextDigest = (value: unknown): string => {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '';
  }
};

export const shouldAdvanceRuleEditorContextVersion = (options: {
  previousDigest: string;
  nextContext: unknown;
  inFlightClientToolCall: boolean;
}): { advance: boolean; digest: string } => {
  const digest = stableContextDigest(options.nextContext);
  if (options.inFlightClientToolCall || digest === options.previousDigest) {
    return { advance: false, digest };
  }
  return { advance: true, digest };
};
