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
import { asArray, asString, type Dict } from "@/lib/manifest"

/**
 * Skill — the capability's identity and its judgment-side inputs: the SKILL.md
 * pointer and the static references the model reads.
 */
export function SkillPanel({ manifest }: { manifest: Dict }) {
  const references = asArray(manifest.references)
  const emit = asArray(manifest.emit)

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          {typeof manifest.summary === "string" && (
            <CardDescription>{manifest.summary}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="text-muted-foreground w-40">capability</TableCell>
                <TableCell className="font-mono">{asString(manifest.capability)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">version</TableCell>
                <TableCell className="font-mono">{asString(manifest.version)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">skill</TableCell>
                <TableCell className="font-mono">
                  {asString(manifest.skill) || "(default ./SKILL.md)"}
                </TableCell>
              </TableRow>
              {emit.length > 0 && (
                <TableRow>
                  <TableCell className="text-muted-foreground">emit</TableCell>
                  <TableCell>
                    <div className="flex gap-1.5">
                      {emit.map((target, i) => (
                        <Badge key={i} variant="secondary">
                          {asString(target)}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>References</CardTitle>
          <CardDescription>
            Static knowledge bundled with the skill — the model reads these; they are never
            called. The judgment side of the dial.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {references.length === 0 ? (
            <p className="text-muted-foreground text-sm">No references declared.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Path</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {references.map((ref, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono">{asString(ref)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
