# Contributing

Thank you for contributing to Intune Documentation.

## Development setup

```sh
npm install
cp .env.example .env
npm run dev
```

## Quality gates

Run all checks before opening a pull request:

```sh
npm run check
npm run test
npm run format:check
```

## Pull requests

Submit small, focused pull requests against `main`. Explain the purpose of the change, keep unrelated changes out of the pull request, and update tests or documentation when relevant.
