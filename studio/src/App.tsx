import * as React from "react"
import { AlertTriangle, BookOpen, Database, Gauge, Wrench } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { asString, type ManifestState } from "@/lib/manifest"
import { BehaviorPanel } from "@/panels/behavior"
import { SkillPanel } from "@/panels/skill"
import { SourcesPanel } from "@/panels/sources"
import { ToolsPanel } from "@/panels/tools"

const PANELS = [
  { id: "sources", label: "Sources", icon: Database },
  { id: "skill", label: "Skill", icon: BookOpen },
  { id: "behavior", label: "Behavior", icon: Gauge },
  { id: "tools", label: "Tools", icon: Wrench },
] as const

type PanelId = (typeof PANELS)[number]["id"]

export default function App() {
  const [state, setState] = React.useState<ManifestState | null>(null)
  const [fetchError, setFetchError] = React.useState<string | null>(null)
  const [panel, setPanel] = React.useState<PanelId>("sources")

  React.useEffect(() => {
    fetch("/api/manifest")
      .then((res) => res.json() as Promise<ManifestState>)
      .then(setState)
      .catch((err) => setFetchError(err instanceof Error ? err.message : String(err)))
  }, [])

  if (fetchError) {
    return (
      <Shell>
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Cannot reach the studio server</AlertTitle>
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
      </Shell>
    )
  }

  if (state === null) {
    return (
      <Shell>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </Shell>
    )
  }

  if (!state.ok) {
    return (
      <Shell>
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Cannot open this capability</AlertTitle>
          <AlertDescription>
            <p>{state.error}</p>
            <p>Fix the file on disk and reload — the studio needs parseable YAML to render.</p>
          </AlertDescription>
        </Alert>
      </Shell>
    )
  }

  const { manifest, issues } = state
  const name = asString(manifest.capability) || "(unnamed capability)"
  const version = asString(manifest.version)

  return (
    <Shell
      header={
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold">{name}</h1>
          {version && <Badge variant="secondary">v{version}</Badge>}
          <Badge variant="outline">read-only</Badge>
        </div>
      }
      nav={
        <nav className="flex flex-col gap-1">
          {PANELS.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant={panel === id ? "secondary" : "ghost"}
              className="justify-start"
              onClick={() => setPanel(id)}
            >
              <Icon />
              {label}
            </Button>
          ))}
        </nav>
      }
    >
      {issues.length > 0 && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle />
          <AlertTitle>
            {issues.length} validation issue{issues.length === 1 ? "" : "s"} — same checks as{" "}
            <code>lathe check</code>
          </AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {issues.map((issue, i) => (
                <li key={i}>
                  {issue.path && <code className="font-mono">{issue.path}</code>}
                  {issue.path ? ": " : ""}
                  {issue.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {panel === "sources" && <SourcesPanel manifest={manifest} />}
      {panel === "skill" && <SkillPanel manifest={manifest} />}
      {panel === "behavior" && <BehaviorPanel manifest={manifest} />}
      {panel === "tools" && <ToolsPanel manifest={manifest} />}
    </Shell>
  )
}

function Shell({
  header,
  nav,
  children,
}: {
  header?: React.ReactNode
  nav?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center gap-4 border-b px-6">
        <span className="font-mono text-sm font-semibold tracking-tight">lathe studio</span>
        {header && <Separator orientation="vertical" className="h-6" />}
        {header}
      </header>
      <div className="flex flex-1">
        {nav && <aside className="w-48 shrink-0 border-r p-3">{nav}</aside>}
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
