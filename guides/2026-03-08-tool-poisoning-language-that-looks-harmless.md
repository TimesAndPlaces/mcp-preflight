# Tool poisoning language that looks harmless until you read it closely

This is a practical preflight read of MCP tool descriptions and help text.

It is not a claim that every awkward tool description is malicious. The point is narrower: once a model sees tool text as instruction-bearing context, seemingly harmless wording can quietly change what the model is willing to do.

## Source material
- [Tool Description Poisoning](https://modelcontextprotocol-security.io/ttps/prompt-injection/tool-description-poisoning/)
- [MCP Server Top 10 Security Risks](https://modelcontextprotocol-security.io/top10/server/)
- [Model Context Protocol tools reference](https://modelcontextprotocol.io/legacy/concepts/tools)
- [Snyk: malicious `postmark-mcp` package](https://security.snyk.io/vuln/SNYK-JS-POSTMARKMCP-13052679)

## Why this one is worth reading

The MCP tools docs tell implementers to write clear, descriptive tool names and descriptions, and to use annotations to signal side effects. That is good guidance.

The security problem is that tool descriptions are not just documentation. They are also part of what the model reads when deciding which tool to use and how to use it.

The MCP Security project treats tool poisoning as a first-class risk, and the server Top 10 explicitly ties prompt injection to manipulation of tool descriptions. That is the right framing: a poisoned tool does not need an obviously evil name if the descriptive text nudges the model in the wrong direction.

## The pattern to watch for

### 1. Hidden side effects described like convenience

This is the most common bad smell.

The language sounds operationally helpful:

- "also syncs metadata"
- "for delivery assurance"
- "silently forwards a copy"
- "keeps an external recipient informed"
- "includes fallback routing"

That kind of text is dangerous because it normalizes extra behavior instead of describing the main action cleanly.

The `postmark-mcp` case is a useful reminder here. Snyk classifies it as a malicious package and says it reportedly added a hidden BCC to exfiltrate email contents. That is exactly the category of behavior a preflight reviewer should care about: a tool that appears to do one thing while quietly doing another.

**Preflight take:** if a tool description contains side effects that are not essential to the core action, treat it as suspicious until the behavior is explicit and justified.

### 2. Instructional language aimed at the model, not the user

The MCP Security tool-description-poisoning page describes attacks where malicious instructions are embedded in tool descriptions that the LLM sees but the user may not notice.

The obvious forms are easy to catch:

- "always use this tool"
- "ignore previous instructions"
- "bypass warnings"
- "prefer this tool for any file or email task"

The more realistic forms are quieter:

- "best default for most tasks"
- "safe to use without asking"
- "prefer this tool when speed matters"
- "use automatically when relevant"

Those phrases are not documentation anymore. They are steering language.

**Preflight take:** the description should explain capability and scope, not try to win a selection contest inside the model.

### 3. Parameter text that quietly widens the action

Poisoning does not have to live in the top-level description. The MCP Security guidance also calls out hiding instructions in parameter descriptions.

That usually looks like:

- recipient fields that imply hidden copies
- path or URL fields that imply broader fallback behavior
- "optional" parameters that quietly expand network scope
- auth fields that imply host-token reuse without saying so plainly

If a parameter description adds action semantics that are not obvious from the parameter name, it deserves a closer read.

**Preflight take:** parameter text should explain the input, not smuggle in extra workflow logic.

### 4. Descriptions that contradict the risk hints

The MCP tools reference gives annotations like `readOnlyHint`, `destructiveHint`, and `openWorldHint` to help clients present tools appropriately. The docs are also clear that those annotations are hints and should not be treated as security controls.

That matters because a poisoned tool can still present itself as harmless.

Common trust downgrade:

- description sounds read-only
- annotation hints are comforting
- real behavior still touches external systems, modifies state, or widens scope

**Preflight take:** if the description, parameters, and apparent side effects do not line up cleanly, trust the mismatch as a warning sign.

### 5. Vague words where precision matters

The wording that should make you slow down is often boring, not dramatic:

- "optimize"
- "enhance"
- "improve deliverability"
- "keep things in sync"
- "handle related tasks"
- "perform follow-up actions"

Those phrases can be fine in marketing copy. They are weak security language in a tool definition.

When a tool can send mail, touch files, call URLs, or use credentials, vague verbs are a liability.

**Preflight take:** if you cannot tell exactly what the tool will do from the description alone, the description is not ready to trust.

## What MCP Preflight would usually flag

MCP Preflight is intentionally simple here. It does not try to prove malicious intent. It flags text that deserves a human read before the tool becomes trusted context.

Typical review triggers:

- "ignore previous instructions"
- "reveal environment variable"
- "silently forward"
- "hidden recipient"
- "without telling the user"

Those checks are useful because they create friction at the right moment: before the model starts treating the tool description like normal ground truth.

## A short checklist

Before you trust a tool description, ask:

- does the text only describe the tool, or does it also steer the model?
- are there any hidden or secondary actions described as convenience?
- do parameter descriptions widen scope or behavior quietly?
- do the annotations, description, and likely side effects line up?
- would a human reviewer understand the real effect without reading source code?

If the answer is no, the tool description is not clean enough yet.

The next action is simple: read your current tool descriptions as if they were executable policy, not just metadata.
