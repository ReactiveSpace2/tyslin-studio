import { useEffect, useState } from 'react'
import type { GitCommitFile, GitFile } from '@shared/types'
import { Icon } from '../components/Icon'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { MiniButton } from './ExplorerPanel'
import type { Confirm } from '../components/useConfirm'
import { LETTER_CLASS, LETTER_LABEL, errorText, type Git } from './useGit'

interface Props {
  projectId: string
  git: Git
  /** Set while a card runs in this agency: commit, discard, checkout and pull wait, with this reason. */
  lockReason: string | null
  /** Open tabs with unsaved edits (a branch switch warns about them). */
  unsaved: number
  confirm: Confirm
  onOpenDiff: (path: string, staged: boolean) => void
  onOpenCommitFile: (hash: string, path: string) => void
}

const ago = (t: number): string => {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return d < 30 ? `${d} d ago` : new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
const mod = (): string => (navigator.platform.toLowerCase().includes('mac') ? 'Cmd' : 'Ctrl')

/**
 * Source control: the branch, pull and push, a commit message and the Staged / Changes lists, and the last 50 commits.
 * Commits use the user's own git name and email (asked once and set with --local when missing). Never force, reset or rebase.
 */
export function SourceControlPanel({ projectId, git, lockReason, unsaved, confirm, onOpenDiff, onOpenCommitFile }: Props): JSX.Element {
  const s = git.status
  const [message, setMessage] = useState('')
  const [identity, setIdentity] = useState<{ name: string; email: string; error?: string } | null>(null)
  const [branchDialog, setBranchDialog] = useState<{ name: string; error?: string } | null>(null)
  const [openCommit, setOpenCommit] = useState<string | null>(null)
  const [commitFiles, setCommitFiles] = useState<Record<string, GitCommitFile[]>>({})
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => { setMessage(''); setOpenCommit(null); setCommitFiles({}); setNote(null) }, [projectId])

  const header = (
    <div className="flex h-10 flex-none items-center justify-between px-3">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Source control</h2>
      {s?.repo && <Badge variant="soft" className="font-mono">{s.files.length}</Badge>}
    </div>
  )
  const errorBox = git.error && (
    <Alert variant="destructive" className="mx-3 mb-2 w-auto"><AlertDescription className="font-mono text-xs break-words whitespace-pre-wrap">{git.error}</AlertDescription>
      <Button variant="link" size="sm" className="col-start-2 h-auto justify-self-start px-0" onClick={() => git.setError(null)}>Dismiss</Button></Alert>
  )

  if (!s) return <div className="flex min-h-0 flex-1 flex-col">{header}<p className="px-3 text-[13px] text-muted-foreground" role="status">Checking git…</p></div>

  if (!s.installed) {
    const plat = navigator.platform.toLowerCase()
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {header}
        <div className="flex flex-col gap-2 px-3 text-[13px] leading-relaxed">
          <p className="font-medium">git isn't installed on this computer.</p>
          <p className="text-muted-foreground">Install it, then come back here. Everything else on this screen works without it.</p>
          {plat.includes('mac') ? <p>Run <code className="rounded bg-muted px-1 font-mono text-xs">xcode-select --install</code> in Terminal.</p>
            : plat.includes('win') ? <p>Download Git for Windows from git-scm.com and run the installer.</p>
            : <p>Install it with your package manager, for example <code className="rounded bg-muted px-1 font-mono text-xs">sudo apt install git</code>.</p>}
          <a className="self-start text-green underline underline-offset-2" href="https://git-scm.com/downloads" target="_blank" rel="noreferrer">git-scm.com/downloads</a>
          <Button variant="outline" size="sm" className="self-start" onClick={() => void git.refresh()}>Check again</Button>
        </div>
      </div>
    )
  }

  if (!s.repo) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {header}
        {errorBox}
        <div className="flex flex-col gap-2 px-3 text-[13px] leading-relaxed">
          <p className="text-muted-foreground">This folder isn't a git repository yet. Initialize one to track changes, commit and push.</p>
          <Button size="sm" className="self-start" disabled={!!git.busy} onClick={() => void git.act('init', () => window.tyslin.git.init(projectId))}>Initialize repository</Button>
        </div>
      </div>
    )
  }

  const locked = !!lockReason
  const staged = git.staged
  const changes = git.changes
  const busy = !!git.busy

  const doCommit = async (): Promise<void> => {
    if (locked || busy || !staged.length || !message.trim()) return
    const id = await window.tyslin.git.identity(projectId).catch(() => ({ name: '', email: '' }))
    if (!id.name || !id.email) { setIdentity({ name: id.name, email: id.email }); return }
    const text = message
    if (await git.act('commit', () => window.tyslin.git.commit(projectId, text))) { setMessage(''); setNote(`Committed ${staged.length} ${staged.length === 1 ? 'file' : 'files'}.`) }
  }
  const saveIdentity = async (): Promise<void> => {
    if (!identity) return
    try {
      await window.tyslin.git.setIdentity(projectId, { name: identity.name, email: identity.email })
      setIdentity(null)
      void doCommit()
    } catch (e) { setIdentity({ ...identity, error: errorText(e) }) }
  }
  const checkout = async (branch: string): Promise<void> => {
    if (branch === s.branch) return
    if (s.files.length || unsaved) {
      const ok = await confirm({
        title: `Switch to ${branch}?`,
        description: `You have ${s.files.length} uncommitted ${s.files.length === 1 ? 'change' : 'changes'}${unsaved ? ` and ${unsaved} unsaved ${unsaved === 1 ? 'tab' : 'tabs'}` : ''}. Git carries uncommitted changes over to ${branch} when it can; if they clash with ${branch}, git stops and nothing changes. Unsaved tabs stay as they are.`,
        action: 'Switch branch'
      })
      if (ok !== true) return
    }
    await git.act('checkout', () => window.tyslin.git.checkout(projectId, branch))
  }
  const createBranch = async (): Promise<void> => {
    if (!branchDialog) return
    const name = branchDialog.name.trim()
    try { await window.tyslin.git.createBranch(projectId, name); setBranchDialog(null); await git.refresh() } catch (e) { setBranchDialog({ ...branchDialog, error: errorText(e) }) }
  }
  const push = async (): Promise<void> => {
    const target = s.tracking ?? `the remote (as ${s.branch})`
    const ok = await confirm({
      title: s.ahead ? `Push ${s.ahead} ${s.ahead === 1 ? 'commit' : 'commits'}?` : 'Push this branch?',
      description: `Sends ${s.branch ?? 'this branch'} to ${target}. Everyone with access to the remote can see these commits. Push never overwrites the remote; if it has commits you don't, git stops and you pull first.`,
      action: 'Push'
    })
    if (ok === true && await git.act('push', () => window.tyslin.git.push(projectId))) setNote('Pushed.')
  }
  const pull = async (): Promise<void> => {
    if (await git.act('pull', () => window.tyslin.git.pull(projectId))) setNote('Up to date with the remote.')
  }
  const discard = async (f: GitFile): Promise<void> => {
    const ok = await confirm({
      title: `Discard changes to ${f.path.split('/').pop()}?`,
      description: f.unstaged === 'U'
        ? 'This file is new and not tracked yet. It goes to the system Trash.'
        : `Your changes since the last ${f.staged ? 'stage' : 'commit'} are thrown away and the file goes back to that version. This can't be undone from here.`,
      action: 'Discard changes', destructive: true
    })
    if (ok === true) await git.act('discard', () => window.tyslin.git.discard(projectId, [f.path]))
  }
  const toggleCommit = (hash: string, on: boolean): void => {
    setOpenCommit(on ? hash : null)
    if (on && !commitFiles[hash]) void window.tyslin.git.commitFiles(projectId, hash).then((fs) => setCommitFiles((c) => ({ ...c, [hash]: fs }))).catch((e) => git.setError(errorText(e)))
  }

  const row = (f: GitFile, which: 'staged' | 'unstaged'): JSX.Element => {
    const l = (which === 'staged' ? f.staged : f.unstaged)!
    const name = f.path.split('/').pop()!
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''
    return (
      <li key={which + f.path} className="group flex h-9 min-w-0 items-center gap-1.5 rounded-md pr-1 pl-2.5 hover:bg-sidebar-accent">
        <span className={cn('w-4 flex-none text-center font-mono text-[11px] font-medium', LETTER_CLASS[l])} aria-label={LETTER_LABEL[l]} title={LETTER_LABEL[l]}>{l}</span>
        <button type="button" className="flex min-w-0 flex-1 items-baseline gap-1.5 truncate text-left text-[13.5px] outline-none focus-visible:underline" title={f.path}
          onClick={() => onOpenDiff(f.path, which === 'staged')}>
          <span className="truncate font-mono text-[13px]">{name}</span>{dir && <span className="truncate text-xs text-muted-foreground">{dir}</span>}
        </button>
        {which === 'staged'
          ? <MiniButton label={`Unstage ${name}`} icon="minus" disabled={busy} onClick={() => void git.act('unstage', () => window.tyslin.git.unstage(projectId, [f.path]))} />
          : <>
              <MiniButton label={locked ? `Discard waits: ${lockReason}` : `Discard changes to ${name}`} icon="undo" disabled={busy || locked} onClick={() => void discard(f)} />
              <MiniButton label={`Stage ${name}`} icon="plus" disabled={busy} onClick={() => void git.act('stage', () => window.tyslin.git.stage(projectId, [f.path]))} />
            </>}
      </li>
    )
  }

  const branchLabel = s.detached ? 'Detached HEAD' : s.branch ?? (s.hasCommits ? 'No branch' : (git.branches?.current ?? 'main'))
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {header}
      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
        <div className="flex flex-col pb-3">
          <div className="flex min-w-0 items-center gap-1 px-3 pb-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="min-w-0 flex-1 justify-between font-mono text-xs" disabled={busy} aria-label={`Branch: ${branchLabel}. Switch or create a branch`}>
                  <span className="flex min-w-0 items-center gap-1.5"><Icon name="branch" size={13} /><span className="truncate">{branchLabel}</span></span>
                  <Icon name="chevronDown" size={12} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel className="text-xs text-muted-foreground">{locked ? `Switching waits: ${lockReason}` : 'Branches'}</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={s.branch ?? ''} onValueChange={(b) => void checkout(b)}>
                  {(git.branches?.all ?? []).map((b) => <DropdownMenuRadioItem key={b} value={b} disabled={locked} className="font-mono text-xs">{b}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
                {!git.branches?.all.length && <DropdownMenuItem disabled className="text-xs">No branches until the first commit</DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setBranchDialog({ name: '' })} disabled={!s.hasCommits}><Icon name="plus" size={12} /> New branch…</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {s.hasRemote && (
              <>
                <Button variant="ghost" size="sm" className="h-9 min-w-11 font-mono text-xs" disabled={busy || locked} onClick={() => void pull()}
                  aria-label={locked ? `Pull waits: ${lockReason}` : s.behind ? `Pull ${s.behind} commits` : 'Pull'} title={locked ? lockReason ?? '' : 'Pull (fast-forward only)'}>↓{s.behind}</Button>
                <Button variant="ghost" size="sm" className="h-9 min-w-11 font-mono text-xs" disabled={busy || !s.branch} onClick={() => void push()}
                  aria-label={s.ahead ? `Push ${s.ahead} commits` : 'Push'} title="Push">↑{s.ahead}</Button>
              </>
            )}
          </div>
          {git.busy && <p className="px-3 pb-2 text-xs text-muted-foreground" role="status">Running git {git.busy}…</p>}
          {errorBox}
          {note && !git.error && <p className="px-3 pb-2 text-xs text-green" role="status">{note} <button type="button" className="underline" onClick={() => setNote(null)}>Dismiss</button></p>}

          <div className="flex flex-col gap-1.5 px-3">
            <Label htmlFor="commit-message" className="text-xs font-normal text-muted-foreground">Commit message</Label>
            <Textarea id="commit-message" className="min-h-16 resize-y bg-card text-[13.5px]" placeholder="Describe what changed" value={message} onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void doCommit() } }} />
            <Button size="sm" disabled={locked || busy || !staged.length || !message.trim()} onClick={() => void doCommit()} title={`${mod()}+Enter`}>
              {staged.length ? `Commit ${staged.length} staged ${staged.length === 1 ? 'file' : 'files'}` : 'Commit'}
            </Button>
            <span className="text-xs text-muted-foreground">
              {locked ? lockReason : !staged.length ? (changes.length ? 'Stage the changes you want to commit (+).' : 'Nothing to commit.') : `${mod()}+Enter commits.`}
            </span>
          </div>

          <Section title={`Staged · ${staged.length}`} />
          {staged.length ? <ul className="flex flex-col px-1.5">{staged.map((f) => row(f, 'staged'))}</ul> : <p className={EMPTY}>Nothing staged.</p>}

          <Section title={`Changes · ${changes.length}`} action={changes.length ? <Button variant="ghost" size="sm" className="h-8" disabled={busy} onClick={() => void git.act('stage', () => window.tyslin.git.stage(projectId, changes.map((f) => f.path)))}>Stage all</Button> : null} />
          {changes.length ? <ul className="flex flex-col px-1.5">{changes.map((f) => row(f, 'unstaged'))}</ul> : <p className={EMPTY}>No changes.</p>}

          <Section title="History" />
          {!git.log.length && <p className={EMPTY}>No commits yet.</p>}
          <ul className="flex flex-col px-1.5">
            {git.log.map((c) => (
              <li key={c.hash}>
                <Collapsible open={openCommit === c.hash} onOpenChange={(o) => toggleCommit(c.hash, o)}>
                  <CollapsibleTrigger className="flex w-full min-w-0 flex-col gap-0.5 rounded-md px-2.5 py-2 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-inset">
                    <span className="w-full truncate text-[13px]">{c.message}</span>
                    <span className="w-full truncate font-mono text-[11.5px] text-muted-foreground">{c.short} · {c.author} · {ago(c.date)}</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ul className="flex flex-col pb-1 pl-3">
                      {!commitFiles[c.hash] && <li className={EMPTY}>Loading…</li>}
                      {commitFiles[c.hash]?.length === 0 && <li className={EMPTY}>No files in this folder.</li>}
                      {commitFiles[c.hash]?.map((f) => (
                        <li key={f.path}>
                          <button type="button" className="flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-inset" title={f.path}
                            onClick={() => onOpenCommitFile(c.hash, f.path)}>
                            <span className={cn('w-4 flex-none text-center font-mono text-[11px] font-medium', LETTER_CLASS[f.letter])} aria-label={LETTER_LABEL[f.letter]}>{f.letter}</span>
                            <span className="min-w-0 flex-1 truncate font-mono text-xs">{f.path}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              </li>
            ))}
          </ul>
          <p className="px-3 pt-3 text-xs leading-relaxed text-muted-foreground">Commits use your own git name and email. Push and pull use git's own sign-in (credential helper or SSH key); Tyslin never asks for or stores a git password or token.</p>
        </div>
      </ScrollArea>

      <Dialog open={!!identity} onOpenChange={(o) => { if (!o) setIdentity(null) }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Who is committing?</DialogTitle>
            <DialogDescription>Git needs a name and email for your commits. They are saved for this repository only (git config --local) and go on every commit you make here.</DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void saveIdentity() }}>
            <div className="flex flex-col gap-1.5"><Label htmlFor="git-name">Name</Label><Input id="git-name" autoFocus value={identity?.name ?? ''} onChange={(e) => identity && setIdentity({ ...identity, name: e.target.value })} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="git-email">Email</Label><Input id="git-email" type="email" value={identity?.email ?? ''} onChange={(e) => identity && setIdentity({ ...identity, email: e.target.value })} /></div>
            {identity?.error && <p className="text-[13px] text-destructive" role="alert">{identity.error}</p>}
            <DialogFooter><Button type="button" variant="outline" onClick={() => setIdentity(null)}>Cancel</Button><Button type="submit">Save and commit</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!branchDialog} onOpenChange={(o) => { if (!o) setBranchDialog(null) }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>New branch</DialogTitle>
            <DialogDescription>Starts from {s.branch ?? 'the current commit'} and switches to it. Your uncommitted changes come along.</DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void createBranch() }}>
            <div className="flex flex-col gap-1.5"><Label htmlFor="branch-name">Branch name</Label><Input id="branch-name" autoFocus className="font-mono" placeholder="feat/my-change" value={branchDialog?.name ?? ''} onChange={(e) => branchDialog && setBranchDialog({ name: e.target.value })} /></div>
            {branchDialog?.error && <p className="text-[13px] text-destructive" role="alert">{branchDialog.error}</p>}
            <DialogFooter><Button type="button" variant="outline" onClick={() => setBranchDialog(null)}>Cancel</Button><Button type="submit" disabled={!branchDialog?.name.trim()}>Create branch</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const EMPTY = 'px-3 py-1 text-xs text-muted-foreground'

function Section({ title, action }: { title: string; action?: React.ReactNode }): JSX.Element {
  return (
    <div className="flex h-10 items-center justify-between px-3 pt-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {action}
    </div>
  )
}
