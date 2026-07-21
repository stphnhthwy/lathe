import * as React from "react"
import { CircleCheck, CircleX, Plug, Plus, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  asDict,
  asString,
  envRefs,
  type Dict,
  type EditPath,
  type ScalarValue,
} from "@/lib/manifest"

/**
 * Sources — live data the capability CALLS, and Slice 2's editable flagship:
 * a typed form for `http` sources (base_url, auth, header rows), a generic
 * scalar form for other types, env badges from `/api/env-status`, and a
 * read-only connection check per `http` source.
 */

interface EditProps {
  onSet: (path: EditPath, value: ScalarValue) => void
  onRemove: (path: EditPath) => void
}

export function SourcesPanel({
  manifest,
  env,
  onSet,
  onRemove,
}: { manifest: Dict; env: Record<string, boolean> } & EditProps) {
  const sources = asDict(manifest.sources)
  const names = Object.keys(sources)

  if (names.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No sources declared</CardTitle>
          <CardDescription>
            Sources are the live data a capability calls — add an <code>http</code> source to{" "}
            <code>capability.yaml</code> under <code>sources:</code>.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {names.map((name) => (
        <SourceCard
          key={name}
          name={name}
          source={asDict(sources[name])}
          env={env}
          onSet={onSet}
          onRemove={onRemove}
        />
      ))}
    </div>
  )
}

function SourceCard({
  name,
  source,
  env,
  onSet,
  onRemove,
}: { name: string; source: Dict; env: Record<string, boolean> } & EditProps) {
  const type = asString(source.type)
  const base: EditPath = ["sources", name]
  const refs = envRefs(source)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-mono">
          {name}
          <Badge variant="secondary">{type || "untyped"}</Badge>
        </CardTitle>
        {refs.length > 0 && (
          <CardDescription>
            <span className="flex flex-wrap items-center gap-1.5">
              {refs.map((ref) => (
                <Badge
                  key={ref}
                  variant={env[ref] ? "outline" : "destructive"}
                  className="font-mono"
                >
                  {env[ref] ? <CircleCheck /> : <CircleX />}
                  ${"{"}
                  {ref}
                  {"}"}
                  {env[ref] ? "" : " missing"}
                </Badge>
              ))}
            </span>
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {type === "http" ? (
          <HttpForm name={name} source={source} onSet={onSet} onRemove={onRemove} />
        ) : (
          <GenericForm base={base} source={source} onSet={onSet} />
        )}
        {type === "http" && <SourceCheck name={name} />}
      </CardContent>
    </Card>
  )
}

// ── typed http form ──────────────────────────────────────────────────────────

function HttpForm({ name, source, onSet, onRemove }: { name: string; source: Dict } & EditProps) {
  const base: EditPath = ["sources", name]
  const auth = asDict(source.auth)
  const hasAuth = source.auth !== undefined
  const headers = asDict(source.headers)

  return (
    <div className="flex flex-col gap-4">
      <FieldRow label="base_url">
        <Input
          className="font-mono"
          value={asString(source.base_url)}
          placeholder="https://api.example.com/v1"
          onChange={(e) => onSet([...base, "base_url"], e.target.value)}
        />
      </FieldRow>

      <FieldRow label="auth">
        {hasAuth ? (
          <div className="flex w-full items-center gap-2">
            <Input
              className="w-32 font-mono"
              value={asString(auth.kind)}
              placeholder="bearer | oauth2"
              onChange={(e) => onSet([...base, "auth", "kind"], e.target.value)}
            />
            <Input
              className="flex-1 font-mono"
              value={asString(auth.token)}
              placeholder="${API_TOKEN}"
              onChange={(e) => onSet([...base, "auth", "token"], e.target.value)}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`remove auth from ${name}`}
              onClick={() => onRemove([...base, "auth"])}
            >
              <X />
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSet([...base, "auth", "kind"], "bearer")}
          >
            <Plus />
            Add auth
          </Button>
        )}
      </FieldRow>

      <FieldRow label="headers">
        <div className="flex w-full flex-col gap-2">
          {Object.entries(headers).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="w-32 truncate font-mono text-sm">{key}</span>
              <Input
                className="flex-1 font-mono"
                value={asString(value)}
                onChange={(e) => onSet([...base, "headers", key], e.target.value)}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`remove header ${key} from ${name}`}
                onClick={() => onRemove([...base, "headers", key])}
              >
                <X />
              </Button>
            </div>
          ))}
          <AddHeaderRow
            existing={Object.keys(headers)}
            onAdd={(key, value) => onSet([...base, "headers", key], value)}
          />
        </div>
      </FieldRow>

      <GenericForm
        base={base}
        source={source}
        onSet={onSet}
        skip={["type", "base_url", "auth", "headers"]}
      />
    </div>
  )
}

