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
        const worst = Math.min(...groups.map((g: any) => g.remainingFraction as number), 1)
        groups.sort((x: any, y: any) => (windowMs(x) ?? Infinity) - (windowMs(y) ?? Infinity))
        groups.forEach((g: any, i: number) => {
          const remaining = g.remainingFraction as number
          const notes: string[] = []
          const noteRow = groups.findIndex((x: any) => x.remainingFraction <= 0)
          if (a.status && a.status !== "active" && i === Math.max(noteRow, 0)) {
            notes.push(worst <= 0 ? "window used up: the proxy skips this account until it resets" : `the proxy reports this account as ${a.status}`)
          }
          const duration = windowMs(g)
          const label = mine.length > 1 ? `${shortWindow(g.label)} · ${tag.get(a.account)}` : g.label
          limits.push({
            id: `${a.provider}:${a.authIndex ?? a.account}:${g.id}`,
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
        })
      }
      return { provider: id, fetchedAt: Date.now(), limits }
    },
  }
}

export default function (pi: any): void {
  if (typeof pi.registerProvider !== "function") return
  for (const id of Object.keys(SERVES)) pi.registerProvider(id, { usage: makeProvider(id) })
}
