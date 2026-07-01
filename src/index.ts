/**
 * Programmatic API surface for lathe — the "library" face of the package.
 * The CLI (src/cli.ts) is a thin wrapper over these.
 */
export { manifestSchema, type Manifest } from "./manifest/schema.js";
export {
  loadManifest,
  validateManifest,
  type LoadResult,
  type ManifestIssue,
} from "./manifest/load.js";
export {
  initCapability,
  type InitOptions,
  type InitResult,
} from "./scaffold/init.js";
export {
  buildServer,
  type BuildServerOptions,
  type BuildResult,
  type DeferredTool,
} from "./server/build.js";
export {
  request,
  resolveEnv,
  buildAuthHeaders,
  type HttpSource,
  type RequestOptions,
} from "./server/http.js";
export {
  executePipeline,
  type PipelineStep,
  type PipelineResult,
} from "./server/pipeline.js";
export {
  evaluateMetric,
  computeDerivedField,
  entitiesForMetrics,
  type MetricDef,
  type MetricEngine,
} from "./server/formula.js";
