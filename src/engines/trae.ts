import type { AgentEngine, InvokeOpts, StreamEvent } from '../engine.js'
import { basename, join, resolve } from 'node:path'
import { isOnPath, stripAnsi } from './shared.js'
import { lstat, mkdir, readdir, symlink, unlink } from 'node:fs/promises'

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { spawn } from 'node:child_process'

function parseTraeStreamLine(line: string): StreamEvent[] {
    const cleaned = stripAnsi(line).trim()
    if (!cleaned || !cleaned.startsWith('{')) return []
    let obj: Record<string, unknown>
    try { obj = JSON.parse(cleaned) } catch { return [] }
    const type = obj.type as string | undefined
    const sessionId = (obj.session_id as string | undefined) || (obj.sessionID as string | undefined)

    if (type === 'assistant') {
        const msg = obj.message as Record<string, unknown> | undefined
        if (!msg) return []
        const content = msg.content as Array<Record<string, unknown>> | undefined
        if (!Array.isArray(content)) return []
        const texts = content.filter(b => b.type === 'text').map(b => (b.text as string) || '').filter(Boolean)
        return texts.map(t => ({ type: 'text', content: t }))
    }

    if (type === 'tool_call') {
        const tc = obj.tool_call as Record<string, unknown> | undefined
        const subtype = obj.subtype as string | undefined
        let name = 'unknown'
        let args = ''
        if (tc) {
            if ('function' in tc) {
                const fn = tc.function as Record<string, unknown>
                name = (fn.name as string) || 'unknown'
                args = (fn.arguments as string) || ''
            } else {
                for (const key of Object.keys(tc)) {
                    if (key.endsWith('ToolCall')) {
                        name = key
                        const inner = tc[key] as Record<string, unknown>
                        args = JSON.stringify(inner?.args ?? {})
                        break
                    }
                }
            }
        }
        const events: StreamEvent[] = [{ type: 'tool_call', name, args }]
        if (subtype === 'completed' && tc) {
            for (const key of Object.keys(tc)) {
                const inner = tc[key] as Record<string, unknown>
                const result = inner?.result
                if (result !== undefined) {
                    events.push({ type: 'tool_result', content: typeof result === 'string' ? result : JSON.stringify(result) })
                    break
                }
            }
        }
        return events
    }

    if (type === 'result') {
        const isError = obj.is_error as boolean | undefined
        if (isError) {
            const message = (obj.result as string) || (obj.error as string) || 'Agent error'
            return [{ type: 'error', message }]
        }
        const durationMs = typeof (obj as Record<string, unknown>).duration_ms === 'number' ? (obj as Record<string, unknown>).duration_ms as number : undefined
        const costUsd = typeof (obj as Record<string, unknown>).total_cost_usd === 'number' ? (obj as Record<string, unknown>).total_cost_usd as number : undefined
        const numTurns = typeof (obj as Record<string, unknown>).num_turns === 'number' ? (obj as Record<string, unknown>).num_turns as number : undefined
        return [{ type: 'done', sessionId, durationMs, costUsd, numTurns }]
    }

    if (type === 'error') {
        const message = (obj.message as string) || 'Agent error'
        return [{ type: 'error', message }]
    }

    return []
}

async function injectTraeSkills(workspace: string, skillPaths: string[]): Promise<void> {
    const skillsDir = join(workspace, '.trae', 'skills')
    await mkdir(skillsDir, { recursive: true })
    try {
        const existing = await readdir(skillsDir)
        for (const entry of existing) {
            const full = join(skillsDir, entry)
            const s = await lstat(full).catch(() => null)
            if (s?.isSymbolicLink()) await unlink(full)
        }
    } catch { }
    for (const sp of skillPaths) {
        const name = basename(sp)
        const dest = join(skillsDir, name)
        try { await symlink(resolve(sp), dest) } catch (e: unknown) {
            if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
        }
    }
}

function findTraeBin(): string {
    const localBin = join(homedir(), '.local', 'bin', 'trae')
    if (!existsSync(localBin) && !isOnPath('trae')) {
        throw new Error(
            `Trae CLI ("trae") not found at ${localBin}\n` +
            `Install or ensure it is on PATH.`,
        )
    }
    return existsSync(localBin) ? localBin : 'trae'
}

export class TraeEngine implements AgentEngine {
    async *invoke(prompt: string, opts: InvokeOpts): AsyncIterable<StreamEvent> {
        await injectTraeSkills(opts.workspace, opts.skillPaths)
        const bin = findTraeBin()
        const args = [
            '-p', prompt,
            '--output-format', 'stream-json',
            '--workspace', opts.workspace,
        ]
        if (opts.sessionId) args.push('--resume', opts.sessionId)
        if (opts.model) args.push('--model', opts.model)
        const env: Record<string, string> = {
            ...process.env as Record<string, string>,
            PATH: `${join(homedir(), '.local', 'bin')}:${process.env.PATH || ''}`,
        }
        if (opts.apiKey) env.TRAE_API_KEY = opts.apiKey
        const child = spawn(bin, args, { cwd: opts.workspace, env, stdio: ['ignore', 'pipe', 'pipe'] })
        const queue: Array<StreamEvent | null> = []
        let resolver: (() => void) | null = null
        let buffer = ''
        function enqueue(evt: StreamEvent | null) { queue.push(evt); if (resolver) { resolver(); resolver = null } }
        function processBuffer() {
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''
            for (const line of lines) {
                if (!line.trim()) continue
                for (const evt of parseTraeStreamLine(line)) enqueue(evt)
            }
        }
        if (opts.signal) {
            const abortHandler = () => { try { child.kill() } catch { } enqueue({ type: 'error', message: 'Agent invocation timed out' }); enqueue(null) }
            opts.signal.addEventListener('abort', abortHandler, { once: true })
            child.once('close', () => opts.signal!.removeEventListener('abort', abortHandler))
        }
        child.stdout!.on('data', (chunk: Buffer) => { buffer += chunk.toString(); processBuffer() })
        child.on('close', (exitCode: number | null) => {
            if (buffer.trim()) { buffer += '\n'; processBuffer() }
            const code = exitCode ?? 1
            if (code !== 0 && !queue.some(e => e && (e.type === 'done' || e.type === 'error'))) {
                enqueue({ type: 'error', message: `Trae process exited with code ${code}` })
            }
            enqueue(null)
        })
        child.on('error', (err: Error) => { enqueue({ type: 'error', message: `Failed to start Trae: ${err.message}` }); enqueue(null) })
        while (true) {
            if (queue.length === 0) await new Promise<void>(r => { resolver = r })
            while (queue.length > 0) {
                const evt = queue.shift()!
                if (evt === null) return
                yield evt
                if (evt.type === 'done' || evt.type === 'error') { try { child.kill() } catch { } return }
            }
        }
    }
}

export { parseTraeStreamLine, injectTraeSkills }

