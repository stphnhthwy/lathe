import { Lock } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { asArray, asDict, asString, fieldType, type Dict } from "@/lib/manifest"

/**
 * Behavior — the reproducible side of the dial: the schema (mapping target,
 * not DDL), declared metrics, and which values are computed locked (in code,
 * returned frozen — the model never recomputes them).
 */
export function BehaviorPanel({ manifest }: { manifest: Dict }) {
  const schema = asDict(manifest.schema)
  const metrics = asDict(manifest.metrics)
  const locked = asArray(asDict(manifest.behavior).computed_locked).map(asString)

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Locked compute</CardTitle>
          <CardDescription>
            Computed in code and returned frozen — the model reasons about these values, never
            re-derives them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {locked.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing locked — <code>behavior.computed_locked</code> is empty.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {locked.map((name) => (
                <Badge key={name} className="font-mono">
                  <Lock /> {name}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {Object.entries(schema).map(([entity, fields]) => (
        <Card key={entity}>
          <CardHeader>
            <CardTitle className="font-mono">{entity}</CardTitle>
            <CardDescription>
              Schema entity — the shape responses are mapped onto and reads come back as.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Field</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(asDict(fields)).map(([field, value]) => {
                  const t = fieldType(value)
                  return (
                    <TableRow key={field}>
                      <TableCell className="font-mono">{field}</TableCell>
                      <TableCell>
                        {t.derived !== undefined ? (
                          <span className="flex items-center gap-2">
                            <Badge variant="secondary">derived</Badge>
                            <code className="font-mono text-sm">{t.derived}</code>
                            {locked.includes(field) && <LockedBadge />}
                          </span>
                        ) : (
                          <span className="font-mono text-sm">{t.type}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Metrics</CardTitle>
          <CardDescription>
            Declared formulas over the schema — windows and ratios the formula engine computes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(metrics).length === 0 ? (
            <p className="text-muted-foreground text-sm">No metrics declared.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Metric</TableHead>
                  <TableHead className="w-24">Window</TableHead>
                  <TableHead>Formula</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(metrics).map(([name, def]) => {
                  const dict = asDict(def)
                  return (
                    <TableRow key={name}>
                      <TableCell className="font-mono">
                        <span className="flex items-center gap-2">
                          {name}
                          {locked.includes(name) && <LockedBadge />}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono">{asString(dict.window)}</TableCell>
                      <TableCell className="font-mono">{asString(dict.formula)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function LockedBadge() {
  return (
    <Badge>
      <Lock /> locked
    </Badge>
  )
}
