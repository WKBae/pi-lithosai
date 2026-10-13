# pi-lithosai

[![npm version](https://img.shields.io/npm/v/pi-lithosai.svg)](https://www.npmjs.com/package/pi-lithosai)
[![npm downloads](https://img.shields.io/npm/dm/pi-lithosai.svg)](https://www.npmjs.com/package/pi-lithosai)
[![license](https://img.shields.io/npm/l/pi-lithosai.svg)](https://github.com/WKBae/pi-lithosai/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/pi-lithosai.svg)](https://www.npmjs.com/package/pi-lithosai)
[![pi](https://img.shields.io/badge/pi-%3E%3D1.1.0-blue.svg)](https://github.com/earendil-works/pi)
[![GitHub stars](https://img.shields.io/github/stars/WKBae/pi-lithosai.svg?style=flat)](https://github.com/WKBae/pi-lithosai/stargazers)

A [LithosAI](https://docs.lithosai.com) model provider for Pi. Model metadata comes from a catalog bundled with the package. Responses stream through LithosAI's OpenAI-compatible `POST /chat/completions` endpoint, using Pi's built-in OpenAI Chat Completions implementation for message conversion, tool calls, reasoning, usage accounting, and cancellation.

Requires Pi 1.1.0 or later and Node.js 22.19.0 or later.

## Installation

```bash
pi install npm:pi-lithosai
```

To try the package for one session without installing it, run `pi -e npm:pi-lithosai`. To run from a local checkout, see [Development](#development).

## Quick start

1. Create a key on the [LithosAI API Keys](https://console.lithosai.cloud/keys) page.
2. Run `/login lithosai` in Pi and paste the key.
3. Run `/model` and select a LithosAI model.

Or from the command line:

```bash
export LITHOSAI_API_KEY="your-key"
pi --list-models lithosai
pi --provider lithosai --model moonshotai/Kimi-K3-fast --thinking high
```

Choose a model that your LithosAI organization can access.

## Commands

| Command | Description |
| --- | --- |
| `/login lithosai` | Store a LithosAI API key in Pi's credential store |
| `/model` | Select a model, including LithosAI models |
| `/lithosai-models` | List the registered LithosAI models |

## Authentication

Pi resolves credentials in this order:

1. The `--api-key` command-line option
2. A stored `lithosai` credential from `/login lithosai`
3. The `LITHOSAI_API_KEY` environment variable

Do not put API keys in `models.json` or commit them to a repository.

## Model catalog

The model catalog in `src/models.json` is captured from the [LithosAI Console](https://console.lithosai.cloud/models) and bundled with the package. The extension does not fetch it from the API at runtime. You can list models without credentials or a network connection. Only inference requires an API key.

The official `/models` API does not provide context window or pricing information. The Console's `/api/models` response includes both, so it supplies the metadata Pi needs to configure model limits and report costs.

The extension registers models with `status: "available"` and the `chat` capability. If a model ID appears more than once, the first entry is used. Check the [LithosAI Models](https://console.lithosai.cloud/models) page for current model limits and capabilities.

### Field mapping

| Catalog field | Pi setting |
| --- | --- |
| `modelId`, `displayName` | Model ID and display name |
| `contextTokens`, `maxOutputTokens` | Context window and maximum output tokens |
| `vision` in `capabilities` | Image input |
| `reasoning` in `capabilities` | Reasoning support |
| `mark` | Reasoning levels (see below) |
| `inputMicros`, `outputMicros`, `cachedInputMicros` | Input, output, and cache-read prices |

The catalog stores prices in microdollars per million tokens. Pi stores prices in dollars per million tokens, so the extension divides them by 1,000,000. The catalog has no cache-write price, so the extension sets it to zero.

### Reasoning levels

Reasoning models with `mark` set to `"deepseek"`, `"zai"`, or `"kimi"` support exactly three levels: `low`, `high`, and `max`. **Reasoning cannot be turned off for these models.** Pi changes an unsupported `--thinking` value to a supported level.

Models without a `mark`, or with any other value, use Pi's default reasoning levels.

Choose a level with `/settings` or with `--thinking low|high|max` when starting Pi.

## Model overrides

To change settings for one model, add `modelOverrides` to Pi's user configuration at `~/.pi/agent/models.json`. This file is separate from the package's bundled catalog. Use the model's exact catalog ID:

```json
{
  "providers": {
    "lithosai": {
      "modelOverrides": {
        "moonshotai/Kimi-K3-fast": {
          "maxTokens": 4096
        }
      }
    }
  }
}
```

You can also override `contextWindow`, `input` (include `"image"` only if the model supports images), `reasoning`, `thinkingLevelMap`, and `cost`. Override prices are in dollars per million tokens. Run `/reload` after editing.

## Troubleshooting

- **No LithosAI models are listed:** make sure the extension is loaded. `pi list` should show `pi-lithosai`, and `/lithosai-models` should be available.
- **401 or 403 errors:** check the key with `pi auth check`, or run `/login lithosai` again. An environment key is used only when no stored credential exists.
- **Model not found or not permitted:** make sure your organization has access to the model on the [LithosAI Models](https://console.lithosai.cloud/models) page.

## Development

```bash
git clone https://github.com/WKBae/pi-lithosai.git
cd pi-lithosai
npm ci --ignore-scripts
npm run check        # type check and tests
npm pack --dry-run   # inspect the published files
```

Run the checkout in Pi with `pi -e .`, or install it with `pi install /path/to/pi-lithosai`.

Tests use temporary catalogs, fake API keys, and mocked HTTP responses. They do not call the live LithosAI API.

The `overrides` field in `package.json` keeps the development install on a single copy of each Pi 1.1.0 package. Without it, npm can install a newer, nested `@earendil-works/pi-ai`, which breaks the tests. It does not affect users who install the package.

### Publishing

The [publish workflow](.github/workflows/publish.yml) stages a package on npm when a version tag such as `v0.1.0` is pushed. The tag must match the version in `package.json`. Staging runs `npm run check` through the `prepublishOnly` script, so a failed type check or test prevents the upload. Stable versions use the `latest` npm dist-tag; prereleases such as `v0.2.0-beta.1` use `next`. The staged package becomes publicly available only after a maintainer reviews and approves it with 2FA.

Before the first automated release, configure a [trusted publisher](https://docs.npmjs.com/trusted-publishers/) in the npm settings for `pi-lithosai`:

- Provider: GitHub Actions
- Organization or user: `WKBae`
- Repository: `pi-lithosai`
- Workflow filename: `publish.yml`
- Environment name: leave empty
- Allowed actions: allow `npm stage publish` only; leave direct publishing with `npm publish` and dist-tag management disabled

If the package does not exist on npm yet, sign in locally with `npm login`, stage its first version with `npm stage publish --access public --tag latest`, and approve it as described below. Then configure the trusted publisher for subsequent releases. The workflow authenticates with OIDC and does not require an npm token secret. Complete the first automated release within two days of creating the trusted publisher configuration to prevent it from expiring.

For each release, update and commit `package.json` and `package-lock.json`, then create and push the matching version tag. For example, `npm version patch` creates a version commit and tag; push the commit and that specific tag to trigger staging.

After the workflow succeeds, review the staged package in npm's **Staged Packages** tab, or use the CLI while signed in as a maintainer:

```bash
npm stage list pi-lithosai
npm stage view <stage-id>
npm stage download <stage-id>  # download the tarball for inspection
npm stage approve <stage-id>   # publish after 2FA verification
```

Use the stage ID from the workflow output or `npm stage list`. Approval publishes the staged artifact with its selected `latest` or `next` dist-tag.

### Updating the catalog

The authenticated [LithosAI Console models page](https://console.lithosai.cloud/models) requests [`https://console.lithosai.cloud/api/models`](https://console.lithosai.cloud/api/models). Its JSON response has exactly the format used by `src/models.json`, including the top-level `models` array, so no field conversion is needed.

To refresh the bundled catalog:

1. Sign in to the LithosAI Console and open the models page.
2. Open the browser's developer tools and select the **Network** tab. Reload the page to capture its requests.
3. Find the request to `/api/models` and copy its complete JSON response body.
4. Replace the contents of `src/models.json` with that response, preserving the top-level object and all model entries.
5. Run `npm run check`, then run `/reload` or restart Pi when using the local checkout.

The extension reads the file once at load time and resolves its path relative to the package, not the working directory. An empty model list registers no models. A missing file, malformed JSON, or an invalid entry prevents the extension from loading.

## References

- [Documentation index](https://docs.lithosai.com/llms.txt)
- [OpenAPI specification](https://docs.lithosai.com/openapi.yaml)
- [Authentication](https://docs.lithosai.com/authentication)
- [Pi integration](https://docs.lithosai.com/agent-integrations/pi)
- [Chat Completions](https://docs.lithosai.com/api-reference/chat/create-a-chat-completion)

## Acknowledgments

The provider registration and authentication structure was inspired by `@aliou/pi-synthetic`.

## License

[MIT](LICENSE)
