import path from "path";

export type ServerEnv = {
  hosted: boolean;
  production: boolean;
  demo: boolean;
  dataDir: string;
  staticDir: string;
  hostname: string;
};

export type ServerEnvResult = { ok: true; config: ServerEnv } | { ok: false; errors: string[] };

type EnvVars = Record<string, string | undefined>;

function requireAbsoluteDir(env: EnvVars, name: string): string | null {
  const value = env[name];
  if (!value) return `${name} must be set in hosted mode`;
  if (!path.isAbsolute(value))
    return `${name} must be an absolute path in hosted mode (got "${value}")`;
  return null;
}

function isWithin(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

// The production static handler serves any file under the static dir. If the data dir sits
// inside it (or vice versa) the tax data and .env become downloadable.
function overlapError(dataDir: string, staticDir: string): string | null {
  const data = path.resolve(dataDir);
  const stat = path.resolve(staticDir);
  if (isWithin(data, stat) || isWithin(stat, data)) {
    return `TAX_UI_DATA_DIR (${data}) and TAX_UI_STATIC_DIR (${stat}) must not overlap`;
  }
  return null;
}

// HM-4: a hosted server must refuse to start rather than start insecurely, so every rule is
// checked and all failures are reported together.
function hostedModeErrors(env: EnvVars): string[] {
  const errors = [
    env.NODE_ENV === "production" ? null : 'NODE_ENV must be "production" in hosted mode',
    requireAbsoluteDir(env, "TAX_UI_DATA_DIR"),
    requireAbsoluteDir(env, "TAX_UI_STATIC_DIR"),
    env.ANTHROPIC_API_KEY ? null : "ANTHROPIC_API_KEY must be set in hosted mode",
    env.DEMO_MODE === "true" ? "DEMO_MODE must not be enabled in hosted mode" : null,
    env.TAX_UI_DATA_DIR && env.TAX_UI_STATIC_DIR
      ? overlapError(env.TAX_UI_DATA_DIR, env.TAX_UI_STATIC_DIR)
      : null,
  ];
  return errors.filter((e): e is string => e !== null);
}

export function resolveServerEnv(
  env: EnvVars,
  defaults: { cwd: string; defaultStaticDir: string },
): ServerEnvResult {
  const hosted = env.TAXLENS_HOSTED === "true";
  if (hosted) {
    const errors = hostedModeErrors(env);
    if (errors.length > 0) return { ok: false, errors };
  }

  return {
    ok: true,
    config: {
      hosted,
      production: env.NODE_ENV === "production",
      demo: env.DEMO_MODE === "true",
      dataDir: env.TAX_UI_DATA_DIR || defaults.cwd,
      staticDir: env.TAX_UI_STATIC_DIR || defaults.defaultStaticDir,
      // HM-9: loopback by default so local dev doesn't expose tax data to the LAN.
      // Containers set 0.0.0.0 and rely on the host publishing only 127.0.0.1.
      hostname: env.TAXLENS_HOSTNAME || "127.0.0.1",
    },
  };
}
