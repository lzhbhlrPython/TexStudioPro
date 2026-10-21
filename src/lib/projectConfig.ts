import type { ProjectConfig } from '../types';

export const defaultProjectConfig: ProjectConfig = {
  directories: {
    modules: 'sections',
    assets: 'assets',
    build: '.texpro/build',
  },
  toc: {
    enabled: true,
    depth: 2,
    numbered: true,
  },
  modules: [],
};

export function normalizeProjectConfig(input: unknown): ProjectConfig {
  const value = (input && typeof input === 'object' ? input : {}) as Partial<ProjectConfig>;
  return {
    ...(typeof value.rootFile === 'string' ? { rootFile: value.rootFile } : {}),
    directories: {
      modules: sanitizeRelative(value.directories?.modules, defaultProjectConfig.directories.modules),
      assets: sanitizeRelative(value.directories?.assets, defaultProjectConfig.directories.assets),
      build: sanitizeRelative(value.directories?.build, defaultProjectConfig.directories.build),
    },
    toc: {
      enabled: value.toc?.enabled !== false,
      depth: Math.min(4, Math.max(1, Number(value.toc?.depth) || 2)),
      numbered: value.toc?.numbered !== false,
    },
    modules: Array.isArray(value.modules)
      ? value.modules
          .filter((item) => item && typeof item.file === 'string')
          .map((item) => ({
            file: String(item.file),
            title: String(item.title || item.file.replace(/\.tex$/i, '')),
            included: item.included !== false,
          }))
      : [],
  };
}

function sanitizeRelative(value: unknown, fallback: string): string {
  const clean = String(value || '')
    .replace(/^\/+/, '')
    .replace(/\.\.(\/|$)/g, '')
    .trim();
  return clean || fallback;
}

export function moduleInputPath(file: string): string {
  return file.replace(/\\/g, '/').replace(/\.tex$/i, '');
}
