# omp-cliproxy-quota

See the quota of every CLIProxyAPI account without leaving [omp](https://github.com/can1357/oh-my-pi).
Type `/quota` in omp. The extension shows one coloured bar for each quota window.

```
CLIProxy quota

claude  a***@example.com  ● error
  5h Session    ────────────────────   0%  in 2h 03m
  7d Weekly     ────────────────────   0%  in 1d 10h

codex  b***@example.com
  5h Window     ━━━━━━━━━━━━━━━━━━━━ 100%  in 4h 31m
  7d Window     ━━━━━━━━━━━━━━━━━━━━ 100%  in 6d 23h

antigravity  c***@example.com
  Pro Models    ━━━━━━━━━━━━━━━━────  83%  in 2h 19m
  Flash Models  ━━━━━━━━━━━━━━━━────  83%  in 2h 19m
```

Green means 70% or more is left. Yellow means 30% to 69%. Red means less than 30%.

## Why this exists

`omp usage` shows limits only for accounts that you add with `/login`.
A CLIProxyAPI model uses an API key, so omp has no account to ask.
The real accounts live on the proxy. This extension reads them from the proxy.

## Requirements

| Item | Version |
|---|---|
| omp | 18.6 or later |
| CLIProxyAPI | with the `pi-bridge` plugin enabled |
| A proxy provider in `models.yml` | `baseUrl` and `apiKey` set |

The [pi-bridge plugin](https://github.com/abix5/pi-cliproxyapi-bridge) adds the quota route to the proxy.
It uses your normal API key. It needs no management key.

## Install

```sh
git clone git@github.com:Benny-Gil/omp-cliproxy-quota.git
cd omp-cliproxy-quota
./install.sh
```

The script copies `extensions/cliproxy-quota.ts` to `~/.omp/agent/extensions/`.
Omp loads every file in that folder at start.
Start a new omp session after the install.

Add `--with-cli` to also install `cliquota`, a terminal command with the same output:

```sh
./install.sh --with-cli
```

## Use

| Command | Result |
|---|---|
| `/quota` | Shows the quota. The bridge returns data that is up to two minutes old. |
| `/quota -r` | Asks the bridge for a fresh read. |
| `cliquota` | Same output in a plain terminal. |
| `cliquota -r` | Same fresh read in a plain terminal. |

## How it works

1. The extension reads `baseUrl` and `apiKey` from `~/.omp/agent/models.yml`.
2. It sends `GET /v0/resource/plugins/pi-bridge/usage` with your API key.
3. It draws one bar for each quota window and shows when the window resets.

The extension stores no key. It does not write any file.
It sends the key only to the proxy address in your own `models.yml`.

The extension takes the first `baseUrl` and the first `apiKey` that it finds in `models.yml`.
Put your proxy provider first in the file, or all your proxy providers must share one key.

## Check the bridge

Run this command. Replace the two values.

```sh
curl -H "Authorization: Bearer <api-key>" \
  http://<proxy-host>:8317/v0/resource/plugins/pi-bridge/capabilities
```

A working bridge returns JSON with `"plugin":"pi-bridge"`.

## Troubleshooting

| Message | Cause | Action |
|---|---|---|
| `quota: HTTP 404. Is pi-bridge enabled on the proxy?` | The plugin is not installed. | Install `pi-bridge` on the proxy. |
| `quota: HTTP 401` | The key is not valid for the proxy. | Check `apiKey` in `models.yml`. |
| `quota: no cliproxy baseUrl or apiKey in models.yml` | The extension cannot find the proxy. | Add a provider with `baseUrl` and `apiKey`. |
| `/quota` does not exist | Omp did not load the extension. | Start a new omp session. Check the file in `~/.omp/agent/extensions/`. |
| Raw `[32m` codes appear | Your terminal does not show colours in `notify`. | Open an issue. A plain mode is a small change. |
| A Claude account shows `● error` | The account has no quota left, or the proxy cannot use it. | Wait for the reset time, or check the account on the proxy. |

## Security

- The bridge masks account emails before it sends them.
- The bridge is a native plugin that runs inside the proxy process. Read its source before you load it.
- `allow_all_api_keys: true` lets every key holder read the masked quota. Set it to match your trust level.

## Layout

```
extensions/cliproxy-quota.ts   the /quota command for omp
cliquota                       the same report as a terminal command
install.sh                     copies the files into place
```

## Status

This is a private tool for personal use. It has no licence and no tests.
The extension API of omp is not stable, so a new omp release can break it.
