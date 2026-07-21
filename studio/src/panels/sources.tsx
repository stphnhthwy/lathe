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
import { asDict, asString, envRefs, type Dict } from "@/lib/manifest"

/**
 * Sources — live data the capability CALLS. Read-only in Slice 1: the
 * declaration plus which `${VAR}` secrets it references. Env badges and the
 * connection check arrive with Slice 2.
 */
export function SourcesPanel({ manifest }: { manifest: Dict }) {
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
        <SourceCard key={name} name={name} source={asDict(sources[name])} />
      ))}
    </div>
  )
}

function SourceCard({ name, source }: { name: string; source: Dict }) {
  const type = asString(source.type)
  const auth = asDict(source.auth)
  const headers = asDict(source.headers)
  const refs = envRefs(source)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-mono">
          {name}
          <Badge variant="secondary">{type || "untyped"}</Badge>
        </CardTitle>
        {typeof source.base_url === "string" && (
          <CardDescription className="font-mono">{source.base_url}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Field</TableHead>
              <TableHead>Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.keys(auth).length > 0 && (
              <TableRow>
                <TableCell className="text-muted-foreground">auth</TableCell>
                <TableCell className="font-mono">
                  {asString(auth.kind) || "(no kind)"}
                  {typeof auth.token === "string" && (
                    <span className="text-muted-foreground"> · token {auth.token}</span>
                  )}
                </TableCell>
              </TableRow>
            )}
            {Object.entries(headers).map(([key, value]) => (
              <TableRow key={key}>
                <TableCell className="text-muted-foreground">header · {key}</TableCell>
                <TableCell className="font-mono">{asString(value)}</TableCell>
              </TableRow>
            ))}
            {extraFields(source).map(([key, value]) => (
              <TableRow key={key}>
                <TableCell className="text-muted-foreground">{key}</TableCell>
                <TableCell className="font-mono">{formatValue(value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {refs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground text-sm">Environment:</span>
            {refs.map((ref) => (
              <Badge key={ref} variant="outline" className="font-mono">
                ${"{"}
                {ref}
                {"}"}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Adapter-specific keys beyond the ones rendered above (schema is passthrough). */
function extraFields(source: Dict): [string, unknown][] {
  const known = new Set(["type", "base_url", "auth", "headers"])
  return Object.entries(source).filter(([key]) => !known.has(key))
}

function formatValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value)
}
