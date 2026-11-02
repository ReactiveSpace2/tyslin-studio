import { useEffect, useState } from 'react'
import type { Skill } from '@shared/types'

export function SkillsPage(): JSX.Element {
  const [skills, setSkills] = useState<Skill[]>([])
  useEffect(() => { void window.tyslin.skills.list().then(setSkills) }, [])

  return (
    <div className="page">
      <header style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="eyebrow">Library</span>
        <h1>Skills</h1>
        <p className="lead">Reusable instructions you can attach to any agent. Attached skills are added to the agent's instructions.</p>
      </header>
      <div className="grid">
        {skills.map((s) => (
          <article key={s.id} className="card">
            <span className="chip on" style={{ alignSelf: 'flex-start', cursor: 'default' }}>{s.name}</span>
            <p>{s.description}</p>
            <p className="mono" style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{s.body}</p>
          </article>
        ))}
      </div>
    </div>
  )
}
