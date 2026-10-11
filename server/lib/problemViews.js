// What students and staff see of practice problems and judge results. Pure functions,
// unit-tested in test/problemViews.test.js: the important property is that nothing a
// student receives contains hidden-test data or the reference solution.

function titleFrom(prompt) {
  const firstLine = String(prompt).trim().split('\n')[0].trim()
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine || 'Coding problem'
}

function studentProblemView(problem) {
  return {
    id: problem._id,
    classId: problem.classId,
    title: problem.title,
    prompt: problem.prompt,
    difficulty: problem.difficulty,
    functionName: problem.code.functionName,
    starterCode: problem.code.starterCode,
    sampleTests: problem.code.sampleTests.map(({ input, expected }) => ({ input, expected })),
    hiddenTestCount: problem.code.hiddenTests.length,
    timeLimitMs: problem.code.timeLimitMs,
    memoryMb: problem.code.memoryMb,
  }
}

function staffProblemView(problem) {
  return {
    ...studentProblemView(problem),
    questionId: problem.questionId,
    hiddenTests: problem.code.hiddenTests.map(({ input, expected }) => ({ input, expected })),
    referenceSolution: problem.code.referenceSolution,
    createdAt: problem.createdAt,
  }
}

// The judge ran samples first, then hidden tests, with full details (it's trusted).
// Keep sample details; reduce hidden ones to pass/fail, verdict and time.
function studentResult(result, sampleCount) {
  return {
    verdict: result.verdict,
    passed: result.passed,
    total: result.total,
    timeMs: result.timeMs ?? null,
    // Compile errors describe the student's own code, not test data.
    error: result.verdict === 'Compile Error' ? result.error || null : null,
    tests: (result.tests || []).map((test) => (test.index < sampleCount
      ? {
        index: test.index, kind: 'sample', number: test.index + 1, passed: test.passed, verdict: test.verdict, timeMs: test.timeMs,
        input: test.input, expected: test.expected, output: test.output, error: test.error, logs: test.logs,
      }
      : { index: test.index, kind: 'hidden', number: test.index - sampleCount + 1, passed: test.passed, verdict: test.verdict, timeMs: test.timeMs })),
  }
}

// A student's standing on one problem, from their submissions (newest first or any order).
function problemStatus(submissions) {
  if (submissions.some((s) => s.verdict === 'Accepted')) return 'solved'
  return submissions.length ? 'attempted' : 'new'
}

module.exports = { titleFrom, studentProblemView, staffProblemView, studentResult, problemStatus }
