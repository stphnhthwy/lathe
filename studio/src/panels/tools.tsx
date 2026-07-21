import { AskBadge, LockedBadge } from "@/components/dial-badges"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { asArray, asDict, asString, type Dict } from "@/lib/manifest"

/**
 * Tools — VIEW-ONLY in M7. A tool is either a declared pipeline (`steps`) or
 * an atomic read/write the model chains. Editing the pipeline grammar is its
 * own future milestone. The dial badges still apply: `ask` markers and reads
 * of locked metrics are labeled with the same vocabulary as the other panels.
 */
export function ToolsPanel({ manifest }: { manifest: Dict }) {
  const tools = asArray(manifest.tools).map(asDict)
  const locked = asArray(asDict(manifest.behavior).computed_locked).map(asString)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        Tools are view-only in the studio for now — edit <code>capability.yaml</code> directly.
      </p>
      {tools.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No tools declared</CardTitle>
          </CardHeader>
        </Card>
      ) : (
        tools.map((tool, i) => <ToolCard key={i} tool={tool} locked={locked} />)
      )}
    </div>
  )
}

function ToolCard({ tool, locked }: { tool: Dict; locked: string[] }) {
  const steps = asArray(tool.steps)
  const isPipeline = steps.length > 0
  const askCount = countAsk(tool)
  const readsLocked = asArray(tool.reads).map(asString).some((r) => locked.includes(r))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 font-mono">
          {asString(tool.name) || "(unnamed)"}
          {isPipeline ? (
            <Badge variant="secondary">
              pipeline · {steps.length} step{steps.length === 1 ? "" : "s"}
            </Badge>
          ) : (
            <Badge variant="secondary">atomic</Badge>
          )}
          {tool.readonly === true && <Badge variant="outline">readonly</Badge>}
          {tool.confirm === true && <Badge variant="outline">confirm</Badge>}
          {askCount > 0 && <AskBadge count={askCount} />}
          {readsLocked && <LockedBadge />}
        </CardTitle>
        {typeof tool.description === "string" && (
          <CardDescription>{tool.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="text-sm">
        {tool.reads !== undefined && (
          <p>
            <span className="text-muted-foreground">reads </span>
            <code className="font-mono">{compact(tool.reads)}</code>
          </p>
        )}
        {tool.writes !== undefined && (
          <p>
            <span className="text-muted-foreground">writes </span>
            <code className="font-mono">{compact(tool.writes)}</code>
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/** `ask` markers in a tool's map steps — the deferred, judgment-side values. */
function countAsk(value: unknown): number {
  if (value === "ask") return 1
  if (Array.isArray(value)) return value.reduce<number>((n, v) => n + countAsk(v), 0)
  if (value !== null && typeof value === "object") {
    return Object.values(value).reduce<number>((n, v) => n + countAsk(v), 0)
  }
  return 0
}

function compact(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value)
}
