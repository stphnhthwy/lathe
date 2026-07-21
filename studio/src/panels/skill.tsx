import * as React from "react"
import { CircleCheck, CircleX, Plus, X } from "lucide-react"

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
import { Textarea } from "@/components/ui/textarea"
import {
  asArray,
  asString,
  type Dict,
  type EditPath,
  type ScalarValue,
} from "@/lib/manifest"

/**
 * Skill — the capability's identity and its judgment-side inputs, editable in
 * Slice 3: identity fields, the SKILL.md pointer, the references list with
 * on-disk existence badges, and emit checkboxes.
 */

const EMIT_TARGETS = ["skill", "mcp"] as const

interface EditProps {
  onSet: (path: EditPath, value: ScalarValue) => void
  onRemove: (path: EditPath) => void
}

export function SkillPanel({
  manifest,
  referenceStatus,
  onSet,
  onRemove,
}: { manifest: Dict; referenceStatus: Record<string, boolean> } & EditProps) {
  const references = asArray(manifest.references)
  const emit = asArray(manifest.emit).map(asString)

  const toggleEmit = (target: string, checked: boolean) => {
    if (checked) {
      if (!emit.includes(target)) onSet(["emit", emit.length], target)
    } else {
      const index = emit.indexOf(target)
      if (index !== -1) onRemove(["emit", index])
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>
            What this capability is called and what it does — the fields <code>lathe build</code>{" "}
            stamps onto the emitted skill and server.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FieldRow label="capability">
            <Input
              className="font-mono"
              value={asString(manifest.capability)}
              onChange={(e) => onSet(["capability"], e.target.value)}
            />
          </FieldRow>
          <FieldRow label="version">
            <Input
              className="w-40 font-mono"
              value={asString(manifest.version)}
              placeholder="0.1.0"
              onChange={(e) => onSet(["version"], e.target.value)}
            />
          </FieldRow>
          <FieldRow label="summary">
            <Textarea
              value={asString(manifest.summary)}
              placeholder="One or two sentences on what this capability does."
              onChange={(e) => onSet(["summary"], e.target.value)}
            />
          </FieldRow>
          <FieldRow label="skill">
            <Input
              className="font-mono"
              value={asString(manifest.skill)}
              placeholder="./SKILL.md"
              onChange={(e) => onSet(["skill"], e.target.value)}
            />
          </FieldRow>
          <FieldRow label="emit">
            <div className="flex items-center gap-6 pt-2">
              {EMIT_TARGETS.map((target) => (
                <Label key={target} className="gap-2 font-mono text-sm">
                  <Checkbox
                    checked={emit.includes(target)}
                    onCheckedChange={(checked) => toggleEmit(target, checked === true)}
                  />
                  {target}
                </Label>
              ))}
            </div>
          </FieldRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>References</CardTitle>
          <CardDescription>
            Static knowledge bundled with the skill — the model reads these; they are never
            called. The judgment side of the dial. Paths are relative to{" "}
            <code>capability.yaml</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {references.map((ref, i) => (
            <ReferenceRow
              key={i}
              value={asString(ref)}
              status={referenceStatus[asString(ref)]}
              onChange={(value) => onSet(["references", i], value)}
              onRemove={() =>
                // Removing the last entry removes the whole key — cleaner YAML
                // than a dangling `references: []`.
                references.length === 1 ? onRemove(["references"]) : onRemove(["references", i])
              }
            />
          ))}
          <AddReferenceRow onAdd={(value) => onSet(["references", references.length], value)} />
        </CardContent>
      </Card>
    </div>
  )
}

function ReferenceRow({
  value,
  status,
  onChange,
  onRemove,
}: {
  value: string
  /** true/false = on-disk check of the saved file; undefined = not saved yet. */
  status: boolean | undefined
  onChange: (value: string) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Input className="flex-1 font-mono" value={value} onChange={(e) => onChange(e.target.value)} />
      {status === true && (
        <Badge variant="outline">
          <CircleCheck />
          on disk
        </Badge>
      )}
      {status === false && (
        <Badge variant="destructive">
          <CircleX />
          missing
        </Badge>
      )}
      {status === undefined && <Badge variant="ghost">unsaved</Badge>}
      <Button variant="ghost" size="icon-sm" aria-label={`remove reference ${value}`} onClick={onRemove}>
        <X />
      </Button>
    </div>
  )
}

function AddReferenceRow({ onAdd }: { onAdd: (value: string) => void }) {
  const [value, setValue] = React.useState("")
  const valid = value.trim() !== ""

  const add = () => {
    if (!valid) return
    onAdd(value.trim())
    setValue("")
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        className="flex-1 font-mono"
        value={value}
        placeholder="./methodology.pdf"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
      />
      <Button variant="outline" size="icon-sm" aria-label="add reference" disabled={!valid} onClick={add}>
        <Plus />
      </Button>
    </div>
  )
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
