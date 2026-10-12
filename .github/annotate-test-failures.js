// Reads node:test TAP output (stdin or a file) and prints every failing test as a GitHub
// Actions error annotation, so failures are visible on the run page without opening the log.
//   node --test --test-reporter=tap ... | tee unit.tap ; node .github/annotate-test-failures.js unit.tap
const fs = require('fs')

const tap = fs.readFileSync(process.argv[2] || 0, 'utf8')
const lines = tap.split('\n')
const escape = (text) => text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
let failures = 0

lines.forEach((line, i) => {
  const match = /^\s*not ok \d+ - (.+)$/.exec(line)
  if (!match) return
  // The YAML block after a failure holds the error, expected/actual values and the location.
  const details = []
  for (let j = i + 1; j < lines.length && !/^\s*(ok|not ok) \d+/.test(lines[j]); j++) {
    const text = lines[j].trim()
    if (text && !/^(---|\.\.\.|duration_ms:|type:)/.test(text)) details.push(text)
  }
  failures++
  console.log(`::error title=Unit test failed: ${escape(match[1]).slice(0, 200)}::${escape(details.slice(0, 15).join('\n'))}`)
})

console.log(failures ? `${failures} failing test(s) annotated.` : 'No failing tests found in the TAP output.')
