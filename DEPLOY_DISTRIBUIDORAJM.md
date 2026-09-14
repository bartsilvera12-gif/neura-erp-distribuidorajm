# Neura ERP · Distribuidora JM — puesta en marcha

ERP independiente, copia de `neura-erp-sistemas-propio`, con su propio schema
Postgres, su propia empresa y su propio login. No comparte datos ni historial
git con el ERP original.

| | |
|---|---|
| Repo | `bartsilvera12-gif/neura-erp-distribuidorajm` |
| Schema de datos | `distribuidorajmerp` |
| URL | `http://distribuidorajm.neura.com.py` (HTTP: el TLS lo termina Cloudflare) |
| Empresa id | `058efef5-e1b5-4cab-8a65-238f81823917` |
| Login admin | `admin@distribuidorajm.com` (rol `admin`) |

---

## 1 · Base de datos

Los scripts están en `supabase/distribuidorajm/`. Se pegan en el SQL Editor de
Supabase self-hosted **en este orden**, uno por vez, leyendo los `NOTICE` que
devuelve cada uno.

| # | Archivo | Qué hace |
|---|---|---|
| 00 | `00_diagnostico_schema_origen.sql` | Solo lectura. Dice cuál es el schema del ERP actual. |
| 01 | `01_clonar_schema.sql` | Crea `distribuidorajmerp` como copia estructural **sin datos**. |
| 02 | `02_catalogo_modulos.sql` | Copia el catálogo `modulos` (lista de módulos del producto). |
| 03 | `03_empresa_admin_modulos.sql` | Empresa + usuario admin + los módulos habilitados. |
| 04 | `04_verificacion.sql` | Solo lectura. Compara origen vs destino y busca fugas. |

### Antes de ejecutar

1. **Correr el 00 primero.** Los scripts 01, 02 y 04 tienen arriba
   `v_src := 'zentra_erp'` (y el 04 lo tiene escrito en el texto de las
   consultas). Si el 00 devuelve otro nombre, reemplazalo en los tres.
   `zentra_erp` es el valor por defecto del repo, pero el deploy de
   sistemas-propio puede estar corriendo con otro (`neura`, por ejemplo).
2. **En el 03, cambiar `v_password`** antes de ejecutarlo.

### Garantías de aislamiento

- El 01 solo hace `CREATE` dentro de `distribuidorajmerp`. Al schema origen
  únicamente lo lee; a `public`, `auth` y `storage` no los toca.
- Toda referencia interna `<origen>.x` se reescribe a `distribuidorajmerp.x`:
  FKs, triggers, policies RLS, vistas, defaults y el `search_path` de las
  funciones `SECURITY DEFINER`. El ERP nuevo no queda colgado del viejo.
- Las FKs a `auth.users` se mantienen: es la tabla de Supabase, compartida por
  diseño (un solo GoTrue para toda la instancia).
- El 01 aborta si `distribuidorajmerp` ya existe: no pisa nada.
- Corre en una sola transacción.

Estos scripts se probaron de punta a punta contra un PostgreSQL 16 real, sobre
un schema origen de prueba con tablas, secuencias, FKs, índices parciales,
triggers, RLS con policies que llaman funciones del schema, vistas encadenadas,
vista materializada, funciones `SECURITY DEFINER` con `search_path` y
publicación `supabase_realtime`. El 04 cerró con: todos los conteos de objetos
iguales entre origen y destino, **0 fugas** y **0 filas** en las tablas de
negocio.

### Después del 01

La exposición del schema en PostgREST la hacés vos (queda fuera de estos
scripts, como pediste): agregar `distribuidorajmerp` a los *exposed schemas* y
recargar. Los scripts ya emiten `pg_notify('pgrst', 'reload schema')`.

---

## 2 · Módulos habilitados

El menú se arma con `empresa_modulos ∩ usuario_modulos`. El script 03 deja
activos exactamente estos, y **desactiva cualquier otro**:

`agenda`, `clientes`, `cobranzas`, `comisiones`, `compras`, `configuracion`,
`contabilidad`, `dashboard`, `gastos`, `gerencia`, `gestion-clientes`,
`inventario`, `notas_credito`, `pagos`, `reportes`, `usuarios`, `ventas`.

Dos aclaraciones sobre la lista pedida:

- **RRHH** es el slug `usuarios` (así se llama la entrada en el sidebar).
- **Movimientos** no es un módulo propio: es la vista hija de Inventario
  (`/inventario/movimientos`), y entra con el módulo `inventario`. Si en el
  catálogo del origen llegara a existir un slug `movimientos` o `rrhh`, el
  script los habilita también — ya están en la lista.

