import { colors } from '../styles.js'
import { formatWhen } from '../testFormat.jsx'

const mark = (ok) => (ok ? { symbol: '✓', color: colors.success } : { symbol: '✗', color: colors.danger })

// A marked attempt: score, then each question with the answer given and the correct one.
// Used for a student's own results and for a teacher looking at one student.
export default function AttemptReview({ review }) {
  return (
    <div>
      <p style={{ fontSize: '1.6rem', fontWeight: 'bold', margin: '0.5rem 0 0' }}>
        {review.score} / {review.maxScore} <span style={{ fontSize: '1rem', color: colors.muted }}>({review.percent}%)</span>
      </p>
      <p style={{ color: colors.muted, fontSize: '0.85rem', marginTop: '0.25rem' }}>
        Submitted {formatWhen(review.submittedAt)}{review.submittedBy === 'timeout' ? ' (automatically, when time ran out)' : ''}
      </p>

      {review.questions.map((question) => {
        const { symbol, color } = mark(question.correct)
        return (
          <article key={question.number} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderLeft: `5px solid ${color}`, borderRadius: '12px', padding: '0.8rem 1rem', marginTop: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.8rem' }}>
              <span style={{ color: colors.primary }}>Question {question.number}</span>
              <span style={{ color }}>{symbol} {question.earned}/{question.points} pt{question.points > 1 ? 's' : ''}</span>
            </div>
            <p style={{ whiteSpace: 'pre-wrap', margin: '0.4rem 0' }}>{question.prompt}</p>

            {question.type === 'short' ? (
              <div style={{ fontSize: '0.9rem' }}>
                <p style={{ margin: '0.2rem 0' }}>
                  Answer given: <strong style={{ color }}>{question.yourText?.trim() ? question.yourText : '(blank)'}</strong>
                </p>
                <p style={{ margin: '0.2rem 0', color: colors.muted }}>Accepted: {question.acceptedAnswers.join(' · ')}</p>
              </div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.9rem' }}>
                {question.options.map((option) => (
                  <li key={option.id} style={{ display: 'flex', gap: '0.5rem', padding: '0.15rem 0', color: option.correct ? colors.success : option.selected ? colors.danger : colors.muted }}>
                    <span aria-hidden="true" style={{ width: '1rem' }}>{option.selected ? (option.correct ? '✓' : '✗') : option.correct ? '○' : ''}</span>
                    <span>
                      {option.text}
                      {option.selected && <em style={{ fontSize: '0.8rem' }}> (chosen)</em>}
                      {option.correct && <em style={{ fontSize: '0.8rem' }}> (correct)</em>}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {question.explanation && (
              <p style={{ fontSize: '0.85rem', color: colors.muted, borderTop: `1px solid ${colors.border}`, paddingTop: '0.4rem', marginBottom: 0, whiteSpace: 'pre-wrap' }}>
                {question.explanation}
              </p>
            )}
          </article>
        )
      })}
    </div>
  )
}
