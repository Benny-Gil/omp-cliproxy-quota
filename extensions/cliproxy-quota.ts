// /quota: show CLIProxyAPI quota from the pi-bridge plugin. Reads the key from models.yml.
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const ESC = "\x1b["
const paint = (code: string, t: string) => `${ESC}${code}m${t}${ESC}0m`
const dim = (t: string) => paint("2", t)
const bold = (t: string) => paint("1", t)
const tone = (f: number) => (f >= 0.7 ? "32" : f >= 0.3 ? "33" : "31")
const bar = (f: number) => {
  const n = Math.round(f * 20)
  return paint(tone(f), "━".repeat(n)) + dim("─".repeat(20 - n))
}

function reset(ts?: string): string {
  if (!ts) return "idle"
  const t = new Date(ts)
  const mins = Math.round((t.getTime() - Date.now()) / 60000)
  if (mins <= 0) return "now"
  const left = mins >= 1440 ? `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h` : `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`
  return `in ${left}`
}

async function report(refresh: boolean): Promise<string> {
  const text = readFileSync(join(homedir(), ".omp/agent/models.yml"), "utf8")
  const base = text.match(/baseUrl:\s*(http:\/\/[\d.]+:\d+)/)?.[1]
  const key = text.match(/apiKey:\s*(\S+)/)?.[1]
  if (!base || !key) throw new Error("no cliproxy baseUrl or apiKey in models.yml")
  const res = await fetch(`${base}/v0/resource/plugins/pi-bridge/usage${refresh ? "?refresh=1" : ""}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}. Is pi-bridge enabled on the proxy?`)
  const data: any = await res.json()
  const out: string[] = [bold("CLIProxy quota"), ""]
  for (const a of data.accounts ?? []) {
    const bad = a.status !== "active"
    out.push(`${bold(String(a.provider))}  ${dim(a.account)}${bad ? "  " + paint("31", `● ${a.status}`) : ""}`)
    const groups = (a.groups ?? []).filter((g: any) => g.remainingFraction != null)
    if (!groups.length) out.push(dim("  no quota windows"))
    for (const g of groups) {
      const f = g.remainingFraction as number
      const pct = paint(tone(f), `${Math.round(f * 100)}%`.padStart(4))
      out.push(`  ${String(g.label).padEnd(13)} ${bar(f)} ${pct}  ${dim(reset(g.resetTime))}`)
    }
    out.push("")
  }
  out.push(dim("/quota -r refreshes (cached 2 min)"))
  return out.join("\n")
}

export default function (pi: any): void {
  if (typeof pi.registerCommand !== "function") return
  pi.registerCommand("quota", {
    description: "Show CLIProxyAPI quota per account (/quota -r forces a fresh read)",
    handler: async (args: string, ctx: any) => {
      try {
        ctx.ui.notify(await report(/-r\b/.test(args ?? "")), "info")
      } catch (e: any) {
        ctx.ui.notify(`quota: ${e.message}`, "error")
      }
    },
  })
}
