#!/usr/bin/env node
/**
 * Copia las variables de entorno de una aplicación Coolify a otra, aplicando
 * las transformaciones que necesita el ERP de Distribuidora JM.
 *
 * Equivalente en Node de scripts/coolify-clonar-env.py (por si no hay Python).
 * Sin dependencias: usa fetch nativo (Node >= 18).
 *
 * REGLAS (ver DEPLOY_DISTRIBUIDORAJM.md)
 *   · APP_DB_SCHEMA        -> distribuidorajmerp
 *   · NEXT_PUBLIC_APP_URL  -> http://distribuidorajm.neura.com.py
 *   · *EMPRESA_ID*         -> NO se copian. Con el id viejo, este ERP
 *                             escribiría sobre la empresa del otro.
 *   · secretos propios     -> se generan nuevos (SIFEN_SECRETS_KEY cifra las
 *                             contraseñas de certificados: compartirla dejaría
 *                             a cada ERP descifrar los del otro).
 *   · el resto             -> se copia tal cual (misma instancia de Supabase).
 *
 * USO (CMD de Windows) — con flags, así no depende de la ventana:
 *   node scripts\coolify-clonar-env.mjs listar  --url http://34.193.107.9:8000 --token "14|..."
 *   node scripts\coolify-clonar-env.mjs plan    --url ... --token "..." --origen <uuid> --destino <uuid>
 *   node scripts\coolify-clonar-env.mjs aplicar --url ... --token "..." --origen <uuid> --destino <uuid>
 *
 * El token lleva comillas en CMD porque contiene un `|` (que CMD toma como pipe).
 * También se aceptan las variables COOLIFY_URL y COOLIFY_TOKEN del entorno.
 */
import { randomBytes } from "node:crypto";

const SCHEMA = "distribuidorajmerp";
const APP_URL = "http://distribuidorajm.neura.com.py";

const FIJAS = {
  APP_DB_SCHEMA: SCHEMA,
  NEXT_PUBLIC_APP_URL: APP_URL,
};

/** Identidad de empresa: no se copia. */
const RE_EMPRESA = /EMPRESA_ID/i;

/** Secretos que deben ser propios de este ERP. */
const REGENERAR = new Set([
  "CRON_SECRET",
  "WEBHOOK_SECRET",
  "SIFEN_SECRETS_KEY",
  "BAILEYS_BRIDGE_SECRET",
  "RAFFLES_N8N_SECRET",
  "QA_SORTEO_TICKET_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "META_MSG_VERIFY_TOKEN",
]);

function salir(msg) {
  console.error(msg);
  process.exit(1);
}

