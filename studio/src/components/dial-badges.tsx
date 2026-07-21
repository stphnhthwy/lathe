import { CircleHelp, Lock, Sigma } from "lucide-react"

import { Badge } from "@/components/ui/badge"

/**
 * The declare/defer dial's visual vocabulary, shared by every panel so each
 * kind of value reads the same wherever it appears:
 *
 * - locked  — computed in code, returned frozen (`behavior.computed_locked`)
 * - derived — declared compute (`derived:` fields, metric formulas)
 * - ask     — deferred to the model/user at call time (`ask` markers)
 */

export function LockedBadge() {
  return (
    <Badge>
      <Lock /> locked
    </Badge>
  )
}

export function DerivedBadge() {
  return (
    <Badge variant="secondary">
      <Sigma /> derived
    </Badge>
  )
}

export function AskBadge({ count }: { count?: number }) {
  return (
    <Badge variant="outline">
      <CircleHelp /> ask
      {count !== undefined && count > 1 ? ` ×${count}` : ""}
    </Badge>
  )
}
