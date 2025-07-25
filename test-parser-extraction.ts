import Database from "better-sqlite3";
import { PythonLanguageParser } from "./src/parsers/adapters/python-language-parser.js";
import { GoLanguageParser } from "./src/parsers/adapters/go-language-parser.js";
import { DatabaseInitializer } from "./src/database/database-initializer.js";
import fs from "fs";

async function testParsers() {
  // Create in-memory database for testing
  const db = new Database(":memory:");
  const initializer = new DatabaseInitializer(db);
  await initializer.initialize();

  // Test Python parser
  console.log("=== TESTING PYTHON PARSER ===");
  const pythonParser = new PythonLanguageParser(db, {
    debugMode: true,
    enableSemanticAnalysis: false,
  });
  await pythonParser.initialize();

  const pythonCode = fs.readFileSync("/workspace/test/fixtures/multi-language/sample.py", "utf-8");
  const pythonResult = await pythonParser.parseFile("sample.py", pythonCode);
  
  console.log("\nPython Symbols Found:");
  pythonResult.symbols.forEach(sym => {
    console.log(`- ${sym.name} (${sym.symbolType})`);
    console.log(`  Line: ${sym.lineNumber}, Visibility: ${sym.visibility}`);
    console.log(`  Return Type: ${sym.returnType || "N/A"}`);
    console.log(`  Signature: ${sym.signature || "N/A"}`);
    console.log(`  Raw Data: ${JSON.stringify(sym, null, 2)}`);
    console.log("");
  });

  // Test Go parser
  console.log("\n=== TESTING GO PARSER ===");
  const goParser = new GoLanguageParser(db, {
    debugMode: true,
    enableSemanticAnalysis: false,
  });
  await goParser.initialize();

  const goCode = fs.readFileSync("/workspace/test-repos/cross-language/microservices-demo/src/checkoutservice/money/money.go", "utf-8");
  const goResult = await goParser.parseFile("money.go", goCode);
  
  console.log("\nGo Symbols Found:");
  goResult.symbols.forEach(sym => {
    console.log(`- ${sym.name} (${sym.symbolType})`);
    console.log(`  Line: ${sym.lineNumber}, Visibility: ${sym.visibility}`);
    console.log(`  Return Type: ${sym.returnType || "N/A"}`);
    console.log(`  Signature: ${sym.signature || "N/A"}`);
    console.log(`  Raw Data: ${JSON.stringify(sym, null, 2)}`);
    console.log("");
  });

  // Check database schema
  console.log("\n=== DATABASE SCHEMA ===");
  const schemaQuery = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='universal_symbols'").get();
  console.log(schemaQuery);
}

testParsers().catch(console.error);