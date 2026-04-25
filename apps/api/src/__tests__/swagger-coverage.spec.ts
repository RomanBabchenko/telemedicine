import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CONTROLLERS_ROOT = join(__dirname, '..', 'modules');
const HTTP_METHOD_RE = /^\s*@(Get|Post|Put|Patch|Delete|All)\s*\(/;
const DECORATOR_RE = /^\s*@(\w+)/;
const AUTH_DECORATOR_RE = /^\s*(ApiBearerAuth|ApiAuth|ApiSecurity)/;

const findControllers = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const stat = statSync(p);
    if (stat.isDirectory()) out.push(...findControllers(p));
    else if (stat.isFile() && p.endsWith('.controller.ts')) out.push(p);
  }
  return out;
};

interface EndpointCheck {
  controller: string;
  method: string;
  httpDecorator: string;
  hasApiOperation: boolean;
  hasApiAuth: boolean;
  hasPublic: boolean;
  hasApiExcluded: boolean;
  hasUseGuards: boolean;
}

/**
 * Walk a controller file top-down. Decorators (`@Something(...)`) accumulate
 * into a stack; when we reach a method signature line we flush the stack into
 * an endpoint record. Continuation lines of multi-line decorators (e.g.
 * `@ApiOperation({ summary: '...', })` across 5 lines) are ignored — only the
 * method signature flushes, so the stack survives through them naturally.
 */
const extractEndpoints = (source: string, path: string): EndpointCheck[] => {
  const lines = source.split(/\r?\n/);
  const endpoints: EndpointCheck[] = [];
  let pendingDecorators: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (DECORATOR_RE.test(line)) {
      pendingDecorators.push(line);
      continue;
    }
    const isMethodSig = /^\s{2,}(?:async\s+)?[a-zA-Z_][\w$]*\s*\(/.test(line);
    const isConstructor = /^\s{2,}constructor\s*\(/.test(line);
    if (isMethodSig && !isConstructor && pendingDecorators.length > 0) {
      const http = pendingDecorators.find((d) => HTTP_METHOD_RE.test(d));
      if (http) {
        const name = (line.match(/^\s*(?:async\s+)?([a-zA-Z_][\w$]*)/) ?? [])[1] ?? '<unknown>';
        const stackText = pendingDecorators.join('\n');
        endpoints.push({
          controller: path,
          method: name,
          httpDecorator: http.trim(),
          hasApiOperation: /@ApiOperation\s*\(/.test(stackText),
          hasApiAuth: pendingDecorators.some((d) => AUTH_DECORATOR_RE.test(d)),
          hasPublic: /@Public\s*\(/.test(stackText),
          hasApiExcluded: /@ApiExcludeEndpoint\s*\(/.test(stackText),
          hasUseGuards: /@UseGuards\s*\(/.test(stackText),
        });
      }
      pendingDecorators = [];
    }
  }

  return endpoints;
};

// Class-level decorators that apply to every method in the controller, plus
// the class-level @ApiExcludeController() escape hatch for webhook controllers.
const classLevelGrep = (source: string) => ({
  hasClassApiAuth: /^@(?:ApiAuth|ApiBearerAuth|ApiSecurity)\b/m.test(source),
  hasClassUseGuards: /^@UseGuards\b/m.test(source),
  isExcludedController: /^@ApiExcludeController\s*\(/m.test(source),
});

describe('Swagger coverage (static scan)', () => {
  const controllers = findControllers(CONTROLLERS_ROOT);

  it('finds at least one controller', () => {
    expect(controllers.length).toBeGreaterThan(0);
  });

  for (const path of controllers) {
    const source = readFileSync(path, 'utf-8');
    const endpoints = extractEndpoints(source, path);
    const rel = path.split(/[\\/]modules[\\/]/).pop() ?? path;
    const classLevel = classLevelGrep(source);

    describe(rel, () => {
      for (const ep of endpoints) {
        describe(`${ep.method} (${ep.httpDecorator})`, () => {
          it('has @ApiOperation', () => {
            if (ep.hasApiExcluded || classLevel.isExcludedController) return;
            expect(ep.hasApiOperation).toBe(true);
          });

          it('has explicit auth intent (@ApiAuth/@ApiBearerAuth, @Public, @ApiSecurity, or guards)', () => {
            if (ep.hasApiExcluded || classLevel.isExcludedController) return;
            const explicit =
              ep.hasApiAuth ||
              ep.hasPublic ||
              classLevel.hasClassApiAuth ||
              ep.hasUseGuards ||
              classLevel.hasClassUseGuards;
            expect(explicit).toBe(true);
          });
        });
      }
    });
  }
});
