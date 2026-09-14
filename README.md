# Neura ERP · Distribuidora JM

ERP de Distribuidora JM: copia independiente de
[`neura-erp-sistemas-propio`](https://github.com/bartsilvera12-gif/neura-erp-sistemas-propio),
con su propio schema Postgres (`distribuidorajmerp`), su propia empresa y su
propio login. Mismo código, datos totalmente separados.

- **Puesta en marcha (SQL, variables de entorno, dominio):** [`DEPLOY_DISTRIBUIDORAJM.md`](DEPLOY_DISTRIBUIDORAJM.md)
- **Scripts SQL:** [`supabase/distribuidorajm/`](supabase/distribuidorajm/)
- **Documentación funcional heredada:** [`DOCUMENTACION_TECNICA.md`](DOCUMENTACION_TECNICA.md), [`docs/`](docs/)

| | |
|---|---|
| Stack | Next.js (App Router) · Supabase self-hosted · Coolify |
| Schema de datos | `distribuidorajmerp` (`APP_DB_SCHEMA`) |
| URL | `http://distribuidorajm.neura.com.py` |
| Empresa id | `058efef5-e1b5-4cab-8a65-238f81823917` |
| Admin | `admin@distribuidorajm.com` |

## Desarrollo

```bash
npm install
npm run dev     # http://localhost:3000
npm run lint
```

Requiere un `.env.local` con al menos `APP_DB_SCHEMA=distribuidorajmerp`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y
`SUPABASE_SERVICE_ROLE_KEY`. La lista completa está en el documento de
puesta en marcha.

## Módulos habilitados

Agenda · Clientes · Cobranzas · Comisiones · Compras · Configuración ·
Contabilidad · Dashboard · Gastos · Gerencia · Gestión Clientes · Inventario
(incluye Movimientos) · Notas de crédito · Pagos · Reportes · RRHH · Ventas

El menú sale de `empresa_modulos`, no del código: se amplía o se recorta desde
la base, sin tocar el repo.
