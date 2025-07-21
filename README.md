# Module Sentinel

Multi-language code analysis and visualization tool for C++, Python, TypeScript, and more.

## Quick Start

```bash
# Install dependencies
npm install

# Run tests (creates database with sample data)
npm test

# Start dashboard
npm run dashboard
```

Then open http://localhost:8080 in your browser.

## Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests and create sample database |
| `npm test --filter <name>` | Run specific tests (e.g. `--filter drizzle`) |
| `npm run dashboard` | Start visualization dashboard at http://localhost:8080 |
| `npm run build` | Build TypeScript to JavaScript |
| `npm run clean` | Remove build files |

## Dashboard Features

- **Browse Symbols** - View parsed functions, classes, modules
- **Search Code** - Find symbols by name or content  
- **View Statistics** - Database overview and language breakdown
- **Analyze Relationships** - Symbol dependencies and call graphs

## Architecture

- **Universal Schema** - Single database for all languages
- **Tree-sitter Parsing** - Robust multi-language code analysis
- **Drizzle ORM** - Type-safe database operations
- **RESTful API** - Clean visualization endpoints

## Database

The system uses SQLite with a universal schema supporting multiple programming languages. Test data is automatically created when running `npm test`.

---

✨ **Ready to use!** Just run `npm test` then `npm run dashboard` to get started.