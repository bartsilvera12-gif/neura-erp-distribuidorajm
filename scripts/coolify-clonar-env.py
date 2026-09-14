#!/usr/bin/env python3
"""
Copia las variables de entorno de una aplicación Coolify a otra, aplicando las
transformaciones que necesita el ERP de Distribuidora JM.

Pensado para clonar desde la app de `instemaq` (sistemas-propio) hacia la app
nueva, sin arrastrar la identidad de empresa ni los secretos del ERP original.

REGLAS (ver DEPLOY_DISTRIBUIDORAJM.md)
  · APP_DB_SCHEMA        -> distribuidorajmerp
  · NEXT_PUBLIC_APP_URL  -> http://distribuidorajm.neura.com.py
  · *EMPRESA_ID*         -> NO se copian. Con el id viejo, este ERP escribiría
                            sobre la empresa del otro.
  · secretos propios     -> se generan nuevos (SIFEN_SECRETS_KEY cifra las
                            contraseñas de certificados: compartirla dejaría a
                            cada ERP descifrar los del otro).
  · el resto             -> se copia tal cual (misma instancia de Supabase).

USO
  export COOLIFY_URL=http://34.193.107.9:8000
  export COOLIFY_TOKEN=...

  # 1) listar aplicaciones y anotar los uuid
  python3 scripts/coolify-clonar-env.py listar

  # 2) ver el plan (no escribe nada)
  python3 scripts/coolify-clonar-env.py plan --origen <uuid> --destino <uuid>

  # 3) aplicar
  python3 scripts/coolify-clonar-env.py aplicar --origen <uuid> --destino <uuid>
"""
import argparse
import json
import os
import re
import secrets
import sys
import urllib.error
import urllib.request

SCHEMA = "distribuidorajmerp"
APP_URL = "http://distribuidorajm.neura.com.py"

FIJAS = {
    "APP_DB_SCHEMA": SCHEMA,
    "NEXT_PUBLIC_APP_URL": APP_URL,
}

# Identidad de empresa: no se copia (ver regla arriba).
RE_EMPRESA = re.compile(r"EMPRESA_ID", re.I)

# Secretos que deben ser propios de este ERP.
REGENERAR = {
    "CRON_SECRET",
    "WEBHOOK_SECRET",
    "SIFEN_SECRETS_KEY",
    "BAILEYS_BRIDGE_SECRET",
    "RAFFLES_N8N_SECRET",
    "QA_SORTEO_TICKET_SECRET",
    "WHATSAPP_VERIFY_TOKEN",
    "META_MSG_VERIFY_TOKEN",
}


OPCIONES = {}  # --url / --token, si se pasaron por línea de comandos


def api(metodo, ruta, cuerpo=None):
    base = (OPCIONES.get("url") or os.environ.get("COOLIFY_URL", "")).rstrip("/")
    token = OPCIONES.get("token") or os.environ.get("COOLIFY_TOKEN", "")
    if not base or not token:
        sys.exit(
            "Falta la URL y/o el token. Pasalos como flags (no dependen de la ventana):\n"
            '  python scripts/coolify-clonar-env.py listar --url http://34.193.107.9:8000 --token "14|..."\n'
            "Alternativa: definir COOLIFY_URL y COOLIFY_TOKEN en la misma ventana."
        )
    req = urllib.request.Request(
        f"{base}/api/v1{ruta}",
        method=metodo,
        data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            crudo = r.read().decode()
            return json.loads(crudo) if crudo.strip() else None
    except urllib.error.HTTPError as e:
        detalle = e.read().decode()[:500]
        sys.exit(f"HTTP {e.code} en {metodo} {ruta}\n{detalle}")
    except urllib.error.URLError as e:
        sys.exit(f"No se pudo conectar a {base}: {e.reason}")


def envs(uuid):
    datos = api("GET", f"/applications/{uuid}/envs")
    if isinstance(datos, dict):
        datos = datos.get("data", [])
    return datos or []


def transformar(fuente):
    """Devuelve (lista de {key,value,motivo}, lista de omitidas)."""
    salida, omitidas = [], []
    vistos = set()
    for v in fuente:
        k = v.get("key")
        if not k:
            continue
        vistos.add(k)
        if RE_EMPRESA.search(k):
            omitidas.append((k, "identidad de empresa del ERP original"))
            continue
        if k in FIJAS:
            salida.append({"key": k, "value": FIJAS[k], "motivo": "valor propio de este ERP"})
        elif k in REGENERAR:
            salida.append({"key": k, "value": secrets.token_urlsafe(32), "motivo": "secreto nuevo"})
        else:
            salida.append({"key": k, "value": v.get("value", ""), "motivo": "copiada"})
    for k, val in FIJAS.items():
        if k not in vistos:
            salida.append({"key": k, "value": val, "motivo": "agregada (no estaba en el origen)"})
    return salida, omitidas


def censurar(k, v):
    secreto = any(t in k.upper() for t in ("KEY", "SECRET", "TOKEN", "PASS", "PRIVATE"))
    if secreto and v:
        return f"{v[:4]}…({len(v)} car.)"
    return v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url")
    ap.add_argument("--token")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("listar")
    for nombre in ("plan", "aplicar"):
        p = sub.add_parser(nombre)
        p.add_argument("--origen", required=True)
        p.add_argument("--destino", required=True)
    args = ap.parse_args()
    OPCIONES["url"] = args.url
    OPCIONES["token"] = args.token

    if args.cmd == "listar":
        apps = api("GET", "/applications")
        if isinstance(apps, dict):
            apps = apps.get("data", [])
        for a in apps or []:
            print(f"{a.get('uuid'):40} {a.get('name','')}  [{a.get('fqdn') or '-'}]")
        return

    fuente = envs(args.origen)
    if not fuente:
        sys.exit("El origen no devolvió variables. ¿Es el uuid correcto?")
    plan, omitidas = transformar(fuente)

    print(f"Origen: {len(fuente)} variables · Destino: {args.destino}\n")
    for e in plan:
        print(f"  {e['key']:38} = {censurar(e['key'], e['value']):42} ({e['motivo']})")
    if omitidas:
        print("\n  NO se copian:")
        for k, motivo in omitidas:
            print(f"  {k:38}   {motivo}")

    if args.cmd == "plan":
        print("\n(plan: no se escribió nada; usá `aplicar` para ejecutarlo)")
        return

    existentes = {v.get("key") for v in envs(args.destino)}
    creadas = actualizadas = 0
    for e in plan:
        cuerpo = {"key": e["key"], "value": e["value"], "is_preview": False}
        if e["key"] in existentes:
            api("PATCH", f"/applications/{args.destino}/envs", cuerpo)
            actualizadas += 1
        else:
            api("POST", f"/applications/{args.destino}/envs", cuerpo)
            creadas += 1
    print(f"\nListo: {creadas} creadas, {actualizadas} actualizadas.")
    print("Revisá en Coolify y redeployá la aplicación.")


if __name__ == "__main__":
    main()
