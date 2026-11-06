/** Channel inside an agency tab: who talks to you for this agency, and what it sends (UI only for now). */
export function AgencyChannelBar({ agency, lead }: { agency: string; lead: string | null }): JSX.Element {
  return (
    <div className="card agency-channel">
      <span><span className="eyebrow">{agency}</span>
        <strong>{lead ? `${lead} talks to you here` : 'No Lead yet: add one to hear from this agency'}</strong>
        <span className="hint">Only the Lead messages you. The channels below are shared by every agency in this organization.</span></span>
      <label className="field"><span className="label">What the Lead sends</span>
        <select className="select"><option>Questions and reviews</option><option>Everything</option><option>Digest only</option></select></label>
    </div>
  )
}
