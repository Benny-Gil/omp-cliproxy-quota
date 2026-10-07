// /quota: a dashboard panel for CLIProxyAPI quota, read from the pi-bridge plugin.
// The key and the proxy address come from models.yml.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(";");
const fg = (hex: string, t: string) => `\x1b[38;2;${rgb(hex)}m${t}\x1b[39m`;
const bg = (hex: string, t: string) => `\x1b[48;2;${rgb(hex)}m${t}\x1b[49m`;
const bold = (t: string) => `\x1b[1m${t}\x1b[22m`;
const ANSI = /\x1b\[[0-9;]*m/g;
const vis = (t: string) => t.replace(ANSI, "").length;
const pad = (t: string, w: number) => t + " ".repeat(Math.max(0, w - vis(t)));
const right = (t: string, w: number) => " ".repeat(Math.max(0, w - vis(t))) + t;

const C = {
  ok: "#57ab5a",
  warn: "#e0a935",
  bad: "#e5534b",
  dim: "#6e7681",
  text: "#c9d1d9",
  track: "#4a525c",
  frame: "#444c56",
  title: "#f0f6fc",
};
const BRAND: Record<string, [string, string]> = {
  claude: ["#d97757", "Claude"],
  codex: ["#3fb68b", "Codex"],
  antigravity: ["#5b8def", "Gemini"],
};
const tone = (f: number) => (f >= 0.7 ? C.ok : f >= 0.3 ? C.warn : C.bad);

function reset(ts?: string): string {
  if (!ts) return "idle";
  const mins = Math.round((new Date(ts).getTime() - Date.now()) / 60000);
  if (mins <= 0) return "now";
  if (mins >= 1440)
    return `in ${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`;
  return `in ${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

async function load(refresh: boolean): Promise<any> {
  const text = readFileSync(join(homedir(), ".omp/agent/models.yml"), "utf8");
  const base = text.match(/baseUrl:\s*(http:\/\/[\d.]+:\d+)/)?.[1];
  const key = text.match(/apiKey:\s*(\S+)/)?.[1];
  if (!base || !key)
    throw new Error("no cliproxy baseUrl or apiKey in models.yml");
  const res = await fetch(
    `${base}/v0/resource/plugins/pi-bridge/usage${refresh ? "?refresh=1" : ""}`,
    {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!res.ok)
    throw new Error(`HTTP ${res.status}. Is pi-bridge enabled on the proxy?`);
  return res.json();
}

// One block of rows for each proxy account.
function body(data: any, inner: number): string[] {
  const out: string[] = [];
  const order = Object.keys(BRAND);
  const accounts = [...(data.accounts ?? [])].sort(
    (x: any, y: any) => order.indexOf(x.provider) - order.indexOf(y.provider),
  );
  const LABEL = 15;
  const RESET = 11;
  const bar = Math.max(8, Math.min(30, inner - LABEL - RESET - 12));
  accounts.forEach((a: any, n: number) => {
    const [color, name] = BRAND[a.provider] ?? [C.text, String(a.provider)];
    const groups = (a.groups ?? []).filter(
      (g: any) => g.remainingFraction != null,
    );
    const worst = groups.length
      ? Math.min(...groups.map((g: any) => g.remainingFraction))
      : 1;
    const chip =
      worst <= 0
        ? bg(C.bad, fg("#ffffff", bold(" USED UP ")))
        : worst < 0.3
          ? bg(C.warn, fg("#1b1f23", bold(" LOW ")))
          : bg(C.ok, fg("#0b1f10", bold(" READY ")));
    const dot = fg(a.status === "active" ? C.ok : C.bad, "●");
    const head = `${dot} ${fg(color, bold(name))}  ${fg(C.dim, a.account)}`;
    out.push(pad(head, inner - vis(chip)) + chip);
    if (!groups.length) out.push(fg(C.dim, "  no quota windows"));
    for (const g of groups) {
      const f = g.remainingFraction as number;
      const filled = Math.round(f * bar);
      const meter =
        fg(tone(f), "━".repeat(filled)) + fg(C.track, "─".repeat(bar - filled));
      const pct = fg(tone(f), bold(right(`${Math.round(f * 100)}%`, 4)));
      out.push(
        `  ${pad(fg(C.text, String(g.label)), LABEL)}${meter} ${pct}  ${fg(C.dim, right(reset(g.resetTime), RESET))}`,
      );
    }
    if (n < accounts.length - 1) out.push("");
  });
  return out;
}

function frame(
  data: any | null,
  error: string | null,
  width: number,
  updated: string,
): string[] {
  const w = Math.max(40, Math.min(width, 84));
  const inner = w - 4;
  const edge = (t: string) => fg(C.frame, t);
  const row = (t: string) => `${edge("│")} ${pad(t, inner)} ${edge("│")}`;
  const title = ` ${fg(C.title, bold("CLIProxy quota"))} `;
  const stamp = ` ${fg(C.dim, `updated ${updated}`)} `;
  const fill = w - 2 - vis(title) - vis(stamp) - 2;
  const lines = [
    edge("╭─") +
      title +
      edge("─".repeat(Math.max(1, fill))) +
      stamp +
      edge("─╮"),
    row(""),
  ];
  if (error) lines.push(row(fg(C.bad, `quota: ${error}`)));
  else if (!data) lines.push(row(fg(C.dim, "loading…")));
  else for (const l of body(data, inner)) lines.push(row(l));
  lines.push(row(""));
  lines.push(row(fg(C.dim, "r refresh   esc close")));
  lines.push(edge("╰" + "─".repeat(w - 2) + "╯"));
  return lines;
}

const clock = () =>
  new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

function plain(data: any): string {
  return (data.accounts ?? [])
    .map((a: any) => {
      const rows = (a.groups ?? []).map(
        (g: any) =>
          `  ${g.label}: ${Math.round(g.remainingFraction * 100)}% left, resets ${reset(g.resetTime)}`,
      );
      return [
        `${a.provider}  ${a.account}${a.status === "active" ? "" : `  [${a.status}]`}`,
        ...rows,
      ].join("\n");
    })
    .join("\n");
}

export default function (pi: any): void {
  if (typeof pi.registerCommand !== "function") return;
  pi.registerCommand("quota", {
    description:
      "Show CLIProxyAPI quota as a dashboard (r refreshes inside the panel)",
    handler: async (args: string, ctx: any) => {
      let data: any = null;
      let error: string | null = null;
      try {
        data = await load(/-r\b/.test(args ?? ""));
      } catch (e: any) {
        error = e.message;
      }
      if (ctx.mode !== "tui" || typeof ctx.ui.custom !== "function") {
        ctx.ui.notify(
          error ? `quota: ${error}` : plain(data),
          error ? "error" : "info",
        );
        return;
      }
      let updated = clock();
      await ctx.ui.custom(
        (tui: any, _theme: any, _kb: any, done: (r?: unknown) => void) => ({
          render: (width: number) => frame(data, error, width, updated),
          invalidate() {},
          handleInput(key: string) {
            if (key === "\x1b" || key === "q" || key === "\r" || key === "\x03")
              return done(undefined);
            if (key === "r") {
              error = null;
              load(true)
                .then((d) => ((data = d), (updated = clock())))
                .catch((e) => (error = e.message))
                .finally(() => tui.requestRender());
            }
          },
        }),
      );
    },
  });
}
