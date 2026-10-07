// Feeds CLIProxyAPI quota into the built-in omp usage displays through the pi-bridge plugin.
// Each omp proxy provider reports only the proxy accounts that it serves.
const SERVES: Record<string, string> = {
  "cliproxy-claude": "claude",
  cliproxy: "codex",
  "cliproxy-gemini": "antigravity",
}

const origin = (url?: string) => (url ? url.replace(/\/v1\/?$/, "").replace(/\/+$/, "") : undefined)

function status(remaining: number): "ok" | "warning" | "exhausted" {
  return remaining <= 0 ? "exhausted" : remaining < 0.3 ? "warning" : "ok"
}

const UNIT: Record<string, number> = { h: 3.6e6, d: 8.64e7, w: 6.048e8 }

// "5h Session" and "7d Weekly" carry the window length in the label.
function windowMs(g: any): number | undefined {
  const m = /^(\d+)\s*([hdw])/i.exec(String(g.label ?? g.id))
  return m ? Number(m[1]) * UNIT[m[2].toLowerCase()] : undefined
}

// The usage view has narrow columns. "b***@edenholdingsinc.com" becomes "edenholdingsinc".
// Two accounts on one domain keep the masked name so that the rows stay distinct.
function tags(emails: string[]): Map<string, string> {
  const domain = (e: string) => String(e).split("@")[1]?.replace(/\.[a-z.]+$/i, "") ?? e
  const unique = new Set(emails.map(domain)).size === emails.length
  return new Map(emails.map((e) => [e, unique ? domain(e) : String(e).replace(/\.[a-z.]+$/i, "")]))
}

// "5h Session" becomes "5h"; "Pro Models" stays as it is.
const shortWindow = (label: string) => /^\d+\s*[hdw]\b/i.exec(label)?.[0].replace(/\s+/g, "") ?? label

function makeProvider(id: string) {
  return {
    id,
    cacheVersion: "cliproxy-usage-1",
    async fetchUsage(params: any, { fetch }: { fetch: typeof globalThis.fetch }) {
      const key = params.credential?.apiKey ?? params.credential?.key ?? params.credential?.accessToken
      const base = origin(params.baseUrl)
      if (!key || !base) return null
      const res = await fetch(`${base}/v0/resource/plugins/pi-bridge/usage`, {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (!res.ok) return null
      const data: any = await res.json()
      const limits: any[] = []
      const mine = (data.accounts ?? []).filter((a: any) => a.provider === SERVES[id])
      const tag = tags(mine.map((a: any) => a.account))
      for (const a of mine) {
        const groups = (a.groups ?? []).filter((g: any) => g.remainingFraction != null)
        groups.sort((x: any, y: any) => (windowMs(x) ?? Infinity) - (windowMs(y) ?? Infinity))
        // With several accounts, one row per account keeps the narrow view clear.
        // The row shows the window that binds: the least left, then the longest.
        const byWindow = mine.length > 1 && groups.length > 0 && groups.every((g: any) => windowMs(g))
        const rows = byWindow
          ? [groups.reduce((m: any, g: any) =>
              g.remainingFraction < m.remainingFraction || (g.remainingFraction === m.remainingFraction && windowMs(g)! > windowMs(m)!) ? g : m)]
          : groups
        for (const g of rows) {
          const remaining = g.remainingFraction as number
          const duration = windowMs(g)
          const label = byWindow ? tag.get(a.account)! : g.label
          const notes: string[] = []
          if (byWindow) {
            notes.push(groups.map((x: any) => `${shortWindow(x.label)} ${Math.round(x.remainingFraction * 100)}% left`).join(" · "))
          }
          if (a.status && a.status !== "active" && remaining > 0) notes.push(`the proxy reports this account as ${a.status}`)
          limits.push({
            id: `${a.provider}:${a.authIndex ?? a.account}:${byWindow ? "binding" : g.id}`,
            label,
            scope: { provider: id, accountId: a.account, windowId: g.id },
            window: {
              id: g.id,
              label,
              ...(duration ? { durationMs: duration } : {}),
              ...(g.resetTime ? { resetsAt: Date.parse(g.resetTime) } : {}),
            },
            amount: { unit: "percent", usedFraction: 1 - remaining, remainingFraction: remaining },
            status: status(remaining),
            ...(notes.length ? { notes } : {}),
          })
        }
      }
      return { provider: id, fetchedAt: Date.now(), limits }
    },
  }
}

export default function (pi: any): void {
  if (typeof pi.registerProvider !== "function") return
  for (const id of Object.keys(SERVES)) pi.registerProvider(id, { usage: makeProvider(id) })
}
