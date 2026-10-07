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
      for (const a of mine) {
        for (const g of a.groups ?? []) {
          if (g.remainingFraction == null) continue
          const remaining = g.remainingFraction as number
          limits.push({
            id: `${a.provider}:${a.authIndex ?? a.account}:${g.id}`,
            label: mine.length > 1 ? `${a.account} · ${g.label}` : g.label,
            scope: { provider: id, accountId: a.account, windowId: g.id },
            window: { id: g.id, label: g.label, ...(g.resetTime ? { resetsAt: Date.parse(g.resetTime) } : {}) },
            amount: { unit: "percent", usedFraction: 1 - remaining, remainingFraction: remaining },
            status: status(remaining),
            ...(a.status && a.status !== "active" ? { notes: [`proxy account status: ${a.status}`] } : {}),
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
