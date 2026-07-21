import * as React from "react"
import { AlertTriangle, BookOpen, Database, Gauge, Wrench } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  applyEditsToJson,
  asString,
  getAtPath,
  pathKey,
  type EditPath,
  type ManifestEdit,
  type ManifestState,
  type ScalarValue,
} from "@/lib/manifest"
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
  // Pending edits in the order they happened. Order is the contract: sequence
  // indexes mean "at the state this edit saw", both here and on the server.
  const [edits, setEdits] = React.useState<ManifestEdit[]>([])
  const [envVars, setEnvVars] = React.useState<Record<string, boolean>>({})
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string | null>(null)

  const load = React.useCallback(() => {
    fetch("/api/manifest")
      .then((res) => res.json() as Promise<ManifestState>)
      .then(setState)
      .catch((err) => setFetchError(err instanceof Error ? err.message : String(err)))
    fetch("/api/env-status")
      .then((res) => res.json() as Promise<{ vars: Record<string, boolean> }>)
      .then((body) => setEnvVars(body.vars))
      .catch(() => {})
  }, [])

  React.useEffect(load, [load])

  const manifest = state?.ok ? state.manifest : null
  const draft = React.useMemo(
    () => (manifest ? applyEditsToJson(manifest, edits) : null),
    [manifest, edits],
  )

  const onSet = React.useCallback(
    (path: EditPath, value: ScalarValue) => {
      setEdits((prev) => {
        if (!manifest) return prev
        const key = pathKey(path)
        const last = prev[prev.length - 1]
        // Consecutive sets on the same path merge (keystrokes), and merging is
        // the only reordering ever allowed — anything else would change what
        // sequence indexes in later edits refer to.
        const base = last?.op === "set" && pathKey(last.path) === key ? prev.slice(0, -1) : prev
        // Typing back to the value the buffer already produces clears the edit.
        if (getAtPath(applyEditsToJson(manifest, base), path) === value) return base
        return [...base, { op: "set", path, value }]
      })
    },
    [manifest],
  )

  const onRemove = React.useCallback(
    (path: EditPath) => {
      setEdits((prev) => {
        if (!manifest) return prev
        const key = pathKey(path)
        const last = prev[prev.length - 1]
        // Removing something the last edit just added undoes that edit instead.
        if (last?.op === "set" && pathKey(last.path) === key) {
          const base = prev.slice(0, -1)
          if (getAtPath(applyEditsToJson(manifest, base), path) === undefined) return base
          return [...base, { op: "remove", path }]
        }
        // Only remove what currently exists in the draft.
        if (getAtPath(applyEditsToJson(manifest, prev), path) === undefined) return prev
        return [...prev, { op: "remove", path }]
      })
    },
    [manifest],
  )

  const dirty = edits.length

  const save = React.useCallback(async () => {
    if (!state?.ok || dirty === 0) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch("/api/manifest", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edits, baseMtimeMs: state.mtimeMs }),
      })
      const body = (await res.json()) as ManifestState & { error?: string }
      if (res.ok && body.ok) {
        setState(body)
        setEdits([])
        fetch("/api/env-status")
          .then((r) => r.json() as Promise<{ vars: Record<string, boolean> }>)
          .then((b) => setEnvVars(b.vars))
          .catch(() => {})
      } else {
        setSaveError(body.error ?? `save failed (HTTP ${res.status})`)
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [state, edits, dirty])

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

  if (!state.ok || !draft) {
    return (
      <Shell>
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Cannot open this capability</AlertTitle>
          <AlertDescription>
            <p>{!state.ok ? state.error : "no manifest loaded"}</p>
            <p>Fix the file on disk and reload — the studio needs parseable YAML to render.</p>
          </AlertDescription>
        </Alert>
      </Shell>
    )
  }

  const { issues } = state
  const name = asString(draft.capability) || "(unnamed capability)"
  const version = asString(draft.version)

  return (
    <Shell
      header={
        <>
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-semibold">{name}</h1>
            {version && <Badge variant="secondary">v{version}</Badge>}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {dirty > 0 && (
              <Badge variant="outline">
                {dirty} unsaved change{dirty === 1 ? "" : "s"}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={dirty === 0 || saving}
              onClick={() => {
                setEdits([])
                setSaveError(null)
              }}
            >
              Discard
            </Button>
            <Button size="sm" disabled={dirty === 0 || saving} onClick={save}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </>
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
      {saveError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle />
          <AlertTitle>Save failed</AlertTitle>
          <AlertDescription>
            <p>{saveError}</p>
            <Button variant="outline" size="sm" onClick={() => (setSaveError(null), load())}>
              Reload from disk
            </Button>
          </AlertDescription>
        </Alert>
      )}
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
      {panel === "sources" && (
        <SourcesPanel manifest={draft} env={envVars} onSet={onSet} onRemove={onRemove} />
      )}
      {panel === "skill" && (
        <SkillPanel
          manifest={draft}
          referenceStatus={state.referenceStatus}
          onSet={onSet}
          onRemove={onRemove}
        />
      )}
      {panel === "behavior" && <BehaviorPanel manifest={draft} onSet={onSet} onRemove={onRemove} />}
      {panel === "tools" && <ToolsPanel manifest={draft} />}
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