async function api(metodo, ruta, cuerpo) {
  const base = (arg("url") ?? process.env.COOLIFY_URL ?? "").replace(/\/+$/, "");
  const token = arg("token") ?? process.env.COOLIFY_TOKEN ?? "";
  if (!base || !token) {
    salir(
      "Falta la URL y/o el token. Pasalos como flags (no dependen de la ventana):\n" +
        '  node scripts/coolify-clonar-env.mjs listar --url http://34.193.107.9:8000 --token "14|..."\n' +
        "Las comillas del token son necesarias en CMD porque contiene un `|`.\n" +
        "Alternativa: definir COOLIFY_URL y COOLIFY_TOKEN en la misma ventana."
    );
  }

  let res;
  try {
    res = await fetch(`${base}/api/v1${ruta}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch (e) {
    salir(`No se pudo conectar a ${base}: ${e.message}`);
  }
  const texto = await res.text();
  if (!res.ok) salir(`HTTP ${res.status} en ${metodo} ${ruta}\n${texto.slice(0, 500)}`);
  return texto.trim() ? JSON.parse(texto) : null;
}

async function envs(uuid) {
  const datos = await api("GET", `/applications/${uuid}/envs`);
  return (Array.isArray(datos) ? datos : datos?.data) ?? [];
}

/** @returns {{plan: {key,value,motivo}[], omitidas: [string,string][]}} */
function transformar(fuente) {
  const plan = [];
  const omitidas = [];
  const vistos = new Set();

  for (const v of fuente) {
    const k = v?.key;
    if (!k) continue;
    vistos.add(k);
    if (RE_EMPRESA.test(k)) {
      omitidas.push([k, "identidad de empresa del ERP original"]);
    } else if (k in FIJAS) {
      plan.push({ key: k, value: FIJAS[k], motivo: "valor propio de este ERP" });
    } else if (REGENERAR.has(k)) {
      plan.push({ key: k, value: randomBytes(32).toString("base64url"), motivo: "secreto nuevo" });
    } else {
      plan.push({ key: k, value: v.value ?? "", motivo: "copiada" });
    }
  }
  for (const [k, val] of Object.entries(FIJAS)) {
    if (!vistos.has(k)) {
      plan.push({ key: k, value: val, motivo: "agregada (no estaba en el origen)" });
    }
  }
  return { plan, omitidas };
}

function censurar(k, v) {
  const secreto = ["KEY", "SECRET", "TOKEN", "PASS", "PRIVATE"].some((t) => k.toUpperCase().includes(t));
  return secreto && v ? `${v.slice(0, 4)}…(${v.length} car.)` : v;
}

function arg(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const cmd = process.argv[2];

  if (cmd === "listar") {
    const datos = await api("GET", "/applications");
    const apps = (Array.isArray(datos) ? datos : datos?.data) ?? [];
    for (const a of apps) {
      console.log(`${(a.uuid ?? "").padEnd(40)} ${a.name ?? ""}  [${a.fqdn || "-"}]`);
    }
    return;
  }

  if (cmd !== "plan" && cmd !== "aplicar") {
    salir(
      "Uso:\n" +
        "  node scripts/coolify-clonar-env.mjs listar  --url <url> --token <token>\n" +
        "  node scripts/coolify-clonar-env.mjs plan    --url <url> --token <token> --origen <uuid> --destino <uuid>\n" +
        "  node scripts/coolify-clonar-env.mjs aplicar --url <url> --token <token> --origen <uuid> --destino <uuid>\n" +
        "\n--url y --token se pueden omitir si están COOLIFY_URL y COOLIFY_TOKEN en el entorno."
    );
  }

  const origen = arg("origen");
  const destino = arg("destino");
  if (!origen || !destino) salir("Faltan --origen y/o --destino.");

  const fuente = await envs(origen);
  if (fuente.length === 0) salir("El origen no devolvió variables. ¿Es el uuid correcto?");
  const { plan, omitidas } = transformar(fuente);

  console.log(`Origen: ${fuente.length} variables · Destino: ${destino}\n`);
  for (const e of plan) {
    console.log(`  ${e.key.padEnd(38)} = ${String(censurar(e.key, e.value)).padEnd(42)} (${e.motivo})`);
  }
  if (omitidas.length > 0) {
    console.log("\n  NO se copian:");
    for (const [k, motivo] of omitidas) console.log(`  ${k.padEnd(38)}   ${motivo}`);
  }

  if (cmd === "plan") {
    console.log("\n(plan: no se escribió nada; usá `aplicar` para ejecutarlo)");
    return;
  }

  const existentes = new Set((await envs(destino)).map((v) => v.key));
  let creadas = 0;
  let actualizadas = 0;
  for (const e of plan) {
    const cuerpo = { key: e.key, value: e.value, is_preview: false };
    if (existentes.has(e.key)) {
      await api("PATCH", `/applications/${destino}/envs`, cuerpo);
      actualizadas++;
    } else {
      await api("POST", `/applications/${destino}/envs`, cuerpo);
      creadas++;
    }
  }
  console.log(`\nListo: ${creadas} creadas, ${actualizadas} actualizadas.`);
  console.log("Revisá en Coolify y redeployá la aplicación.");
}

main();
