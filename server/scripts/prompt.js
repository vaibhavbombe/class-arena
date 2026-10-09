const readline = require('readline')

// Asks a question on the terminal. With hidden: true, typed characters aren't echoed,
// so secrets never appear on screen or in shell history.
function ask(question, { hidden = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  if (hidden) {
    // Print the question, then swallow the echoed keystrokes.
    rl._writeToOutput = (text) => {
      if (text.includes(question)) rl.output.write(text)
    }
  }
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close()
    if (hidden) process.stdout.write('\n')
    resolve(answer.trim())
  }))
}

module.exports = { ask }
