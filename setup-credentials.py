#!/usr/bin/env python3
"""Store the proxy key as an omp credential for each proxy provider, so omp asks them for usage.

Reads the key from models.yml. Backs up agent.db first. Skips a provider that has a credential.
"""
import json, os, re, shutil, sqlite3, sys

AGENT = os.environ.get("PI_CODING_AGENT_DIR", os.path.expanduser("~/.omp/agent"))
PROVIDERS = ("cliproxy", "cliproxy-claude", "cliproxy-gemini")

key = re.search(r"apiKey:\s*(\S+)", open(os.path.join(AGENT, "models.yml")).read())
if not key:
    sys.exit("setup-credentials: no apiKey in models.yml")
db = os.path.join(AGENT, "agent.db")
shutil.copy2(db, db + ".pre-cliproxy-usage")
con = sqlite3.connect(db, timeout=20)
have = {r[0] for r in con.execute("select provider from auth_credentials")}
for p in PROVIDERS:
    if p in have:
        print(f"{p}: already stored")
        continue
    con.execute(
        "insert into auth_credentials(provider, credential_type, data) values (?, 'api_key', ?)",
        (p, json.dumps({"key": key.group(1)})),
    )
    print(f"{p}: stored")
con.execute("update auth_change_revision set revision = revision + 1")
con.commit()
