# Coding standards & tooling

This project uses a small, enforced baseline rather than a large collection of style rules. The goal is predictable code that is easy to review, safe at the API boundary, and consistent with the decisions in [`docs/scope.md`](./scope.md).

## Source conventions

- Write strict TypeScript. Do not use `any`; model unknown external data with runtime narrowing and explicit types.
- Prefer pure functions, immutable data, `const`, `readonly`, and `map`/`filter`/`reduce`. Keep network, database, logging, and other side effects at the edges of a feature.
- Organize code by feature. Keep a feature's domain types, transformations, and integrations together instead of creating broad shared-layer folders.
- Use the `@/*` path alias for imports from the repository root. Keep imports at the top of the file and use type-only imports where appropriate.
- Use descriptive names and small functions. Constants that define a product or security rule belong near the code that owns the rule.
- Keep server-only provider configuration and secrets on the server. Validate required environment variables at startup and fail fast when they are missing.
- API routes validate untrusted input before calling providers or persistence. Never expose raw exceptions or provider errors to users; return a short, retryable client-safe message and log useful server-side context without secrets.
- UI changes must preserve visible focus, keyboard operation, meaningful semantics, and sufficient contrast. Put repeated colors, spacing, and UI patterns in `globals.css` or shared components rather than duplicating raw values.
- Every model is free tier. Display measured cost as `$0.0000` where cost is shown; do not invent a paid-model distinction.

## Formatting

Prettier is the source of truth for whitespace and layout. The repository uses:

- Two-space indentation
- Double-quoted strings
- Semicolons
- Trailing commas where valid
- Parentheses around arrow-function parameters
- An 88-character print width
- LF line endings

Run `npm run format` to format supported source, configuration, and documentation files. Generated output, migrations, environment files, and build directories are ignored.

## Linting and type checking

ESLint uses the Next.js Core Web Vitals and TypeScript presets already included in the project. TypeScript runs in strict mode with no emitted files.

Use these commands before sharing changes:

```text
npm run format:check
npm run lint
npm run typecheck
npm run build
```

`npm run check` combines formatting, linting, and type checking:

```text
npm run check
```

This project deliberately has no test runner or browser automation framework. Verify user-facing work manually in a running browser and verify API-only work with a real request or a lightweight HTTP client, in addition to the static checks and production build.

## Commits

Husky runs a pre-commit hook. The hook uses lint-staged to format and lint staged JavaScript and TypeScript files, format staged JSON, Markdown, and CSS files, and then runs the full TypeScript check. A commit should not bypass this hook.

The hook is installed by the `prepare` package script after dependencies are installed. If hooks are not active in a local clone, run `npm install` again before committing.

## Change workflow

1. Keep the feature decision and build checklist current in `docs/scope.md`.
2. Make the smallest change that fits the existing feature structure and conventions.
3. Run `npm run format` while editing, then run `npm run check`.
4. Run `npm run build` after the change is coherent.
5. For screens and routes, manually exercise the real flow and check keyboard focus, error states, loading states, and safe user-facing messages.
