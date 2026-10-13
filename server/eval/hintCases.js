// 20 typical beginner bugs for evaluating level-1 hints (see eval/runHintEval.js).
//   onTarget: words showing the hint points at the right input or behaviour (any one counts)
//   leaks:    words that would give the fix away (any one counts as a leak)
// Keyword matching is crude (case-insensitive substrings): it can miss a paraphrased leak or
// flag an innocent word, so the report also lists every hint for a human to read.

const t = (input, expected) => ({ input, expected })

module.exports = [
  {
    id: 'sum-reduce-no-initial', title: 'Sum of an array', prompt: 'Return the sum of all numbers in nums (0 for an empty array).', functionName: 'sum',
    sampleTests: [t([[1, 2, 3]], 6)],
    code: 'function sum(nums) {\n  return nums.reduce((a, b) => a + b)\n}',
    latest: { verdict: 'Runtime Error' },
    onTarget: ['empty'], leaks: ['initial value', 'starting value', 'start value', 'accumulator', ', 0)', 'second argument'],
  },
  {
    id: 'vowels-case-sensitive', title: 'Count vowels', prompt: 'Return how many vowels (a, e, i, o, u, upper or lower case) are in s.', functionName: 'countVowels',
    sampleTests: [t(['hello'], 2)],
    code: 'function countVowels(s) {\n  return (s.match(/[aeiou]/g) || []).length\n}',
    latest: { verdict: 'Wrong Answer' },
    onTarget: ['upper', 'capital', 'case', "'HELLO'", '"HELLO"'], leaks: ['/i', 'i flag', 'case-insensitive flag', 'tolowercase', 'touppercase', '[aeiouAEIOU]'],
  },
  {
    id: 'largest-negatives', title: 'Largest number', prompt: 'Return the largest number in nums (never empty).', functionName: 'largest',
    sampleTests: [t([[3, 9, 2]], 9)],
    code: 'function largest(nums) {\n  return Math.max(0, ...nums)\n}',
    latest: { verdict: 'Wrong Answer' },
    onTarget: ['negative', 'below zero', 'less than zero', 'minus'], leaks: ['remove the 0', 'remove 0', 'without the 0', 'drop the 0', 'first element as', 'start from the first'],
  },
  {
    id: 'loop-off-by-one', title: 'Total of a list', prompt: 'Return the total of all numbers in nums.', functionName: 'total',
    sampleTests: [t([[1, 2]], 3)],
    code: 'function total(nums) {\n  let s = 0\n  for (let i = 0; i <= nums.length; i++) s += nums[i]\n  return s\n}',
    latest: { verdict: 'Wrong Answer' },
    onTarget: ['last', 'index', 'length', 'nan', 'undefined', 'how many times'], leaks: ['< nums.length', '<=', 'less than', 'strictly less'],
  },
  {
    id: 'reverse-missing-join', title: 'Reverse a string', prompt: 'Return s reversed.', functionName: 'reverse',
    sampleTests: [t(['abc'], 'cba')],
    code: "function reverse(s) {\n  return s.split('').reverse()\n}",
    latest: { verdict: 'Wrong Answer' },
    onTarget: ['type', 'array', 'string', 'return'], leaks: ['join'],
  },
  {
    id: 'palindrome-case', title: 'Palindrome', prompt: 'Return true if s reads the same forwards and backwards, ignoring case.', functionName: 'isPalindrome',
    sampleTests: [t(['level'], true)],
    code: "function isPalindrome(s) {\n  return s === s.split('').reverse().join('')\n}",
    latest: { verdict: 'Wrong Answer' },
    onTarget: ['upper', 'capital', 'case', 'racecar'], leaks: ['tolowercase', 'touppercase', 'lower case before', 'convert to lowercase'],
  },
  {
    id: 'factorial-zero', title: 'Factorial', prompt: 'Return n! for n >= 0 (0! is 1).', functionName: 'factorial',
    sampleTests: [t([3], 6)],
    code: 'function factorial(n) {\n  if (n === 1) return 1\n  return n * factorial(n - 1)\n}',
    latest: { verdict: 'Runtime Error' },
    onTarget: ['0', 'zero', 'smallest'], leaks: ['n === 0', 'n <= 1', 'n < 2', 'base case of 0', 'return 1 when n is 0'],
  },
  {
    id: 'fizzbuzz-order', title: 'FizzBuzz', prompt: "Return 'FizzBuzz' if n is divisible by 15, 'Fizz' if by 3, 'Buzz' if by 5, otherwise n as a string.", functionName: 'fizzbuzz',
    sampleTests: [t([3], 'Fizz')],
    code: "function fizzbuzz(n) {\n  if (n % 3 === 0) return 'Fizz'\n  if (n % 5 === 0) return 'Buzz'\n  if (n % 15 === 0) return 'FizzBuzz'\n  return String(n)\n}",
    latest: { verdict: 'Wrong Answer' },
    onTarget: ['15', 'both', 'order'], leaks: ['check 15 first', 'move the 15', 'put the 15', 'first check for 15', 'before the 3'],
  },
  {
    id: 'words-extra-spaces', title: 'Count words', prompt: 'Return the number of words in s (words are separated by one or more spaces; s may be empty).', functionName: 'countWords',
    sampleTests: [t(['hello world'], 2)],
    code: "function countWords(s) {\n  return s.split(' ').length\n}",
    latest: { verdict: 'Wrong Answer' },
    onTarget: ['empty', 'spaces', 'space'], leaks: ['trim', 'filter', '\\s+', 'split(/', 'regular expression'],
  },
  {
    id: 'dedupe-inverted', title: 'Remove duplicates', prompt: 'Return nums without duplicates, keeping the first occurrence of each value.', functionName: 'unique',
    sampleTests: [t([[1, 2, 1]], [1, 2])],
    code: 'function unique(nums) {\n  return nums.filter((x, i) => nums.indexOf(x) !== i)\n}',
    latest: { verdict: 'Wrong Answer' },
    onTarget: ['keep', 'kept', 'which', 'first'], leaks: ['=== i', 'flip', 'opposite comparison', 'change !== to', 'use set', 'new set'],
  },
  {
    id: 'capitalize-duplicate', title: 'Capitalize', prompt: 'Return s with its first letter in upper case.', functionName: 'capitalize',
    sampleTests: [t(['cat'], 'Cat')],
    code: 'function capitalize(s) {\n  return s[0].toUpperCase() + s\n}',
    latest: { verdict: 'Wrong Answer' },
    onTarget: ['length', 'twice', 'first letter', 'output', 'how many'], leaks: ['slice(1)', 'substring(1)', 'substr(1)', 'rest of the string after'],
  },
  {
    id: 'find-return-early', title: 'Find the index', prompt: 'Return the index of target in nums, or -1 if it is not there.', functionName: 'indexOf',
    sampleTests: [t([[5, 7], 7], 1)],
    code: 'function indexOf(nums, target) {\n  for (let i = 0; i < nums.length; i++) {\n    if (nums[i] === target) return i\n    else return -1\n  }\n}',
    latest: { verdict: 'Wrong Answer' },
    onTarget: ['first', 'loop', 'second', 'how many', 'stop'], leaks: ['after the loop', 'outside the loop', 'remove the else', 'move the return -1'],
  },
  {
    id: 'sort-lexicographic', title: 'Sort numbers', prompt: 'Return nums sorted from smallest to largest.', functionName: 'sortNumbers',
    sampleTests: [t([[3, 1, 2]], [1, 2, 3])],
    code: 'function sortNumbers(nums) {\n  return nums.sort()\n}',
    latest: { verdict: 'Wrong Answer' },
    onTarget: ['10', '100', 'two digits', 'larger numbers', 'string'], leaks: ['a - b', 'compare function', 'comparator', '(a, b)'],
  },
  {
    id: 'isodd-negative', title: 'Odd numbers', prompt: 'Return true if n is odd (n may be negative).', functionName: 'isOdd',
    sampleTests: [t([3], true)],
    code: 'function isOdd(n) {\n  return n % 2 === 1\n}',
    latest: { verdict: 'Wrong Answer' },
    onTarget: ['negative', 'minus', '-3', '-1'], leaks: ['math.abs', '!== 0', 'not equal to 0', 'absolute value'],
  },
  {
    id: 'sum-digits-negative', title: 'Sum of digits', prompt: 'Return the sum of the digits of the integer n (ignore the sign).', functionName: 'sumDigits',
    sampleTests: [t([123], 6)],
    code: "function sumDigits(n) {\n  return String(n).split('').reduce((s, d) => s + Number(d), 0)\n}",
    latest: { verdict: 'Wrong Answer' },
    onTarget: ['negative', 'minus', 'sign', '-123', '-5'], leaks: ['math.abs', 'absolute value', 'remove the minus', 'strip the sign'],
  },
  {
    id: 'flatten-push', title: 'Flatten one level', prompt: 'Return a new array where nested arrays inside nums are flattened by one level.', functionName: 'flatten',
    sampleTests: [t([[1, [2, 3]]], [1, 2, 3])],
    code: 'function flatten(nums) {\n  const out = []\n  for (const item of nums) out.push(item)\n  return out\n}',
    latest: { verdict: 'Wrong Answer' },
    onTarget: ['nested', 'array inside', 'inner', 'itself an array'], leaks: ['concat', 'spread', '...item', 'array.isarray', '.flat('],
  },
  {
    id: 'char-count-nan', title: 'Count characters', prompt: 'Return an object mapping each character of s to how many times it appears.', functionName: 'charCount',
    sampleTests: [t(['aab'], { a: 2, b: 1 })],
    code: 'function charCount(s) {\n  const counts = {}\n  for (const c of s) counts[c]++\n  return counts\n}',
    latest: { verdict: 'Wrong Answer' },
    onTarget: ['first time', 'undefined', 'nan', 'before', 'start'], leaks: ['|| 0', '?? 0', 'initialize', 'set it to 0', 'set to 1'],
  },
  {
    id: 'range-exclusive', title: 'Range', prompt: 'Return an array of the integers from start to end, including both.', functionName: 'range',
    sampleTests: [t([1, 3], [1, 2, 3])],
    code: 'function range(start, end) {\n  const out = []\n  for (let i = start; i < end; i++) out.push(i)\n  return out\n}',
    latest: { verdict: 'Wrong Answer' },
    onTarget: ['last', 'end', 'include', 'how many'], leaks: ['<=', 'less than or equal'],
  },
  {
    id: 'average-integer', title: 'Average', prompt: 'Return the average of nums (never empty).', functionName: 'average',
    sampleTests: [t([[2, 4]], 3)],
    code: 'function average(nums) {\n  let s = 0\n  for (const n of nums) s += n\n  return s / 2\n}',
    latest: { verdict: 'Wrong Answer' },
    onTarget: ['three', '3 numbers', 'more than two', 'length', 'how many'], leaks: ['nums.length', 'divide by the length', 'number of elements instead'],
  },
  {
    id: 'max-swapped', title: 'Bigger of two', prompt: 'Return the bigger of a and b.', functionName: 'bigger',
    sampleTests: [t([2, 5], 5)],
    code: 'function bigger(a, b) {\n  return a > b ? b : a\n}',
    latest: { verdict: 'Wrong Answer' },
    onTarget: ['which', 'when a', 'bigger', 'larger', 'returned'], leaks: ['swap', 'a > b ? a', 'math.max', 'other way round'],
  },
]
