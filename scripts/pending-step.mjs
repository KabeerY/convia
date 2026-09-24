const name = process.argv[2] ?? "unknown";
console.error(`${name} is not implemented in PR-01. See docs/IMPLEMENTATION_PLAN.md.`);
process.exitCode = 2;
