import { chatCompletion } from './openai.js'

const MAX_STEPS = 12

/**
 * Run one agent loop: send messages to the model, execute tool calls,
 * append results, repeat until the model stops calling tools or we hit
 * the step limit.
 *
 * @param {{
 *   systemPrompt: string,
 *   userPrompt: string,
 *   tools: Array,
 *   executor: { execute: (name: string, args: any) => string },
 *   recorder?: { record: (entry: any) => void } | null,
 *   replay?: Iterator | null,
 *   maxSteps?: number
 * }} opts
 * @returns {Promise<{ messages: Array, steps: number, promptTokens: number, completionTokens: number, lastContent: string | null }>}
 */
export async function runAgentLoop(opts) {
  const { systemPrompt, userPrompt, tools, executor, recorder, replay, maxSteps = MAX_STEPS } = opts

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ]

  let steps = 0
  let promptTokens = 0
  let completionTokens = 0
  let lastContent = null

  while (steps < maxSteps) {
    steps++

    let assistantMessage

    if (replay) {
      const next = replay.next()
      if (next.done) break
      assistantMessage = next.value
    } else {
      const response = await chatCompletion({ messages, tools })
      assistantMessage = response.message
      promptTokens += response.usage?.prompt_tokens ?? 0
      completionTokens += response.usage?.completion_tokens ?? 0
    }

    if (recorder) {
      recorder.record({ role: 'assistant', content: assistantMessage.content, tool_calls: assistantMessage.tool_calls ?? null })
    }

    messages.push(assistantMessage)

    if (assistantMessage.content) {
      lastContent = assistantMessage.content
    }

    if (!assistantMessage.tool_calls?.length) break

    for (const tc of assistantMessage.tool_calls) {
      let args
      try {
        args = typeof tc.function.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : tc.function.arguments
      } catch {
        args = {}
      }

      const result = executor.execute(tc.function.name, args)

      const toolMsg = {
        role: 'tool',
        tool_call_id: tc.id,
        content: typeof result === 'string' ? result : JSON.stringify(result)
      }

      if (recorder) {
        recorder.record({ role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: toolMsg.content })
      }

      messages.push(toolMsg)
    }
  }

  return { messages, steps, promptTokens, completionTokens, lastContent }
}
