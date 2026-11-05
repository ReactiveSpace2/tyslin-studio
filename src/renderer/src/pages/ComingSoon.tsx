import { Icon } from '../components/Icon'

interface Props {
  title: string
  icon: Parameters<typeof Icon>[0]['name']
  text: string
}

/** Placeholder for a sidebar section that isn't built yet. */
export function ComingSoon({ title, icon, text }: Props): JSX.Element {
  return (
    <div className="page">
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="eyebrow">Coming soon</span>
          <h1>{title}</h1>
          <p className="lead">{text}</p>
        </div>
      </header>
      <div className="soon-card">
        <Icon name={icon} size={28} />
        <span>This part of Tyslin isn't built yet.</span>
      </div>
    </div>
  )
}
