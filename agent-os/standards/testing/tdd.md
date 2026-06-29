# Test-driven development

Every feature ships with passing tests. No exceptions. Tests are the build gate.

## Rules
- **Write the test first**, or alongside, the behavior — never after the fact "to catch up."
- **`vitest`** is the test framework (ESM/TS-native, fast).
- **A feature is not done until its tests pass.** A red build is not mergeable.
- **Test the contract, not the implementation.** For the manifest, that means: a valid
  manifest validates; a malformed one fails with a clear, specific error.
- **Use the real example as a fixture.** `examples/training-coach/capability.yaml` is the
  canonical happy-path input — test against it so the schema tracks the real target.

## Don't
- Don't add a feature with no test "for now."
- Don't assert on incidental detail (error message wording, field order) that will churn.
