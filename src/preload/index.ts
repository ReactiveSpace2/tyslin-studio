import { contextBridge, ipcRenderer } from 'electron'
import type { StreamEvent, TyslinApi } from '@shared/types'

const api: TyslinApi = {
  agents: {
    list: () => ipcRenderer.invoke('agents:list'),
    get: (id) => ipcRenderer.invoke('agents:get', id),
    save: (input) => ipcRenderer.invoke('agents:save', input),
    remove: (id) => ipcRenderer.invoke('agents:remove', id)
  },
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    create: (name, folder) => ipcRenderer.invoke('projects:create', name, folder),
    pickFolder: () => ipcRenderer.invoke('projects:pickFolder'),
    files: (id) => ipcRenderer.invoke('projects:files', id)
  },
  sessions: {
    list: (agentId) => ipcRenderer.invoke('sessions:list', agentId),
    create: (agentId, projectId) => ipcRenderer.invoke('sessions:create', agentId, projectId),
    messages: (id) => ipcRenderer.invoke('sessions:messages', id),
    send: (id, text) => ipcRenderer.invoke('sessions:send', id, text),
    onStream: (cb) => {
      const fn = (_e: unknown, ev: StreamEvent): void => cb(ev)
      ipcRenderer.on('stream', fn)
      return () => ipcRenderer.removeListener('stream', fn)
    }
  },
  skills: {
    list: () => ipcRenderer.invoke('skills:list')
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    setKey: (provider, key) => ipcRenderer.invoke('settings:setKey', provider, key),
    setOllamaUrl: (url) => ipcRenderer.invoke('settings:setOllamaUrl', url)
  }
}

contextBridge.exposeInMainWorld('tyslin', api)
