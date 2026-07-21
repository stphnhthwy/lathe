import * as React from "react"
import { Plus, X } from "lucide-react"

import { DerivedBadge, LockedBadge } from "@/components/dial-badges"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  asArray,
  asDict,
  asString,
  fieldType,
  type Dict,
  type EditPath,
  type ScalarValue,
} from "@/lib/manifest"

/**
 * Behavior — the reproducible side of the dial, editable in Slice 4: the
 * schema (mapping target, not DDL), declared metrics, and the locked-compute
 * multi-select. Structural editing only — formula grammar and cross-refs are
 * validated by the engine, not the studio.
 */

interface EditProps {
  onSet: (path: EditPath, value: ScalarValue) => void
  onRemove: (path: EditPath) => void
}

export function BehaviorPanel({
  manifest,
  onSet,
  onRemove,
}: { manifest: Dict } & EditProps) {
  const schema = asDict(manifest.schema)
  const metrics = asDict(manifest.metrics)
  const locked = asArray(asDict(manifest.behavior).computed_locked).map(asString)

  // What can be locked: declared derived fields, declared metrics — plus
  // anything currently locked (so an entry pointing at nothing can be turned off).
  const derivedFields = Object.values(schema).flatMap((fields) =>
    Object.entries(asDict(fields))
      .filter(([, value]) => fieldType(value).derived !== undefined)
      .map(([field]) => field),
  )
  const candidates = [...new Set([...derivedFields, ...Object.keys(metrics), ...locked])]

  const toggleLocked = (name: string, checked: boolean) => {
    if (checked) {
      if (!locked.includes(name)) onSet(["behavior", "computed_locked", locked.length], name)
    } else {
      const index = locked.indexOf(name)
      if (index === -1) return
      // Unchecking the last entry removes the whole key — cleaner YAML than [].
      if (locked.length === 1) onRemove(["behavior", "computed_locked"])
      else onRemove(["behavior", "computed_locked", index])
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Locked compute</CardTitle>
          <CardDescription>
            Computed in code and returned frozen — the model reasons about these values, never
            re-derives them. Lockable values are the declared derived fields and metrics.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {candidates.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing lockable yet — declare a <code>derived:</code> field or a metric first.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-6">
              {candidates.map((name) => (
                <Label key={name} className="gap-2 font-mono text-sm">
                  <Checkbox
                    checked={locked.includes(name)}
                    onCheckedChange={(checked) => toggleLocked(name, checked === true)}
                  />
                  {name}
                </Label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {Object.entries(schema).map(([entity, fields]) => (
        <EntityCard
          key={entity}
          entity={entity}
          fields={asDict(fields)}
          locked={locked}
          onSet={onSet}
          onRemove={onRemove}
        />
      ))}
      <AddEntityRow
        existing={Object.keys(schema)}
        onAdd={(name) => onSet(["schema", name, "id"], "string")}
      />

      <MetricsCard metrics={metrics} locked={locked} onSet={onSet} onRemove={onRemove} />
    </div>
  )
}

// ── schema entities ──────────────────────────────────────────────────────────

function EntityCard({
  entity,
  fields,
  locked,
  onSet,
  onRemove,
}: { entity: string; fields: Dict; locked: string[] } & EditProps) {
  const names = Object.keys(fields)
  const base: EditPath = ["schema", entity]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-mono">
          {entity}
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            aria-label={`remove entity ${entity}`}
            onClick={() => onRemove(base)}
          >
            <X />
          </Button>
        </CardTitle>
        <CardDescription>
          Schema entity — the shape responses are mapped onto and reads come back as.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {names.map((field) => (
          <FieldEditor
            key={field}
            field={field}
            value={fields[field]}
            isLocked={locked.includes(field)}
            onSet={onSet}
            onRemove={() =>
              // A block map with no entries would leave a dangling key — take
              // the whole entity when its last field goes.
              names.length === 1 ? onRemove(base) : onRemove([...base, field])
            }
            path={[...base, field]}
          />
        ))}
        <AddFieldRow
          existing={names}
          onAdd={(field, type) => onSet([...base, field], type)}
        />
      </CardContent>
    </Card>
  )
}

/**
 * One schema field row. Three structural shapes, each with its dedicated
 * input: a `derived:` expression, an `enum[...]` value list, or a plain type
 * string — all validated structurally only.
 */
function FieldEditor({
  field,
  value,
  isLocked,
  path,
  onSet,
  onRemove,
}: {
  field: string
  value: unknown
  isLocked: boolean
  path: EditPath
  onSet: EditProps["onSet"]
  onRemove: () => void
}) {
  const t = fieldType(value)
  const isEnum = t.derived === undefined && /^enum\[.*\]$/.test(t.type)

  return (
    <div className="flex items-center gap-2">
      <span className="w-32 truncate font-mono text-sm">{field}</span>
      {t.derived !== undefined ? (
        <>
          <DerivedBadge />
          <Input
            className="flex-1 font-mono"
            value={t.derived}
            placeholder="duration_min * rpe"
            onChange={(e) => onSet([...path, "derived"], e.target.value)}
          />
        </>
      ) : isEnum ? (
        <>
          <Badge variant="secondary">enum</Badge>
          <Input
            className="flex-1 font-mono"
            value={t.type.slice("enum[".length, -1)}
            placeholder="a, b, c"
            onChange={(e) => onSet(path, `enum[${e.target.value}]`)}
          />
        </>
      ) : (
        <Input
          className="flex-1 font-mono"
          value={t.type}
          placeholder="string | int | datetime | enum[a, b]"
          onChange={(e) => onSet(path, e.target.value)}
        />
      )}
      {isLocked && <LockedBadge />}
      <Button variant="ghost" size="icon-sm" aria-label={`remove field ${field}`} onClick={onRemove}>
        <X />
      </Button>
    </div>
  )
}

function AddFieldRow({
  existing,
  onAdd,
}: {
  existing: string[]
  onAdd: (field: string, type: string) => void
}) {
  const [field, setField] = React.useState("")
  const [type, setType] = React.useState("")
  const valid = field.trim() !== "" && type.trim() !== "" && !existing.includes(field.trim())

  const add = () => {
    if (!valid) return
    onAdd(field.trim(), type.trim())
    setField("")
    setType("")
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        className="w-32 font-mono"
        value={field}
        placeholder="field"
        onChange={(e) => setField(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
      />
      <Input
        className="flex-1 font-mono"
        value={type}
        placeholder="string | int | datetime | enum[a, b]"
        onChange={(e) => setType(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
      />
      <Button variant="outline" size="icon-sm" aria-label="add field" disabled={!valid} onClick={add}>
        <Plus />
      </Button>
    </div>
  )
}

function AddEntityRow({
  existing,
  onAdd,
}: {
  existing: string[]
  onAdd: (name: string) => void
}) {
  const [name, setName] = React.useState("")
  const valid = name.trim() !== "" && !existing.includes(name.trim())

  const add = () => {
    if (!valid) return
    onAdd(name.trim())
    setName("")
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        className="w-64 font-mono"
        value={name}
        placeholder="new entity (starts with id: string)"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
      />
      <Button variant="outline" size="sm" disabled={!valid} onClick={add}>
        <Plus />
        Add entity
      </Button>
    </div>
  )
}

// ── metrics ──────────────────────────────────────────────────────────────────

function MetricsCard({
  metrics,
  locked,
  onSet,
  onRemove,
}: { metrics: Dict; locked: string[] } & EditProps) {
  const names = Object.keys(metrics)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Metrics</CardTitle>
        <CardDescription>
          Declared formulas over the schema — windows and ratios the formula engine computes.
          Formula text is validated by the engine, not here.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {names.map((name) => {
          const def = asDict(metrics[name])
          return (
            <div key={name} className="flex items-center gap-2">
              <span className="flex w-40 items-center gap-2 truncate font-mono text-sm">
                {name}
                {locked.includes(name) && <LockedBadge />}
              </span>
              <Input
                className="w-24 font-mono"
                value={asString(def.window)}
                placeholder="14d"
                onChange={(e) =>
                  e.target.value === ""
                    ? onRemove(["metrics", name, "window"])
                    : onSet(["metrics", name, "window"], e.target.value)
                }
              />
              <Input
                className="flex-1 font-mono"
                value={asString(def.formula)}
                placeholder="sum(session.load)"
                onChange={(e) => onSet(["metrics", name, "formula"], e.target.value)}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`remove metric ${name}`}
                onClick={() =>
                  names.length === 1 ? onRemove(["metrics"]) : onRemove(["metrics", name])
                }
              >
                <X />
              </Button>
            </div>
          )
        })}
        <AddMetricRow
          existing={names}
          onAdd={(name, formula) => onSet(["metrics", name, "formula"], formula)}
        />
      </CardContent>
    </Card>
  )
}

function AddMetricRow({
  existing,
  onAdd,
}: {
  existing: string[]
  onAdd: (name: string, formula: string) => void
}) {
  const [name, setName] = React.useState("")
  const [formula, setFormula] = React.useState("")
  const valid = name.trim() !== "" && formula.trim() !== "" && !existing.includes(name.trim())

  const add = () => {
    if (!valid) return
    onAdd(name.trim(), formula.trim())
    setName("")
    setFormula("")
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        className="w-40 font-mono"
        value={name}
        placeholder="metric"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
      />
      <Input
        className="flex-1 font-mono"
        value={formula}
        placeholder="sum(session.load)"
        onChange={(e) => setFormula(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
      />
      <Button variant="outline" size="icon-sm" aria-label="add metric" disabled={!valid} onClick={add}>
        <Plus />
      </Button>
    </div>
  )
}