function AddHeaderRow({
  existing,
  onAdd,
}: {
  existing: string[]
  onAdd: (key: string, value: string) => void
}) {
  const [key, setKey] = React.useState("")
  const [value, setValue] = React.useState("")
  const valid = key.trim() !== "" && !existing.includes(key.trim())

  const add = () => {
    if (!valid) return
    onAdd(key.trim(), value)
    setKey("")
    setValue("")
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        className="w-32 font-mono"
        value={key}
        placeholder="header"
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
      />
      <Input
        className="flex-1 font-mono"
        value={value}
        placeholder="value or ${VAR}"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
      />
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="add header"
        disabled={!valid}
        onClick={add}
      >
        <Plus />
      </Button>
    </div>
  )
}

// ── generic key-value form (non-http types, adapter-specific extras) ─────────

function GenericForm({
  base,
  source,
  onSet,
  skip = ["type"],
}: {
  base: EditPath
  source: Dict
  onSet: (path: EditPath, value: ScalarValue) => void
  skip?: string[]
}) {
  const entries = Object.entries(source).filter(([key]) => !skip.includes(key))
  if (entries.length === 0) return null

  return (
    <div className="flex flex-col gap-4">
      {entries.map(([key, value]) =>
        value === null || typeof value !== "object" ? (
          <FieldRow key={key} label={key}>
            <Input
              className="font-mono"
              value={asString(value)}
              onChange={(e) => onSet([...base, key], coerce(e.target.value, value))}
            />
          </FieldRow>
        ) : (
          <FieldRow key={key} label={key}>
            <pre className="text-muted-foreground overflow-x-auto font-mono text-sm">
              {JSON.stringify(value)}
            </pre>
          </FieldRow>
        ),
      )}
    </div>
  )
}

/** Keep the on-disk type when the text still fits it (a number stays a number). */
function coerce(text: string, original: unknown): ScalarValue {
  if (typeof original === "number" && text.trim() !== "" && Number.isFinite(Number(text))) {
    return Number(text)
  }
  if (typeof original === "boolean" && (text === "true" || text === "false")) {
    return text === "true"
  }
  return text
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Label className="text-muted-foreground w-24 shrink-0 pt-2 font-mono text-sm">
        {label}
      </Label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

// ── connection check ─────────────────────────────────────────────────────────

interface CheckResult {
  ok: boolean
  status?: number
  error?: string
}

function SourceCheck({ name }: { name: string }) {
  const [state, setState] = React.useState<"idle" | "pending" | CheckResult>("idle")

  const run = async () => {
    setState("pending")
    try {
      const res = await fetch("/api/source-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: name }),
      })
      setState((await res.json()) as CheckResult)
    } catch (err) {
      setState({ ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" disabled={state === "pending"} onClick={run}>
          <Plug />
          {state === "pending" ? "Checking…" : "Check connection"}
        </Button>
        {typeof state === "object" &&
          (state.ok ? (
            <Badge variant="secondary">
              <CircleCheck />
              reachable{state.status !== undefined ? ` · ${state.status}` : ""}
            </Badge>
          ) : (
            <Badge variant="destructive">
              <CircleX />
              failed{state.status !== undefined ? ` · ${state.status}` : ""}
            </Badge>
          ))}
      </div>
      {typeof state === "object" && !state.ok && state.error && (
        <p className="text-destructive font-mono text-xs break-all">{state.error}</p>
      )}
      <p className="text-muted-foreground text-xs">
        Sends one read-only GET through the same http adapter the engine uses. Checks the saved
        file — save pending edits first.
      </p>
    </div>
  )
}
