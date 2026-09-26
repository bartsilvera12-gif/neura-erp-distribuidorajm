import { NextResponse } from "next/server";

function hostnameFromNextPublicSupabaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

/**
 * GET /api/deploy-info
 * Build en Vercel: comparar `commit` con GitHub (ej. 2240452).
 */
export async function GET() {
  const sha =
    process.env.NEXT_PUBLIC_BUILD_SHA?.trim() ||
    process.env.SOURCE_COMMIT?.trim() ||
    process.env.COOLIFY_GIT_COMMIT_SHA?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.VERCEL_GIT_COMMIT_REF?.trim() ||
    null;
  const vercelEnv = process.env.VERCEL_ENV ?? null;

  return NextResponse.json({
    /** Alias pedido para depuración (mismo valor que git_commit_sha en Vercel). */
    commit: sha,
    /** Alias pedido: production | preview | development | null si no es Vercel. */
    env: vercelEnv,
    git_commit_sha: sha,
    /** Cuándo se construyó este build (no cuándo se levantó el contenedor). */
    build_time: process.env.NEXT_PUBLIC_BUILD_TIME ?? null,
    /**
     * Nombre de lo último que entró. Se compara de un vistazo contra lo que se
     * espera, sin tener que leer un hash.
     */
    /*
     * CAMBIAR ESTE VALOR EN CADA PUSH QUE HAYA QUE PROBAR. Si no se cambia, dos
     * versiones distintas dicen lo mismo y el campo no sirve para lo único que
     * existe: saber si lo último que se subió ya está corriendo.
     */
    incluye: "caja-rediseno-modales",
    vercel_env: vercelEnv,
    supabase_api_hostname: hostnameFromNextPublicSupabaseUrl(),
    neura_auth_bundle: "api-auth-context-v2-rls",
  });
}
