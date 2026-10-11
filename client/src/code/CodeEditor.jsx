import Editor from '@monaco-editor/react'
import useDarkMode from '../useDarkMode.js'
import { colors } from '../styles.js'

// Monaco (the editor from VS Code). This file is loaded lazily, and Monaco itself comes
// from a CDN on first use, so pages without code don't pay for it.
export default function CodeEditor({ value, onChange, height = '420px', readOnly = false }) {
  const dark = useDarkMode()
  return (
    <div style={{ border: `2px solid ${colors.border}`, borderRadius: '10px', overflow: 'hidden' }}>
      <Editor
        height={height}
        language="javascript"
        theme={dark ? 'vs-dark' : 'light'}
        value={value}
        onChange={(next) => onChange?.(next ?? '')}
        loading={<div style={{ padding: '1rem', color: colors.muted, fontWeight: 600 }}>Loading editor…</div>}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 14,
          tabSize: 2,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          wordWrap: 'on',
          padding: { top: 12 },
        }}
      />
    </div>
  )
}