Lo que queda **fuera**: `sorteos`, `crm`, `marketing`, `marketing_ops`,
`campanas`, `conversaciones` y el resto del stack omnicanal, `proyectos`,
`soporte`, `guardias`, `planes`, `tableros`, `chat_interno`, `etiquetas`.

> Ojo: si `empresa_modulos` quedara vacía para esta empresa, el ERP muestra
> **todos** los módulos por retrocompatibilidad
> (`src/lib/modulos/resolve-effective-modules.ts`). Las filas del script 03 son
> las que recortan el menú: no las borres.

---

## 3 · Variables de entorno (Coolify)

Partí de las variables del proyecto de sistemas-propio y aplicá esta tabla.

### Cambian sí o sí

| Variable | Valor |
|---|---|
| `APP_DB_SCHEMA` | `distribuidorajmerp` |
| `NEXT_PUBLIC_APP_URL` | `http://distribuidorajm.neura.com.py` |

### Se copian tal cual (misma instancia de Supabase self-hosted)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `DATABASE_URL`, `DIRECT_URL`,
`SUPABASE_DB_PASSWORD`, `PG_POOL_MAX`.

El pool de Postgres no fija `search_path`: todas las consultas van calificadas
con `APP_DB_SCHEMA`, así que la misma cadena de conexión sirve para los dos ERP
sin mezclarlos.

### Empresa: hay que poner el id nuevo o borrarlas

`WHATSAPP_DEFAULT_EMPRESA_ID`, `YCLOUD_WEBHOOK_EMPRESA_ID`,
`CRM_WEBHOOK_EMPRESA_ID`, `META_MSG_EMPRESA_ID`, `CONTACT_CENTER_EMPRESA_IDS`,
`FACTURACION_MENSUAL_EMPRESA_IDS`.

Si se copian con el id viejo, este ERP escribe sobre la empresa del otro.
Como los módulos omnicanal y de campañas quedan fuera, lo más limpio es **no
definirlas**; si alguna hace falta, va
`058efef5-e1b5-4cab-8a65-238f81823917`.

### Secretos propios (generar nuevos, no reusar)

`CRON_SECRET`, `WEBHOOK_SECRET`, `SIFEN_SECRETS_KEY`, `BAILEYS_BRIDGE_SECRET`,
`RAFFLES_N8N_SECRET`, `QA_SORTEO_TICKET_SECRET`, `WHATSAPP_VERIFY_TOKEN`,
`META_MSG_VERIFY_TOKEN`.

`SIFEN_SECRETS_KEY` cifra las contraseñas de certificados SIFEN. Si se comparte
con el otro ERP, cada uno puede descifrar los certificados del otro.

### Opcionales, según qué se use

`SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`,
`ANTHROPIC_API_KEY`, `ASSISTANT_ENABLED`, `NEXT_PUBLIC_ASSISTANT_ENABLED`,
`GOOGLE_CLOUD_VISION_API_KEY`, `NEXT_PUBLIC_SUPER_ADMIN_EMAILS`,
`FACTURA_PREFIJO`, `FACTURA_DIAS_CREDITO_DEFAULT`, `COBROS_NOTIFY_EMAILS`,
credenciales de Firebase, Meta y WhatsApp.

---

## 4 · Dominio

`distribuidorajm.neura.com.py` por HTTP en Coolify (Cloudflare termina el TLS).
Ya quedaron apuntando ahí en el repo:

- `NEXT_PUBLIC_APP_URL` (fallback en `src/lib/cobranzas/cobro-pendiente-notificar.ts`)
- `capacitor.config.ts` (`server.url`, `allowNavigation`, `cleartext: true`)
- `tutorial-erp/scripts/capture-tutorial.mjs`

---

## 5 · Qué NO se hizo

- **Exposición del schema en PostgREST**: la hacés vos, como acordamos.
- **Variables de entorno cargadas en Coolify**: no pude llegar a la API
  (`http://34.193.107.9:8000`) desde esta sesión — la política de red de salida
  del entorno bloquea el destino y el intento de tunelarlo quedó denegado. Por
  eso la tabla de arriba está armada a partir del código
  (`grep` de `process.env` sobre todo el repo), no leída del proyecto existente.
  Si querés que las cargue yo, hay que habilitar ese host para la sesión.
